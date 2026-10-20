// KiCad export: .kicad_sch (KiCad 8 format, opens in KiCad 8–10), a minimal .kicad_pro and a netlist.
// Geometry comes from buildSchematic(), so the KiCad drawing matches the in-app schematic.
import type { Project } from './types';
import { partDef } from './parts';
import { annotate, buildNets } from './netlist';
import { buildSchematic, powerText, type FieldText, type SchPower } from './schematic';
import { LIB, POWER_NETS, allSymbols, defaultValue, pinNumber, snapUp, symbolFor, textWidth, type Dir, type Graphic, type SymbolDef, type SymPin } from './symbols';

/** File base name used for the KiCad files (and the project name inside them). */
export function kicadName(project: Project): string {
  return project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

// ------------------------------------------------------------------ s-expression helpers

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
const f = (v: number) => {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
};
const font = (hide = false, justify?: string, size = 1.27) => `(effects (font (size ${size} ${size}))${justify ? ` (justify ${justify})` : ''}${hide ? ' hide' : ''})`;

/** Deterministic UUIDs so re-exports diff cleanly. */
function uuidGen(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let s = h >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    const hex = Array.from({ length: 32 }, () => Math.floor(rnd() * 16).toString(16));
    hex[12] = '4';
    hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
    const x = hex.join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  };
}

// ------------------------------------------------------------------ library symbols

const PIN_ANGLE: Record<Dir, number> = { left: 0, right: 180, up: 270, down: 90 };
const fillOf = (fl?: string) => `(fill (type ${fl === 'body' ? 'background' : fl === 'solid' ? 'outline' : 'none'}))`;
const stroke = (w = 0) => `(stroke (width ${w}) (type default))`;

function graphicSexpr(g: Graphic): string {
  // Library symbols are Y-up.
  switch (g.kind) {
    case 'rect':
      return `(rectangle (start ${f(g.x1)} ${f(-g.y1)}) (end ${f(g.x2)} ${f(-g.y2)}) ${stroke(0.254)} ${fillOf(g.fill)})`;
    case 'poly':
      return `(polyline (pts ${g.pts.map(([x, y]) => `(xy ${f(x)} ${f(-y)})`).join(' ')}) ${stroke(g.width ?? 0)} ${fillOf(g.fill)})`;
    case 'circle':
      return `(circle (center ${f(g.cx)} ${f(-g.cy)}) (radius ${f(g.r)}) ${stroke(0.254)} ${fillOf(g.fill)})`;
    case 'arc':
      return `(arc (start ${f(g.start[0])} ${f(-g.start[1])}) (mid ${f(g.mid[0])} ${f(-g.mid[1])}) (end ${f(g.end[0])} ${f(-g.end[1])}) ${stroke(g.width ?? 0)} ${fillOf()})`;
    case 'text':
      return `(text ${q(g.text)} (at ${f(g.x)} ${f(-g.y)} 0) ${font(false, undefined, g.size ?? 1.27)})`;
  }
}

function pinSexpr(p: SymPin): string {
  return `(pin ${p.type} line (at ${f(p.x)} ${f(-p.y)} ${PIN_ANGLE[p.dir]}) (length ${f(p.length)}) (name ${q(p.name)} ${font()}) (number ${q(p.number)} ${font()}))`;
}

function libSymbol(s: SymbolDef, value: string): string {
  const box = !!s.box;
  const head = box ? '(pin_names (offset 1.016))' : '(pin_numbers hide) (pin_names (offset 0) hide)';
  const prefix = partDef(s.type).refPrefix;
  return [
    `(symbol ${q(`${LIB}:${s.name}`)} ${head} (exclude_from_sim no) (in_bom yes) (on_board yes)`,
    `(property "Reference" ${q(prefix)} (at 0 0 0) ${font()})`,
    `(property "Value" ${q(value)} (at 0 0 0) ${font()})`,
    `(property "Footprint" ${q(partDef(s.type).kicad.footprint ?? '')} (at 0 0 0) ${font(true)})`,
    `(property "Datasheet" "" (at 0 0 0) ${font(true)})`,
    `(property "Description" ${q(s.description)} (at 0 0 0) ${font(true)})`,
    `(symbol ${q(`${s.name}_0_1`)} ${s.graphics.map(graphicSexpr).join(' ')})`,
    `(symbol ${q(`${s.name}_1_1`)} ${s.pins.map(pinSexpr).join(' ')})`,
    `)`,
  ].join('\n    ');
}

