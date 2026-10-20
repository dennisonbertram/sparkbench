// Schematic generation: places symbols, draws short wires to net labels / power symbols, and renders SVG.
// Board projects use a label style (board on the left, feature groups in a grid to the right);
// the classic discrete circuits get hand-drawn layouts with real wires.
import type { Net, PartInstance, Project } from './types';
import { partDef, footprintOf } from './parts';
import { annotate, buildNets, isBoardPart, pinKey } from './netlist';
import { boardFor } from './boards';
import {
  GRID,
  POWER_NETS,
  TEXT,
  defaultValue,
  dirVec,
  isPowerNet,
  rotate,
  rotateDir,
  snapUp,
  symbolFor,
  symbolLibId,
  textWidth,
  type Dir,
  type Pt,
  type SymbolDef,
  type SymPin,
} from './symbols';

// ------------------------------------------------------------------ model

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FieldText {
  x: number; // anchor point; y is the vertical centre of the text
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
  hidden?: boolean;
}

export interface PlacedSymbol {
  part: string;
  type: string;
  ref: string;
  value: string;
  footprint: string;
  libId: string;
  x: number;
  y: number;
  rot: number;
  refField: FieldText;
  valueField: FieldText;
}

export interface SchWire {
  net: string;
  a: Pt;
  b: Pt;
}

export interface SchLabel {
  net: string;
  x: number;
  y: number;
  /** Direction the text extends from the anchor. */
  dir: Dir;
  /** 'flag' = boxed label at a wire end; 'text' = plain name sitting on a wire. */
  style: 'flag' | 'text';
}

export interface SchPower {
  net: string;
  x: number;
  y: number;
  /** Direction the symbol points (ground normally 'down', supplies 'up'). */
  dir: Dir;
}

export interface SchNoConnect {
  x: number;
  y: number;
  part: string;
  pin: string;
}

export interface SchJunction {
  x: number;
  y: number;
  net: string;
}

export interface Obstacle extends Box {
  kind: 'body' | 'field' | 'label' | 'power' | 'nc';
  owner: string;
}

export interface Schematic {
  symbols: PlacedSymbol[];
  wires: SchWire[];
  labels: SchLabel[];
  power: SchPower[];
  noConnects: SchNoConnect[];
  junctions: SchJunction[];
  /** Occupied areas (symbol bodies, texts, labels) — used for overlap checks. */
  obstacles: Obstacle[];
  bounds: Box;
  nets: Net[];
  /** 'template' = hand-drawn discrete layout, 'labels' = generic label-based layout. */
  style: 'template' | 'labels';
}

const STUB = GRID;
const FIELD_H = 0.85; // half-height of a 1.27 mm text line, with a little air
const LABEL_H = 1.1;

export const labelLength = (name: string) => textWidth(name) + 2.2;
export const powerText = (net: string) => (POWER_NETS[net]?.kind === 'gnd' ? '' : net);

// ------------------------------------------------------------------ fragments (relocatable pieces of drawing)

class Frag {
  symbols: PlacedSymbol[] = [];
  wires: { a: Pt; b: Pt }[] = [];
  labels: SchLabel[] = [];
  power: SchPower[] = [];
  ncs: SchNoConnect[] = [];
  obstacles: Obstacle[] = [];
  /** Connection points (pin ends) keyed by pin key, for routing. */
  pins = new Map<string, { pt: Pt; dir: Dir }>();

  translate(dx: number, dy: number): this {
    const m = ([x, y]: Pt): Pt => [r3(x + dx), r3(y + dy)];
    for (const s of this.symbols) {
      s.x = r3(s.x + dx);
      s.y = r3(s.y + dy);
      for (const f of [s.refField, s.valueField]) (f.x = r3(f.x + dx)), (f.y = r3(f.y + dy));
    }
    this.wires = this.wires.map((w) => ({ a: m(w.a), b: m(w.b) }));
    for (const o of [...this.labels, ...this.power, ...this.ncs]) (o.x = r3(o.x + dx)), (o.y = r3(o.y + dy));
    for (const o of this.obstacles) (o.x1 += dx), (o.x2 += dx), (o.y1 += dy), (o.y2 += dy);
    for (const [k, v] of this.pins) this.pins.set(k, { pt: m(v.pt), dir: v.dir });
    return this;
  }

  merge(o: Frag): this {
    this.symbols.push(...o.symbols);
    this.wires.push(...o.wires);
    this.labels.push(...o.labels);
    this.power.push(...o.power);
    this.ncs.push(...o.ncs);
    this.obstacles.push(...o.obstacles);
    for (const [k, v] of o.pins) this.pins.set(k, v);
    return this;
  }

  bounds(): Box {
    const b: Box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    const add = (x: number, y: number) => {
      b.x1 = Math.min(b.x1, x);
      b.y1 = Math.min(b.y1, y);
      b.x2 = Math.max(b.x2, x);
      b.y2 = Math.max(b.y2, y);
    };
    for (const o of this.obstacles) add(o.x1, o.y1), add(o.x2, o.y2);
    for (const w of this.wires) add(...w.a), add(...w.b);
    if (b.x1 === Infinity) return { x1: 0, y1: 0, x2: 0, y2: 0 };
    return b;
  }