// Power symbols, matching KiCad's own power library graphics.
function powerLib(name: string, kind: 'gnd' | 'supply' | 'flag'): string {
  const body =
    kind === 'gnd'
      ? `(polyline (pts (xy 0 0) (xy 0 -1.27) (xy 1.27 -1.27) (xy 0 -2.54) (xy -1.27 -1.27) (xy 0 -1.27)) ${stroke()} ${fillOf()})`
      : kind === 'supply'
        ? `(polyline (pts (xy -0.762 1.27) (xy 0 2.54)) ${stroke()} ${fillOf()}) (polyline (pts (xy 0 2.54) (xy 0.762 1.27)) ${stroke()} ${fillOf()}) (polyline (pts (xy 0 0) (xy 0 2.54)) ${stroke()} ${fillOf()})`
        : `(polyline (pts (xy 0 0) (xy 0 1.27) (xy -1.016 1.905) (xy 0 2.54) (xy 1.016 1.905) (xy 0 1.27)) ${stroke()} ${fillOf()})`;
  const pin = `(pin ${kind === 'flag' ? 'power_out' : 'power_in'} line (at 0 0 ${kind === 'gnd' ? 270 : 90}) (length 0) hide (name "" ${font()}) (number "1" ${font()}))`;
  return [
    `(symbol ${q(`power:${name}`)} (power) (pin_numbers hide) (pin_names (offset 0) hide) (exclude_from_sim no) (in_bom yes) (on_board yes)`,
    `(property "Reference" ${q(kind === 'flag' ? '#FLG' : '#PWR')} (at 0 0 0) ${font(true)})`,
    `(property "Value" ${q(name)} (at 0 ${kind === 'gnd' ? -3.81 : 3.556} 0) ${font()})`,
    `(property "Footprint" "" (at 0 0 0) ${font(true)})`,
    `(property "Datasheet" "" (at 0 0 0) ${font(true)})`,
    `(property "Description" ${q(kind === 'flag' ? 'Special symbol for telling ERC where power comes from' : `Power symbol creates a global label with name "${name}"`)} (at 0 0 0) ${font(true)})`,
    `(symbol ${q(`${name}_0_1`)} ${body})`,
    `(symbol ${q(`${name}_1_1`)} ${pin})`,
    `)`,
  ].join('\n    ');
}

// ------------------------------------------------------------------ schematic

const PAPERS: [string, number, number][] = [
  ['A4', 297, 210],
  ['A3', 420, 297],
  ['A2', 594, 420],
  ['A1', 841, 594],
  ['A0', 1189, 841],
];

const ROT_OF: Record<Dir, number> = { right: 0, up: 90, left: 180, down: 270 };

/** Rotation that turns a power symbol's natural direction into `dir` (KiCad rotations are counter-clockwise). */
function powerRot(p: SchPower): number {
  const natural = POWER_NETS[p.net]?.kind === 'gnd' ? 'down' : 'up';
  return (ROT_OF[p.dir] - ROT_OF[natural] + 360) % 360;
}

export function exportKicadSchematic(project: Project): string {
  const proj = project.parts.some((p) => !p.ref) ? annotate(project) : project;
  const sch = buildSchematic(proj);
  const name = kicadName(proj);
  const uuid = uuidGen(`${proj.id}:${name}`);
  const root = uuid();

  // Fit the drawing on a sheet, clear of KiCad's title block in the bottom-right corner.
  const b = sch.bounds;
  const w = b.x2 - b.x1;
  const h = b.y2 - b.y1;
  const [paper, pw, ph] = PAPERS.find(([, W, H]) => w + 30 <= W && h + 70 <= H) ?? PAPERS[PAPERS.length - 1];
  const ox = snapUp(Math.max(15, (pw - w) / 2) - b.x1);
  const oy = snapUp(Math.max(15, (ph - 45 - h) / 2) - b.y1);
  const X = (x: number) => f(x + ox);
  const Y = (y: number) => f(y + oy);

  const out: string[] = [];
  out.push(`(kicad_sch (version 20231120) (generator "sparkbench") (generator_version "1.0")`);
  out.push(`  (uuid ${q(root)})`);
  out.push(`  (paper ${q(paper)})`);
  const date = new Date(proj.updatedAt || Date.now()).toISOString().slice(0, 10);
  out.push(`  (title_block (title ${q(proj.name)}) (date ${q(date)}) (rev "A") (company "Sparkbench") (comment 1 ${q(proj.summary ?? '')}))`);

  // Embedded library: our symbols for every part type used, plus the power symbols.
  const used = [...new Set(sch.symbols.map((s) => s.type))];
  const powerNames = [...new Set(sch.power.map((p) => p.net))];
  // A PWR_FLAG is only needed where nothing drives a power net (boards and batteries normally do).
  const drivers = new Set<string>();
  const { nets } = buildNets(proj);
  for (const net of nets)
    for (const r of net.pins) {
      const part = proj.parts.find((p) => p.id === r.part)!;
      if (symbolFor(part.type).pins.find((p) => p.name === r.pin)?.type === 'power_out') drivers.add(net.name);
    }
  const flags = powerNames.filter((n) => !drivers.has(n));
  out.push(`  (lib_symbols`);
  for (const t of used) {
    const def = partDef(t);
    out.push(`    ${libSymbol(symbolFor(t), defaultValue(def))}`);
  }
  for (const n of [...new Set(powerNames.map((n) => POWER_NETS[n].lib))]) out.push(`    ${powerLib(n, POWER_NETS[powerNames.find((x) => POWER_NETS[x].lib === n)!].kind)}`);
  if (flags.length) out.push(`    ${powerLib('PWR_FLAG', 'flag')}`);
  out.push(`  )`);

  for (const j of sch.junctions) out.push(`  (junction (at ${X(j.x)} ${Y(j.y)}) (diameter 0) (color 0 0 0 0) (uuid ${q(uuid())}))`);
  for (const nc of sch.noConnects) out.push(`  (no_connect (at ${X(nc.x)} ${Y(nc.y)}) (uuid ${q(uuid())}))`);
  for (const wr of sch.wires) out.push(`  (wire (pts (xy ${X(wr.a[0])} ${Y(wr.a[1])}) (xy ${X(wr.b[0])} ${Y(wr.b[1])})) ${stroke()} (uuid ${q(uuid())}))`);
  for (const l of sch.labels) {
    const angle = ROT_OF[l.dir];
    const just = angle === 180 || angle === 270 ? 'right bottom' : 'left bottom';
    out.push(`  (label ${q(l.net)} (at ${X(l.x)} ${Y(l.y)} ${angle}) ${font(false, just)} (uuid ${q(uuid())}))`);
  }

  const instance = (ref: string) => `(instances (project ${q(name)} (path ${q(`/${root}`)} (reference ${q(ref)}) (unit 1))))`;
  // Fields are placed in sheet coordinates; KiCad turns field angles with the symbol, so compensate.
  const field = (key: string, fl: FieldText, rot: number, hide = false) => {
    const w = textWidth(fl.text);
    const cx = fl.anchor === 'start' ? fl.x + w / 2 : fl.anchor === 'end' ? fl.x - w / 2 : fl.x;
    return `(property ${q(key)} ${q(fl.text)} (at ${X(cx)} ${Y(fl.y)} ${rot % 180 ? 90 : 0}) ${font(hide)})`;
  };

  for (const s of sch.symbols) {
    const sym = symbolFor(s.type);
    out.push(
      `  (symbol (lib_id ${q(s.libId)}) (at ${X(s.x)} ${Y(s.y)} ${s.rot}) (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid ${q(uuid())})\n` +
        `    ${field('Reference', s.refField, s.rot)}\n` +
        `    ${field('Value', s.valueField, s.rot)}\n` +
        `    (property "Footprint" ${q(s.footprint)} (at ${X(s.x)} ${Y(s.y)} 0) ${font(true)})\n` +
        `    (property "Datasheet" "" (at ${X(s.x)} ${Y(s.y)} 0) ${font(true)})\n` +
        `    ${sym.pins.map((p) => `(pin ${q(p.number)} (uuid ${q(uuid())}))`).join(' ')}\n` +
        `    ${instance(s.ref)})`,
    );
  }

  let pwr = 0;
  const powerInstance = (lib: string, value: string, x: number, y: number, rot: number, valueAt: [number, number], hideValue: boolean, flag = false) => {
    const ref = flag ? `#FLG0${++pwr}` : `#PWR0${String(++pwr).padStart(2, '0')}`;
    return (
      `  (symbol (lib_id ${q(lib)}) (at ${X(x)} ${Y(y)} ${rot}) (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid ${q(uuid())})\n` +
      `    (property "Reference" ${q(ref)} (at ${X(x)} ${Y(y)} 0) ${font(true)})\n` +
      `    (property "Value" ${q(value)} (at ${X(valueAt[0])} ${Y(valueAt[1])} ${rot % 180 ? 90 : 0}) ${font(hideValue)})\n` +
      `    (property "Footprint" "" (at ${X(x)} ${Y(y)} 0) ${font(true)})\n` +
      `    (property "Datasheet" "" (at ${X(x)} ${Y(y)} 0) ${font(true)})\n` +
      `    (pin "1" (uuid ${q(uuid())}))\n` +
      `    ${instance(ref)})`
    );
  };
  for (const p of sch.power) {
    const t = powerText(p.net);
    const tw = textWidth(t);
    const at: [number, number] =
      p.dir === 'up' ? [p.x, p.y - 3.3] : p.dir === 'down' ? [p.x, p.y + 3.8] : p.dir === 'right' ? [p.x + 3.0 + tw / 2, p.y] : [p.x - 3.0 - tw / 2, p.y];
    out.push(powerInstance(`power:${POWER_NETS[p.net].lib}`, p.net, p.x, p.y, powerRot(p), at, !t));
  }
  for (const n of flags) {
    const p = sch.power.find((x) => x.net === n)!;
    // Point the flag sideways so it does not sit on the power symbol's stub.
    const dir: Dir = p.dir === 'left' || p.dir === 'right' ? 'up' : 'right';
    const rot = (ROT_OF[dir] - ROT_OF.up + 360) % 360;
    out.push(powerInstance('power:PWR_FLAG', 'PWR_FLAG', p.x, p.y, rot, [p.x + 4.5, p.y], true, true));
  }

  out.push(`  (sheet_instances (path "/" (page "1")))`);
  out.push(`)`);
  return out.join('\n') + '\n';
}