  /** Does `o` collide with anything already here? */
  collides(o: Frag, pad = 0.6): boolean {
    for (const a of o.obstacles) for (const b of this.obstacles) if (overlap(a, b, pad)) return true;
    // Wires of one fragment must not cross the other's symbols or labels.
    for (const w of o.wires) for (const b of this.obstacles) if (segHitsBox(w.a, w.b, b)) return true;
    for (const w of this.wires) for (const a of o.obstacles) if (segHitsBox(w.a, w.b, a)) return true;
    return false;
  }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const overlap = (a: Box, b: Box, pad = 0) => a.x1 < b.x2 + pad && b.x1 < a.x2 + pad && a.y1 < b.y2 + pad && b.y1 < a.y2 + pad;

function segHitsBox(a: Pt, b: Pt, box: Box): boolean {
  const x1 = Math.min(a[0], b[0]);
  const x2 = Math.max(a[0], b[0]);
  const y1 = Math.min(a[1], b[1]);
  const y2 = Math.max(a[1], b[1]);
  const e = 0.05;
  return x1 < box.x2 - e && box.x1 + e < x2 + (x1 === x2 ? e * 2 : 0) && y1 < box.y2 - e && box.y1 + e < y2 + (y1 === y2 ? e * 2 : 0);
}

const add = (p: Pt, d: Dir, len: number): Pt => {
  const [dx, dy] = dirVec(d);
  return [r3(p[0] + dx * len), r3(p[1] + dy * len)];
};
const opposite = (d: Dir): Dir => rotateDir(d, 180);
const horizontal = (d: Dir) => d === 'left' || d === 'right';

// ------------------------------------------------------------------ context

interface Ctx {
  project: Project;
  nets: Net[];
  netOf: Map<string, Net>;
  parts: Map<string, PartInstance>;
}

function makeCtx(project: Project): Ctx {
  const p = project.parts.some((x) => !x.ref) ? annotate(project) : project;
  const { nets, netOf } = buildNets(p);
  return { project: p, nets, netOf, parts: new Map(p.parts.map((x) => [x.id, x])) };
}

const netAt = (ctx: Ctx, part: string, pin: string) => ctx.netOf.get(pinKey({ part, pin }))!;

// ------------------------------------------------------------------ symbol placement

function graphicBounds(sym: SymbolDef, rot: number): Box {
  // Bounds of the drawn body (no pins), rotated.
  const pts: Pt[] = [];
  for (const g of sym.graphics) {
    if (g.kind === 'rect') pts.push([g.x1, g.y1], [g.x2, g.y2], [g.x1, g.y2], [g.x2, g.y1]);
    else if (g.kind === 'poly') pts.push(...g.pts);
    else if (g.kind === 'circle') pts.push([g.cx - g.r, g.cy - g.r], [g.cx + g.r, g.cy + g.r], [g.cx - g.r, g.cy + g.r], [g.cx + g.r, g.cy - g.r]);
    else if (g.kind === 'arc') pts.push(g.start, g.mid, g.end);
    else pts.push([g.x - 0.7, g.y - 0.7], [g.x + 0.7, g.y + 0.7]);
  }
  const r = pts.map((p) => rotate(p, rot));
  return { x1: Math.min(...r.map((p) => p[0])), y1: Math.min(...r.map((p) => p[1])), x2: Math.max(...r.map((p) => p[0])), y2: Math.max(...r.map((p) => p[1])) };
}

export function pinEnd(sym: SymbolDef, pin: SymPin, x: number, y: number, rot: number): { pt: Pt; dir: Dir } {
  const [dx, dy] = rotate([pin.x, pin.y], rot);
  return { pt: [r3(x + dx), r3(y + dy)], dir: rotateDir(pin.dir, rot) };
}

/** Vertical extent reserved for rotated pin names at the top/bottom of a box symbol. */
export function boxNameZones(sym: SymbolDef): { top: number; bottom: number } {
  const w = (d: Dir) => Math.max(0, ...sym.pins.filter((p) => p.dir === d).map((p) => textWidth(p.name)));
  const t = w('up');
  const b = w('down');
  return { top: sym.box!.y1 + (t ? t + 1.6 : 0), bottom: sym.box!.y2 - (b ? b + 1.6 : 0) };
}

function placeSymbol(f: Frag, ctx: Ctx, part: PartInstance, x: number, y: number, rot: number) {
  const def = partDef(part.type);
  const sym = symbolFor(part.type);
  const ref = part.ref ?? part.id;
  const value = defaultValue(def, part.props);
  let refField: FieldText;
  let valueField: FieldText;
  let body: Box;
  if (sym.box) {
    body = { ...sym.box };
    const z = boxNameZones(sym);
    const cy = (z.top + z.bottom) / 2;
    refField = { x: 0, y: cy - 1.0, text: ref, anchor: 'middle' };
    valueField = { x: 0, y: cy + 1.0, text: value, anchor: 'middle' };
  } else {
    body = graphicBounds(sym, rot);
    const vertical = sym.pins.some((p) => !horizontal(rotateDir(p.dir, rot)));
    if (vertical) {
      const fx = body.x2 + 1.0;
      const cy = (body.y1 + body.y2) / 2;
      refField = { x: fx, y: cy - 0.95, text: ref, anchor: 'start' };
      valueField = { x: fx, y: cy + 0.95, text: value, anchor: 'start' };
    } else {
      const cx = (body.x1 + body.x2) / 2;
      refField = { x: cx, y: body.y1 - 1.3, text: ref, anchor: 'middle' };
      valueField = { x: cx, y: body.y2 + 1.3, text: value, anchor: 'middle' };
    }
  }
  const mv = (fl: FieldText): FieldText => ({ ...fl, x: r3(fl.x + x), y: r3(fl.y + y) });
  const s: PlacedSymbol = {
    part: part.id,
    type: part.type,
    ref,
    value,
    footprint: footprintOf(part),
    libId: symbolLibId(part.type),
    x,
    y,
    rot,
    refField: mv(refField),
    valueField: mv(valueField),
  };
  f.symbols.push(s);
  f.obstacles.push({ kind: 'body', owner: part.id, x1: body.x1 + x, y1: body.y1 + y, x2: body.x2 + x, y2: body.y2 + y });
  for (const fl of [s.refField, s.valueField]) f.obstacles.push({ kind: 'field', owner: part.id, ...textBox(fl) });
  for (const p of sym.pins) f.pins.set(pinKey({ part: part.id, pin: p.name }), pinEnd(sym, p, x, y, rot));
}

export function textBox(fl: FieldText, size = TEXT): Box {
  const w = textWidth(fl.text, size);
  const x1 = fl.anchor === 'start' ? fl.x : fl.anchor === 'end' ? fl.x - w : fl.x - w / 2;
  return { x1, y1: fl.y - FIELD_H, x2: x1 + w, y2: fl.y + FIELD_H };
}

// ------------------------------------------------------------------ pin decorations (stubs, labels, power symbols, no-connects)

export function labelBox(l: { x: number; y: number; dir: Dir; style: 'flag' | 'text' }, name: string): Box {
  if (l.style === 'text') {
    const w = textWidth(name);
    return horizontal(l.dir)
      ? { x1: l.dir === 'right' ? l.x + 0.3 : l.x - 0.3 - w, y1: l.y - 2.0, x2: l.dir === 'right' ? l.x + 0.3 + w : l.x - 0.3, y2: l.y - 0.2 }
      : { x1: l.x - 2.0, y1: l.dir === 'down' ? l.y + 0.3 : l.y - 0.3 - w, x2: l.x - 0.2, y2: l.dir === 'down' ? l.y + 0.3 + w : l.y - 0.3 };
  }
  const len = labelLength(name);
  const [dx, dy] = dirVec(l.dir);
  const ex = l.x + dx * len;
  const ey = l.y + dy * len;
  return horizontal(l.dir)
    ? { x1: Math.min(l.x, ex), y1: l.y - LABEL_H, x2: Math.max(l.x, ex), y2: l.y + LABEL_H }
    : { x1: l.x - LABEL_H, y1: Math.min(l.y, ey), x2: l.x + LABEL_H, y2: Math.max(l.y, ey) };
}

export function powerBox(p: SchPower): Box {
  const t = powerText(p.net);
  const w = textWidth(t);
  const len = POWER_NETS[p.net]?.kind === 'gnd' ? 2.6 : 2.2;
  switch (p.dir) {
    case 'down':
      return { x1: p.x - Math.max(1.3, w / 2), y1: p.y, x2: p.x + Math.max(1.3, w / 2), y2: p.y + len + (t ? 2.0 : 0) };
    case 'up':
      return { x1: p.x - Math.max(1.3, w / 2), y1: p.y - len - (t ? 2.0 : 0), x2: p.x + Math.max(1.3, w / 2), y2: p.y };
    case 'right':
      return { x1: p.x, y1: p.y - 1.3, x2: p.x + len + (t ? 0.5 + w : 0), y2: p.y + 1.3 };
    default:
      return { x1: p.x - len - (t ? 0.5 + w : 0), y1: p.y - 1.3, x2: p.x, y2: p.y + 1.3 };
  }
}

function addLabel(f: Frag, l: SchLabel, owner: string) {
  f.labels.push(l);
  f.obstacles.push({ kind: 'label', owner, ...labelBox(l, l.net) });
}

function addPower(f: Frag, p: SchPower, owner: string) {
  f.power.push(p);
  f.obstacles.push({ kind: 'power', owner, ...powerBox(p) });
}

/** Label or power symbol at `pt`, facing outward along `out`. */
function terminate(f: Frag, net: Net, pt: Pt, out: Dir, owner: string, boxy: boolean) {
  const pw = POWER_NETS[net.name];
  if (pw) {
    const natural: Dir = pw.kind === 'gnd' ? 'down' : 'up';
    const dir = boxy ? out : horizontal(out) || natural === out ? natural : out;
    addPower(f, { net: net.name, x: pt[0], y: pt[1], dir }, owner);
  } else addLabel(f, { net: net.name, x: pt[0], y: pt[1], dir: out, style: 'flag' }, owner);
}

function decorate(f: Frag, ctx: Ctx, part: PartInstance, x: number, y: number, rot: number, skip: Set<string>) {
  const sym = symbolFor(part.type);
  const ends = sym.pins.map((p) => ({ p, ...pinEnd(sym, p, x, y, rot), net: netAt(ctx, part.id, p.name) }));
  const done = new Set<string>();
  const nc = (e: (typeof ends)[number]) => {
    f.ncs.push({ x: e.pt[0], y: e.pt[1], part: part.id, pin: e.p.name });
    f.obstacles.push({ kind: 'nc', owner: part.id, x1: e.pt[0] - 0.8, y1: e.pt[1] - 0.8, x2: e.pt[0] + 0.8, y2: e.pt[1] + 0.8 });
  };
  if (sym.box) {
    // Adjacent pins on one side sharing a net are joined by a short bus with a single label/symbol.
    for (const side of ['left', 'right', 'up', 'down'] as Dir[]) {
      const along = horizontal(side) ? 1 : 0;
      const ps = ends.filter((e) => e.dir === side).sort((a, b) => a.pt[along] - b.pt[along]);
      let run: typeof ps = [];
      const flush = () => {
        if (run.length > 1) {
          const tips = run.map((e) => add(e.pt, side, STUB));
          run.forEach((e, i) => f.wires.push({ a: e.pt, b: tips[i] }));
          for (let i = 1; i < tips.length; i++) f.wires.push({ a: tips[i - 1], b: tips[i] });
          terminate(f, run[0].net, tips[Math.floor((run.length - 1) / 2)], side, part.id, true);
          run.forEach((e) => done.add(e.p.name));
        }
        run = [];
      };
      for (const e of ps) {
        const ok = !skip.has(e.p.name) && e.net.pins.length > 1;
        if (!ok || (run.length && run[0].net !== e.net)) flush();
        if (ok) run.push(e);
      }
      flush();
    }
  }
  for (const e of ends) {
    if (done.has(e.p.name) || skip.has(e.p.name)) continue;
    if (e.net.pins.length < 2) {
      nc(e);
      continue;
    }
    const tip = add(e.pt, e.dir, STUB);
    f.wires.push({ a: e.pt, b: tip });
    terminate(f, e.net, tip, e.dir, part.id, !!sym.box);
  }
}

function partFrag(ctx: Ctx, part: PartInstance, rot: number, skip: Set<string>): Frag {
  const f = new Frag();
  placeSymbol(f, ctx, part, 0, 0, rot);
  decorate(f, ctx, part, 0, 0, rot, skip);
  return f;
}

// ------------------------------------------------------------------ cell layout (a feature group: chains of parts joined by short wires)

interface Link {
  key: string;
  a: { part: string; pin: string };
  b: { part: string; pin: string };
  net: Net;
  labelled: boolean;
}

const isTwoPin = (type: string) => !symbolFor(type).box && symbolFor(type).pins.length === 2;

function cellLinks(ctx: Ctx, ids: string[], banned: Set<string>): Link[] {
  const inCell = new Set(ids);
  const links: Link[] = [];
  for (const net of ctx.nets) {
    if (isPowerNet(net.name) || net.pins.length < 2) continue;
    const local = net.pins.filter((r) => inCell.has(r.part));
    if (local.length !== 2 || local[0].part === local[1].part) continue;
    const key = `${pinKey(local[0])}|${pinKey(local[1])}`;
    if (banned.has(key)) continue;
    links.push({ key, a: local[0], b: local[1], net, labelled: net.pins.length > 2 });
  }
  return links;
}

function layoutCell(ctx: Ctx, ids: string[]): Frag {
  const banned = new Set<string>();
  for (let iter = 0; iter < 32; iter++) {
    const { frag, cancelled } = tryCell(ctx, ids, banned);
    if (!cancelled.length) return frag;
    cancelled.forEach((k) => banned.add(k));
  }
  return tryCell(ctx, ids, new Set(cellLinks(ctx, ids, new Set()).map((l) => l.key))).frag;
}

function tryCell(ctx: Ctx, ids: string[], banned: Set<string>): { frag: Frag; cancelled: string[] } {
  const links = cellLinks(ctx, ids, banned);
  const linkPins = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  for (const l of links) linkPins.get(l.a.part)!.add(l.a.pin), linkPins.get(l.b.part)!.add(l.b.pin);
  const degree = (id: string) => linkPins.get(id)!.size;
  // Roots: fixed-orientation parts (boxes) with links first, so passives can turn to meet them.
  const boxy = (id: string) => +!!symbolFor(ctx.parts.get(id)!.type).box;
  const order = [...ids].sort((a, b) => +(degree(b) > 0) - +(degree(a) > 0) || boxy(b) - boxy(a) || degree(b) - degree(a) || ids.indexOf(a) - ids.indexOf(b));
  const placed = new Set<string>();
  const used = new Set<string>();
  const cancelled = new Set<string>();
  const cell = new Frag();
  let bottom = 0;
  for (const root of order) {
    if (placed.has(root)) continue;
    const cluster = partFrag(ctx, ctx.parts.get(root)!, 0, linkPins.get(root)!);
    placed.add(root);
    const queue = [root];
    while (queue.length) {
      const pid = queue.shift()!;
      for (const l of links) {
        if (used.has(l.key) || cancelled.has(l.key)) continue;
        const mine = l.a.part === pid ? l.a : l.b.part === pid ? l.b : undefined;
        if (!mine) continue;
        const other = mine === l.a ? l.b : l.a;
        if (placed.has(other.part)) {
          cancelled.add(l.key);
          continue;
        }
        const pe = cluster.pins.get(pinKey(mine))!;
        if (!horizontal(pe.dir)) {
          cancelled.add(l.key);
          continue;
        }
        const q = ctx.parts.get(other.part)!;
        const want = opposite(pe.dir);
        const qp = symbolFor(q.type).pins.find((p) => p.name === other.pin)!;
        const rot = qp.dir === want ? 0 : isTwoPin(q.type) && opposite(qp.dir) === want ? 180 : -1;
        if (rot < 0) {
          cancelled.add(l.key);
          continue;
        }
        const qf = partFrag(ctx, q, rot, linkPins.get(q.id)!);
        const qe = qf.pins.get(pinKey(other))!;
        const minGap = l.labelled ? snapUp(textWidth(l.net.name) + 1.5) + GRID : 2 * GRID;
        let ok = false;
        for (let gap = minGap; gap <= minGap + 4 * GRID && !ok; gap += GRID) {
          const target = add(pe.pt, pe.dir, gap);
          const trial = partFrag(ctx, q, rot, linkPins.get(q.id)!).translate(target[0] - qe.pt[0], target[1] - qe.pt[1]);
          const wire = new Frag();
          wire.wires.push({ a: pe.pt, b: target });
          if (l.labelled) {
            const left = pe.dir === 'right' ? pe.pt : target;
            addLabel(wire, { net: l.net.name, x: left[0], y: left[1], dir: 'right', style: 'text' }, l.net.name);
          }
          // The link wire touches both parts' pins; check it against everything else.
          if (cluster.collides(trial) || hitsOthers(cluster, wire, [mine.part]) || hitsOthers(trial, wire, [other.part])) continue;
          cluster.merge(trial).merge(wire);
          ok = true;
        }
        if (!ok) {
          cancelled.add(l.key);
          continue;
        }
        used.add(l.key);
        placed.add(other.part);
        queue.push(other.part);
      }
    }
    // Stack clusters vertically, left-aligned, on the grid.
    const b = cluster.bounds();
    const dx = snapUp(-b.x1);
    const dy = snapUp(bottom - b.y1);
    cluster.translate(dx, dy);
    bottom = cluster.bounds().y2 + 2 * GRID;
    cell.merge(cluster);
  }
  // Links that were never drawn must be labelled instead.
  for (const l of links) if (!used.has(l.key)) cancelled.add(l.key);
  return { frag: cell, cancelled: [...cancelled] };
}

/** Does the wire run through obstacles in `f` other than those owned by `own` parts' bodies at its ends? */
function hitsOthers(f: Frag, wire: Frag, own: string[]): boolean {
  for (const w of wire.wires)
    for (const o of f.obstacles) {
      if (own.includes(o.owner) && (o.kind === 'body' || o.kind === 'nc')) continue;
      if (segHitsBox(w.a, w.b, o)) return true;
    }
  for (const a of wire.obstacles) for (const o of f.obstacles) if (overlap(a, o, 0.4)) return true;
  return false;
}

// ------------------------------------------------------------------ grouping & arrangement

function cellGroups(ctx: Ctx): string[][] {
  const parts = ctx.project.parts.filter((p) => !isBoardPart(p)).map((p) => p.id);
  const parent = new Map(parts.map((id) => [id, id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const f of ctx.project.features ?? []) {
    const ids = f.parts.filter((id) => parent.has(id));
    ids.slice(1).forEach((id) => union(ids[0], id));
  }
  // Parts sharing a local (non-board, non-power) net belong together.
  for (const net of ctx.nets) {
    if (isPowerNet(net.name) || net.pins.length < 2) continue;
    if (net.pins.some((r) => !parent.has(r.part))) continue;
    net.pins.slice(1).forEach((r) => union(net.pins[0].part, r.part));
  }
  const groups = new Map<string, string[]>();
  for (const id of parts) {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(id);
  }
  return [...groups.values()];
}

/** Pack cells into columns to the right of `x0`, choosing the column count that gives a pleasant page shape. */
function arrange(cells: Frag[], x0: number, y0: number, minH: number): Frag {
  const out = new Frag();
  if (!cells.length) return out;
  const GX = 3 * GRID;
  const GY = 2 * GRID;
  const sizes = cells.map((c) => {
    const b = c.bounds();
    return { w: b.x2 - b.x1, h: b.y2 - b.y1, b };
  });
  const maxH = Math.max(...sizes.map((s) => s.h));
  const totalH = sizes.reduce((s, c) => s + c.h + GY, 0);
  let best: { cols: number[][]; score: number } | undefined;
  for (let n = 1; n <= cells.length; n++) {
    const target = Math.max(maxH, totalH / n, minH);
    const cols: number[][] = [[]];
    let h = 0;
    sizes.forEach((s, i) => {
      if (h > 0 && h + s.h / 2 > target + 0.1) {
        cols.push([]);
        h = 0;
      }
      cols[cols.length - 1].push(i);
      h += s.h + GY;
    });
    const W = x0 + cols.reduce((s, c) => s + Math.max(...c.map((i) => sizes[i].w)) + GX, 0);
    const H = Math.max(minH, ...cols.map((c) => c.reduce((s, i) => s + sizes[i].h + GY, 0)));
    // Compact sheets first, then a landscape-ish shape.
    const score = Math.log(W * H) + 0.5 * Math.abs(Math.log(W / H / 1.4));
    if (!best || score < best.score) best = { cols, score };
  }
  let x = x0;
  for (const col of best!.cols) {
    let y = y0;
    const w = Math.max(...col.map((i) => sizes[i].w));
    for (const i of col) {
      const s = sizes[i];
      cells[i].translate(snapUp(x - s.b.x1), snapUp(y - s.b.y1));
      out.merge(cells[i]);
      y = cells[i].bounds().y2 + GY;
    }
    x += w + GX;
  }
  return out;
}

// ------------------------------------------------------------------ hand-drawn discrete layouts

type Placement = [id: string, x: number, y: number, rot: number];

interface Template {
  place: Placement[];
  wires: Pt[][];
  power: SchPower[];
}

/** Build a template from pin-relative coordinates. `P(id, pin)` returns the pin end for the given placement. */
function templateFor(ctx: Ctx): ((P: (id: string, pin: string) => Pt) => Template) | undefined {
  const f = ctx.project.features?.[0];
  if (!f || ctx.project.board !== 'none' || ctx.project.features!.length !== 1) return undefined;
  if (f.kind === 'astable555') {
    const [u, bat, r1, r2, c1, c2, rl, led] = f.parts;
    const xA = -22.86;
    const xB = -35.56;
    const rail = -20.32;
    return (P) => ({
      place: [
        [u, 0, 0, 0],
        [r1, xA, -10.16, 270],
        [r2, xA, 0, 270],
        [c1, xA, 10.16, 270],
        [bat, xB, -2.54, 270],
        [c2, P(u, 'CTRL')[0], P(u, 'CTRL')[1] + 7.62, 270],
        [rl, P(u, 'OUT')[0] + 7.62, P(u, 'OUT')[1], 0],
        [led, P(u, 'OUT')[0] + 17.78, P(u, 'OUT')[1] + 5.08, 270],
      ],
      wires: [
        [P(bat, '+'), [xB, rail], [xA, rail], [P(u, 'RESET')[0], rail], [P(u, 'VCC')[0], rail], P(u, 'VCC')],
        [P(r1, '1'), [xA, rail]],
        [P(u, 'RESET'), [P(u, 'RESET')[0], rail]],
        [P(r1, '2'), P(u, 'DIS')],
        [P(r2, '2'), [-15.24, P(u, 'THR')[1]], P(u, 'THR')],
        [P(u, 'TRIG'), [-15.24, P(u, 'TRIG')[1]], [-15.24, P(u, 'THR')[1]]],
        [P(u, 'CTRL'), P(c2, '1')],
        [P(u, 'OUT'), P(rl, '1')],
        [P(rl, '2'), P(led, 'A')],
      ],
      power: [
        { net: 'VBAT', x: xB, y: rail, dir: 'up' },
        { net: 'GND', x: P(bat, '-')[0], y: P(bat, '-')[1], dir: 'down' },
        { net: 'GND', x: P(c1, '-')[0], y: P(c1, '-')[1], dir: 'down' },
        { net: 'GND', x: P(c2, '2')[0], y: P(c2, '2')[1], dir: 'down' },
        { net: 'GND', x: P(u, 'GND')[0], y: P(u, 'GND')[1], dir: 'down' },
        { net: 'GND', x: P(led, 'C')[0], y: P(led, 'C')[1], dir: 'down' },
      ],
    });
  }
  if (f.kind === 'transistor-led') {
    const [q, bat, sw, rb, rl, led] = f.parts;
    const rail = -35.56;
    const xB = -45.72;
    return (P) => ({
      place: [
        [q, 0, 0, 0],
        [led, 2.54, -12.7, 270],
        [rl, 2.54, -25.4, 270],
        [rb, -12.7, 0, 0],
        [sw, -27.94, 0, 0],
        [bat, xB, -2.54, 270],
      ],
      wires: [
        [P(led, 'C'), P(q, 'C')],
        [P(rl, '2'), P(led, 'A')],
        [P(rb, '2'), P(q, 'B')],
        [P(sw, '2'), P(rb, '1')],
        [P(bat, '+'), [xB, rail], [P(sw, '1')[0], rail], [P(rl, '1')[0], rail], P(rl, '1')],
        [P(sw, '1'), [P(sw, '1')[0], rail]],
      ],
      power: [
        { net: 'VBAT', x: xB, y: rail, dir: 'up' },
        { net: 'GND', x: P(bat, '-')[0], y: P(bat, '-')[1], dir: 'down' },
        { net: 'GND', x: P(q, 'E')[0], y: P(q, 'E')[1], dir: 'down' },
      ],
    });
  }
  return undefined;
}

function buildTemplate(ctx: Ctx): Frag | undefined {
  const make = templateFor(ctx);
  if (!make) return undefined;
  // Two passes: the first resolves placements, the second evaluates pin positions against them.
  const where = new Map<string, Placement>();
  const P = (id: string, pin: string): Pt => {
    const pl = where.get(id);
    const part = ctx.parts.get(id);
    if (!part) throw new Error(`template: missing part ${id}`);
    const sym = symbolFor(part.type);
    const sp = sym.pins.find((p) => p.name === pin);
    if (!sp) throw new Error(`template: no pin ${pin} on ${id}`);
    return pinEnd(sym, sp, pl ? pl[1] : 0, pl ? pl[2] : 0, pl ? pl[3] : 0).pt;
  };
  try {
    for (let pass = 0; pass < 3; pass++) for (const pl of make(P).place) where.set(pl[0], pl);
    const t = make(P);
    if (ctx.project.parts.length !== t.place.length) return undefined;
    const f = new Frag();
    for (const [id, x, y, rot] of t.place) placeSymbol(f, ctx, ctx.parts.get(id)!, x, y, rot);
    for (const path of t.wires) for (let i = 1; i < path.length; i++) f.wires.push({ a: path[i - 1], b: path[i] });
    for (const p of t.power) addPower(f, p, p.net);
    // Any pin the template leaves unconnected gets a no-connect flag.
    const ends = new Set([...f.wires.flatMap((w) => [w.a, w.b]), ...t.power.map((p): Pt => [p.x, p.y])].map(ptKey));
    const pinPts = new Map<string, number>();
    for (const v of f.pins.values()) pinPts.set(ptKey(v.pt), (pinPts.get(ptKey(v.pt)) ?? 0) + 1);
    for (const [k, v] of f.pins) {
      if (!ends.has(ptKey(v.pt)) && pinPts.get(ptKey(v.pt))! < 2) {
        const r = k.split(':');
        f.ncs.push({ x: v.pt[0], y: v.pt[1], part: r[0], pin: r.slice(1).join(':') });
      }
    }
    return f;
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------ finishing: split wires, name nets, junctions

const ptKey = ([x, y]: Pt) => `${r3(x)},${r3(y)}`;

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  const e = 1e-6;
  if (a[0] === b[0]) return Math.abs(p[0] - a[0]) < e && p[1] > Math.min(a[1], b[1]) + e && p[1] < Math.max(a[1], b[1]) - e;
  if (a[1] === b[1]) return Math.abs(p[1] - a[1]) < e && p[0] > Math.min(a[0], b[0]) + e && p[0] < Math.max(a[0], b[0]) - e;
  return false;
}

/** Split wires wherever another connection point lands on their interior (KiCad connects those too). */
function splitWires(wires: { a: Pt; b: Pt }[], points: Pt[]): { a: Pt; b: Pt }[] {
  const all = [...points, ...wires.flatMap((w) => [w.a, w.b])];
  const out: { a: Pt; b: Pt }[] = [];
  for (const w of wires) {
    if (ptKey(w.a) === ptKey(w.b)) continue;
    const cuts = all.filter((p) => onSegment(p, w.a, w.b));
    const axis = w.a[0] === w.b[0] ? 1 : 0;
    const sign = Math.sign(w.b[axis] - w.a[axis]);
    const seq = [w.a, ...uniqPts(cuts).sort((p, q) => (p[axis] - q[axis]) * sign), w.b];
    for (let i = 1; i < seq.length; i++) out.push({ a: seq[i - 1], b: seq[i] });
  }
  const seen = new Set<string>();
  return out.filter((w) => {
    const k = [ptKey(w.a), ptKey(w.b)].sort().join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const uniqPts = (ps: Pt[]) => [...new Map(ps.map((p) => [ptKey(p), p])).values()];

/** Union-find over drawn geometry (wires, labels and power symbols by name, pins by position). */
function geometry(sch: Pick<Schematic, 'symbols' | 'wires' | 'labels' | 'power'>) {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const w of sch.wires) union(`P${ptKey(w.a)}`, `P${ptKey(w.b)}`);
  for (const l of sch.labels) union(`P${ptKey([l.x, l.y])}`, `N${l.net}`);
  for (const p of sch.power) union(`P${ptKey([p.x, p.y])}`, `N${p.net}`);
  const pins = new Map<string, string>();
  for (const s of sch.symbols) {
    const sym = symbolFor(s.type);
    for (const p of sym.pins) pins.set(pinKey({ part: s.part, pin: p.name }), `P${ptKey(pinEnd(sym, p, s.x, s.y, s.rot).pt)}`);
  }
  return { find, pins, at: (p: Pt) => find(`P${ptKey(p)}`) };
}

/** Connected-cluster id of every pin in the drawing. Shared by tests. */
export function drawnConnectivity(sch: Pick<Schematic, 'symbols' | 'wires' | 'labels' | 'power'>): Map<string, string> {
  const g = geometry(sch);
  return new Map([...g.pins].map(([k, v]) => [k, g.find(v)]));
}

/** Compare drawn connectivity with the project's nets. Returns human-readable problems (empty = identical). */
export function verifySchematic(sch: Schematic, project: Project): string[] {
  const conn = drawnConnectivity(sch);
  const { nets } = buildNets(project);
  const problems: string[] = [];
  const clusterNet = new Map<string, string>();
  for (const net of nets) {
    const ids = new Set(net.pins.map((r) => conn.get(pinKey(r))));
    if (ids.size > 1) problems.push(`net ${net.name} is split in the drawing`);
    for (const id of ids) {
      if (!id) continue;
      const prev = clusterNet.get(id);
      if (prev && prev !== net.name) problems.push(`nets ${prev} and ${net.name} are shorted in the drawing`);
      clusterNet.set(id, net.name);
    }
  }
  return problems;
}

function finish(ctx: Ctx, f: Frag, style: Schematic['style']): Schematic {
  const anchorPts: Pt[] = [...f.pins.values()].map((v) => v.pt);
  anchorPts.push(...f.labels.map((l): Pt => [l.x, l.y]), ...f.power.map((p): Pt => [p.x, p.y]));
  const raw = splitWires(f.wires, anchorPts);
  // Name every wire after the net of the pins it reaches.
  const draft = { symbols: f.symbols, wires: raw.map((w) => ({ ...w, net: '' })), labels: f.labels, power: f.power };
  const g = geometry(draft);
  const clusterName = new Map<string, string>();
  for (const l of [...f.labels, ...f.power]) clusterName.set(g.find(`N${l.net}`), l.net);
  for (const [k, v] of g.pins) clusterName.set(g.find(v), ctx.netOf.get(k)?.name ?? '');
  const wires: SchWire[] = draft.wires.map((w) => ({ a: w.a, b: w.b, net: clusterName.get(g.at(w.a)) ?? '' }));
  // Junctions: three or more things meeting at a point.
  const count = new Map<string, number>();
  const bump = (p: Pt) => count.set(ptKey(p), (count.get(ptKey(p)) ?? 0) + 1);
  wires.forEach((w) => (bump(w.a), bump(w.b)));
  [...f.pins.values()].forEach((v) => bump(v.pt));
  f.power.forEach((p) => bump([p.x, p.y]));
  const junctions: SchJunction[] = [];
  const seen = new Set<string>();
  for (const w of wires)
    for (const p of [w.a, w.b]) {
      const k = ptKey(p);
      if (count.get(k)! >= 3 && !seen.has(k)) {
        seen.add(k);
        junctions.push({ x: p[0], y: p[1], net: w.net });
      }
    }
  const b = f.bounds();
  return {
    symbols: f.symbols,
    wires,
    labels: f.labels,
    power: f.power,
    noConnects: f.ncs,
    junctions,
    obstacles: f.obstacles,
    bounds: b,
    nets: ctx.nets,
    style,
  };
}

// ------------------------------------------------------------------ entry point

export function buildSchematic(project: Project): Schematic {
  const ctx = makeCtx(project);
  const tpl = buildTemplate(ctx);
  if (tpl) {
    const sch = finish(ctx, tpl, 'template');
    if (!verifySchematic(sch, ctx.project).length) return sch;
  }
  const board = ctx.project.parts.find(isBoardPart);
  const all = new Frag();
  let x0 = 0;
  let y0 = 0;
  let minH = 0;
  if (board) {
    const bf = partFrag(ctx, board, 0, new Set());
    const b = bf.bounds();
    bf.translate(snapUp(-b.x1), snapUp(-b.y1));
    const bb = bf.bounds();
    all.merge(bf);
    x0 = bb.x2 + 4 * GRID;
    y0 = bb.y1;
    minH = bb.y2 - bb.y1;
  }
  const cells = cellGroups(ctx).map((ids) => layoutCell(ctx, ids));
  all.merge(arrange(cells, x0, y0, minH));
  return finish(ctx, all, 'labels');
}

// ------------------------------------------------------------------ SVG rendering

export interface SvgOptions {
  highlightNet?: string;
  theme?: 'light' | 'dark';
}

const THEMES = {
  light: {
    bg: '#ffffff',
    frame: '#c9d1dc',
    line: '#7a2420',
    body: '#fffbea',
    wire: '#0b7a52',
    pinName: '#3b4452',
    pinNum: '#8a94a3',
    ref: '#1d3f8f',
    value: '#4b5563',
    label: '#14532d',
    labelFill: '#ecfdf3',
    power: '#b42318',
    gnd: '#374151',
    nc: '#2563eb',
    text: '#111827',
    muted: '#6b7280',
    hl: '#f59e0b',
  },
  dark: {
    bg: '#11161d',
    frame: '#2b3542',
    line: '#e8a49c',
    body: '#1d2530',
    wire: '#4ade80',
    pinName: '#c3cad5',
    pinNum: '#7c8796',
    ref: '#93c5fd',
    value: '#a7b0bd',
    label: '#bbf7d0',
    labelFill: '#132a1f',
    power: '#fca5a5',
    gnd: '#cbd5e1',
    nc: '#60a5fa',
    text: '#e5e7eb',
    muted: '#9ca3af',
    hl: '#fbbf24',
  },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => String(Math.round(v * 100) / 100);
const SVG_CHAR = 0.6; // monospace advance in em

function arcPath(s: Pt, m: Pt, e: Pt): string {
  // Circle through three points → SVG arc.
  const [ax, ay] = s;
  const [bx, by] = m;
  const [cx, cy] = e;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const sweep = cross > 0 ? 1 : 0;
  const a0 = Math.atan2(ay - uy, ax - ux);
  const a2 = Math.atan2(cy - uy, cx - ux);
  let delta = sweep ? a2 - a0 : a0 - a2;
  while (delta < 0) delta += 2 * Math.PI;
  return `M${n(ax)} ${n(ay)}A${n(r)} ${n(r)} 0 ${delta > Math.PI ? 1 : 0} ${sweep} ${n(cx)} ${n(cy)}`;
}

function svgSymbol(s: PlacedSymbol, sym: SymbolDef, netName: (pin: string) => string): string {
  const out: string[] = [];
  const fillOf = (fl?: string) => (fl === 'body' ? 'var(--sb-body)' : fl === 'solid' ? 'var(--sb-line)' : 'none');
  for (const g of sym.graphics) {
    if (g.kind === 'rect') out.push(`<rect x="${n(Math.min(g.x1, g.x2))}" y="${n(Math.min(g.y1, g.y2))}" width="${n(Math.abs(g.x2 - g.x1))}" height="${n(Math.abs(g.y2 - g.y1))}" fill="${fillOf(g.fill)}"/>`);
    else if (g.kind === 'poly') out.push(`<polyline points="${g.pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}" fill="${fillOf(g.fill)}"${g.width ? ` stroke-width="${g.width}"` : ''}/>`);
    else if (g.kind === 'circle') out.push(`<circle cx="${n(g.cx)}" cy="${n(g.cy)}" r="${n(g.r)}" fill="${fillOf(g.fill)}"/>`);
    else if (g.kind === 'arc') out.push(`<path d="${arcPath(g.start, g.mid, g.end)}" fill="none"${g.width ? ` stroke-width="${g.width}"` : ''}/>`);
    else {
      // counter-rotate so symbol text stays upright
      out.push(`<text class="st" x="${n(g.x)}" y="${n(g.y)}" font-size="${g.size ?? TEXT}"${s.rot ? ` transform="rotate(${s.rot} ${n(g.x)} ${n(g.y)})"` : ''}>${esc(g.text)}</text>`);
    }
  }
  const pins: string[] = [];
  for (const p of sym.pins) {
    const [dx, dy] = dirVec(p.dir);
    const bx = p.x - dx * p.length;
    const by = p.y - dy * p.length;
    pins.push(`<line class="pin" x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(bx)}" y2="${n(by)}" data-pin="${esc(p.name)}" data-net="${esc(netName(p.name))}"/>`);
  }
  const texts: string[] = [];
  if (sym.box) {
    const b = sym.box;
    for (const p of sym.pins) {
      const mid = p.length / 2;
      if (p.dir === 'left' || p.dir === 'right') {
        const left = p.dir === 'left';
        texts.push(`<text class="pn" x="${n(left ? b.x1 + 0.7 : b.x2 - 0.7)}" y="${n(p.y)}" text-anchor="${left ? 'start' : 'end'}">${esc(p.name)}</text>`);
        texts.push(`<text class="pnum" x="${n(left ? p.x + mid : p.x - mid)}" y="${n(p.y - 0.55)}">${esc(p.number)}</text>`);
      } else {
        const top = p.dir === 'up';
        const ty = top ? b.y1 + 0.7 : b.y2 - 0.7;
        texts.push(`<text class="pn" x="${n(p.x)}" y="${n(ty)}" text-anchor="${top ? 'end' : 'start'}" transform="rotate(-90 ${n(p.x)} ${n(ty)})">${esc(p.name)}</text>`);
        const ny = top ? p.y + mid : p.y - mid;
        texts.push(`<text class="pnum" x="${n(p.x - 0.55)}" y="${n(ny)}" transform="rotate(-90 ${n(p.x - 0.55)} ${n(ny)})">${esc(p.number)}</text>`);
      }
    }
  }
  const tr = `translate(${n(s.x)} ${n(s.y)})${s.rot ? ` rotate(${-s.rot})` : ''}`;
  const field = (f: FieldText, cls: string) => (f.hidden ? '' : `<text class="${cls}" x="${n(f.x)}" y="${n(f.y)}" text-anchor="${f.anchor}">${esc(f.text)}</text>`);
  return (
    `<g class="sym" data-part="${esc(s.part)}" data-ref="${esc(s.ref)}">` +
    `<title>${esc(s.ref)} — ${esc(s.value)}</title>` +
    `<g transform="${tr}"><g class="body">${out.join('')}</g>${pins.join('')}${texts.join('')}</g>` +
    field(s.refField, 'ref') +
    field(s.valueField, 'val') +
    `</g>`
  );
}

function svgPower(p: SchPower, hl: boolean): string {
  const kind = POWER_NETS[p.net]?.kind ?? 'supply';
  const natural: Dir = kind === 'gnd' ? 'down' : 'up';
  // rotation (screen degrees, clockwise positive) that turns the natural direction into p.dir
  const order: Dir[] = ['up', 'right', 'down', 'left'];
  const deg = ((order.indexOf(p.dir) - order.indexOf(natural) + 4) % 4) * 90;
  const shape =
    kind === 'gnd'
      ? `<path d="M0 0V1.27M-1.27 1.27H1.27M-0.76 1.9H0.76M-0.25 2.54H0.25"/>`
      : `<path d="M0 0V-1.9M-1.27 -1.9H1.27"/>`;
  const t = powerText(p.net);
  let text = '';
  if (t) {
    const [tx, ty, anchor] =
      p.dir === 'up' ? [p.x, p.y - 3.1, 'middle'] : p.dir === 'down' ? [p.x, p.y + 3.1, 'middle'] : p.dir === 'right' ? [p.x + 2.5, p.y, 'start'] : [p.x - 2.5, p.y, 'end'];
    text = `<text class="pwt" x="${n(tx as number)}" y="${n(ty as number)}" text-anchor="${anchor}">${esc(t)}</text>`;
  }
  return `<g class="pwr ${kind}${hl ? ' hl' : ''}" data-net="${esc(p.net)}"><g transform="translate(${n(p.x)} ${n(p.y)}) rotate(${deg})">${shape}</g>${text}</g>`;
}

function svgLabel(l: SchLabel, hl: boolean): string {
  const cls = `lbl${hl ? ' hl' : ''}`;
  if (l.style === 'text') {
    const [tx, ty, rotA] = l.dir === 'right' ? [l.x + 0.4, l.y - 0.6, 0] : l.dir === 'left' ? [l.x - 0.4, l.y - 0.6, 0] : [l.x - 0.6, l.y + (l.dir === 'down' ? 0.4 : -0.4), -90];
    const anchor = l.dir === 'left' || l.dir === 'up' ? 'end' : 'start';
    return `<text class="${cls} on" data-net="${esc(l.net)}" x="${n(tx)}" y="${n(ty)}" text-anchor="${l.dir === 'up' ? 'start' : anchor}"${rotA ? ` transform="rotate(${rotA} ${n(tx)} ${n(ty)})"` : ''}>${esc(l.net)}</text>`;
  }
  const w = l.net.length * SVG_CHAR * TEXT + 1.2;
  const h = 1.0;
  // Drawn pointing right from the origin, then rotated into place.
  const deg = { right: 0, down: 90, left: 180, up: 270 }[l.dir];
  const flip = l.dir === 'left' || l.dir === 'up';
  const tx = w / 2 + 0.2;
  const text = `<text x="${n(tx)}" y="0" text-anchor="middle"${flip ? ` transform="rotate(180 ${n(tx)} 0)"` : ''}>${esc(l.net)}</text>`;
  return `<g class="${cls}" data-net="${esc(l.net)}" transform="translate(${n(l.x)} ${n(l.y)}) rotate(${deg})"><path d="M0 0L0.6 ${-h}H${n(w + 0.4)}V${h}H0.6Z"/>${text}</g>`;
}

export function renderSchematicSvg(project: Project, opts: SvgOptions = {}): string {
  const sch = buildSchematic(project);
  const theme = THEMES[opts.theme ?? 'light'];
  const hlNet = opts.highlightNet;
  const netName = new Map<string, string>();
  for (const net of sch.nets) for (const r of net.pins) netName.set(pinKey(r), net.name);

  // Frame + title block around the content.
  const c = sch.bounds;
  const M = 8;
  const TBW = 76;
  const TBH = 17;
  const fx1 = c.x1 - M;
  const fy1 = c.y1 - M;
  const fx2 = Math.max(c.x2 + M, fx1 + TBW + 20);
  const fy2 = c.y2 + M + TBH + 2;
  const vb = { x: fx1 - 3, y: fy1 - 3, w: fx2 - fx1 + 6, h: fy2 - fy1 + 6 };
  const date = new Date(project.updatedAt || Date.now()).toISOString().slice(0, 10);
  const bdef = boardFor(project.board);
  const tbx = fx2 - TBW;
  const tby = fy2 - TBH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" class="sb-schematic sb-${opts.theme ?? 'light'}" viewBox="${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}" width="${n(vb.w * 4)}" height="${n(vb.h * 4)}" font-family="'JetBrains Mono','SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace">`,
  );
  parts.push(`<title>${esc(project.name)} — schematic</title>`);
  const v = (k: keyof typeof theme) => `var(--sb-${k},${theme[k]})`;
  parts.push(
    `<style>` +
      `.sb-schematic{${Object.entries(theme)
        .map(([k, val]) => `--sb-${k}:${val};`)
        .join('')}}` +
      `.sb-schematic text{font-size:${TEXT}px;dominant-baseline:central;fill:${v('text')}}` +
      `.sb-schematic .body{stroke:${v('line')};stroke-width:0.254;stroke-linejoin:round;stroke-linecap:round}` +
      `.sb-schematic .pin{stroke:${v('line')};stroke-width:0.254}` +
      `.sb-schematic .st{fill:${v('line')};stroke:none;text-anchor:middle}` +
      `.sb-schematic .pn{fill:${v('pinName')};font-size:1.15px}` +
      `.sb-schematic .pnum{fill:${v('pinNum')};font-size:0.9px;text-anchor:middle;dominant-baseline:auto}` +
      `.sb-schematic .ref{fill:${v('ref')};font-weight:700}` +
      `.sb-schematic .val{fill:${v('value')}}` +
      `.sb-schematic .w{stroke:${v('wire')};stroke-width:0.3;stroke-linecap:round}` +
      `.sb-schematic .j{fill:${v('wire')}}` +
      `.sb-schematic .lbl path{fill:${v('labelFill')};stroke:${v('wire')};stroke-width:0.22}` +
      `.sb-schematic .lbl text{fill:${v('label')};font-size:1.15px}` +
      `.sb-schematic text.lbl.on{fill:${v('label')};dominant-baseline:auto}` +
      `.sb-schematic .pwr path{stroke:${v('power')};stroke-width:0.3;fill:none;stroke-linecap:round}` +
      `.sb-schematic .pwr.gnd path{stroke:${v('gnd')}}` +
      `.sb-schematic .pwt{fill:${v('power')};font-weight:700;font-size:1.15px}` +
      `.sb-schematic .nc{stroke:${v('nc')};stroke-width:0.25}` +
      `.sb-schematic .frame{fill:none;stroke:${v('frame')};stroke-width:0.35}` +
      `.sb-schematic .tb text{fill:${v('text')}}` +
      `.sb-schematic .tb .mut{fill:${v('muted')};font-size:1.1px}` +
      `.sb-schematic .sym{cursor:pointer}` +
      `.sb-schematic .sym:hover .body{stroke-width:0.4}` +
      `.sb-schematic .hl.w,.sb-schematic .w.hl{stroke:${v('hl')};stroke-width:0.6}` +
      `.sb-schematic .j.hl{fill:${v('hl')}}` +
      `.sb-schematic .lbl.hl path{stroke:${v('hl')};stroke-width:0.45}` +
      `.sb-schematic .pwr.hl path{stroke:${v('hl')};stroke-width:0.5}` +
      `.sb-schematic .pin.hl{stroke:${v('hl')};stroke-width:0.5}` +
      `</style>`,
  );
  parts.push(`<rect x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.w)}" height="${n(vb.h)}" fill="${v('bg')}"/>`);
  parts.push(`<rect class="frame" x="${n(fx1)}" y="${n(fy1)}" width="${n(fx2 - fx1)}" height="${n(fy2 - fy1)}" rx="1"/>`);

  // Wires first so symbols and labels sit on top.
  parts.push(`<g class="wires">`);
  for (const w of sch.wires) parts.push(`<line class="w${w.net === hlNet ? ' hl' : ''}" data-net="${esc(w.net)}" x1="${n(w.a[0])}" y1="${n(w.a[1])}" x2="${n(w.b[0])}" y2="${n(w.b[1])}"/>`);
  for (const j of sch.junctions) parts.push(`<circle class="j${j.net === hlNet ? ' hl' : ''}" data-net="${esc(j.net)}" cx="${n(j.x)}" cy="${n(j.y)}" r="0.5"/>`);
  parts.push(`</g>`);

  parts.push(`<g class="symbols">`);
  for (const s of sch.symbols) {
    let g = svgSymbol(s, symbolFor(s.type), (pin) => netName.get(pinKey({ part: s.part, pin })) ?? '');
    if (hlNet) g = g.replace(new RegExp(`class="pin" ([^>]*data-net="${esc(hlNet).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")`, 'g'), 'class="pin hl" $1');
    parts.push(g);
  }
  parts.push(`</g>`);

  parts.push(`<g class="labels">`);
  for (const l of sch.labels) parts.push(svgLabel(l, l.net === hlNet));
  for (const p of sch.power) parts.push(svgPower(p, p.net === hlNet));
  for (const x of sch.noConnects) {
    const d = 0.7;
    parts.push(`<path class="nc" data-part="${esc(x.part)}" data-pin="${esc(x.pin)}" d="M${n(x.x - d)} ${n(x.y - d)}L${n(x.x + d)} ${n(x.y + d)}M${n(x.x - d)} ${n(x.y + d)}L${n(x.x + d)} ${n(x.y - d)}"/>`);
  }
  parts.push(`</g>`);

  // Title block
  parts.push(
    `<g class="tb"><rect class="frame" x="${n(tbx)}" y="${n(tby)}" width="${TBW}" height="${TBH}"/>` +
      `<line class="frame" x1="${n(tbx)}" y1="${n(tby + 7)}" x2="${n(fx2)}" y2="${n(tby + 7)}"/>` +
      `<line class="frame" x1="${n(tbx)}" y1="${n(tby + 12)}" x2="${n(fx2)}" y2="${n(tby + 12)}"/>` +
      `<line class="frame" x1="${n(tbx + 46)}" y1="${n(tby + 7)}" x2="${n(tbx + 46)}" y2="${n(fy2)}"/>` +
      `<text x="${n(tbx + 2)}" y="${n(tby + 2.2)}" class="mut">TITLE</text>` +
      `<text x="${n(tbx + 2)}" y="${n(tby + 4.8)}" style="font-size:2.2px;font-weight:700">${esc(project.name)}</text>` +
      `<text x="${n(tbx + 2)}" y="${n(tby + 9.5)}" class="mut">${esc(bdef ? bdef.name : 'Discrete circuit')}</text>` +
      `<text x="${n(tbx + 48)}" y="${n(tby + 9.5)}" class="mut">Date ${date}</text>` +
      `<text x="${n(tbx + 2)}" y="${n(tby + 14.5)}" style="font-weight:700">Sparkbench</text>` +
      `<text x="${n(tbx + 48)}" y="${n(tby + 14.5)}" class="mut">Sheet 1/1 · Rev A</text>` +
      `</g>`,
  );
  parts.push(`</svg>`);
  return parts.join('');
}