// ------------------------------------------------------------------ project file

export function exportKicadProject(project: Project): string {
  const name = kicadName(project);
  const root = uuidGen(`${project.id}:${name}`)();
  const pro = {
    board: { design_settings: {}, layer_presets: [], viewports: [] },
    boards: [],
    libraries: { pinned_footprint_libs: [], pinned_symbol_libs: [] },
    meta: { filename: `${name}.kicad_pro`, version: 1 },
    net_settings: { classes: [{ name: 'Default', clearance: 0.2, track_width: 0.25, via_diameter: 0.6, via_drill: 0.3, wire_width: 6, bus_width: 12 }], meta: { version: 3 } },
    schematic: { legacy_lib_dir: '', legacy_lib_list: [], drawing: { default_text_size: 50 } },
    sheets: [[root, 'Root']],
    text_variables: { PROJECT_NAME: project.name, GENERATOR: 'Sparkbench' },
  };
  return JSON.stringify(pro, null, 2) + '\n';
}

// ------------------------------------------------------------------ netlist (KiCad "E" format)

export function exportKicadNetlist(project: Project): string {
  const proj = project.parts.some((p) => !p.ref) ? annotate(project) : project;
  const { nets } = buildNets(proj);
  const name = kicadName(proj);
  const uuid = uuidGen(`${proj.id}:${name}:net`);
  const date = new Date(proj.updatedAt || Date.now()).toISOString();
  const byId = new Map(proj.parts.map((p) => [p.id, p]));
  const out: string[] = [];
  out.push(`(export (version "E")`);
  out.push(`  (design (source ${q(`${name}.kicad_sch`)}) (date ${q(date)}) (tool "Sparkbench")`);
  out.push(`    (sheet (number "1") (name "/") (tstamps "/") (title_block (title ${q(proj.name)}) (company "Sparkbench") (rev "A") (date ${q(date.slice(0, 10))}))))`);
  out.push(`  (components`);
  for (const p of proj.parts) {
    const def = partDef(p.type);
    const sym = symbolFor(p.type);
    const value = defaultValue(def, p.props);
    out.push(
      `    (comp (ref ${q(p.ref ?? p.id)}) (value ${q(value)}) (footprint ${q(def.kicad.footprint ?? '')}) (description ${q(def.name)})` +
        ` (fields (field (name "Footprint") ${q(def.kicad.footprint ?? '')}) (field (name "Datasheet")) (field (name "Description") ${q(def.description)}))` +
        ` (libsource (lib ${q(LIB)}) (part ${q(sym.name)}) (description ${q(def.name)}))` +
        ` (property (name "Sparkbench_id") (value ${q(p.id)})) (sheetpath (names "/") (tstamps "/")) (tstamps ${q(uuid())}))`,
    );
  }
  out.push(`  )`);
  out.push(`  (libparts`);
  for (const sym of allSymbols().filter((s) => proj.parts.some((p) => p.type === s.type))) {
    out.push(
      `    (libpart (lib ${q(LIB)}) (part ${q(sym.name)}) (description ${q(sym.description)}) (fields (field (name "Reference") ${q(partDef(sym.type).refPrefix)}))` +
        ` (pins ${sym.pins.map((p) => `(pin (num ${q(p.number)}) (name ${q(p.name)}) (type ${q(p.type)}))`).join(' ')}))`,
    );
  }
  out.push(`  )`);
  out.push(`  (nets`);
  let code = 1;
  const node = (r: { part: string; pin: string }) => {
    const part = byId.get(r.part)!;
    const sp = symbolFor(part.type).pins.find((p) => p.name === r.pin)!;
    return `(node (ref ${q(part.ref ?? part.id)}) (pin ${q(pinNumber(part.type, r.pin))}) (pinfunction ${q(r.pin)}) (pintype ${q(sp.type)}))`;
  };
  for (const net of nets) {
    const nm = net.pins.length > 1 ? net.name : `unconnected-(${byId.get(net.pins[0].part)!.ref}-${net.pins[0].pin}-Pad${pinNumber(byId.get(net.pins[0].part)!.type, net.pins[0].pin)})`;
    out.push(`    (net (code ${q(String(code++))}) (name ${q(nm)}) ${net.pins.map(node).join(' ')})`);
  }
  out.push(`  )`);
  out.push(`)`);
  return out.join('\n') + '\n';
}
