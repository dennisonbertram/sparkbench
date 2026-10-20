// Turn wires into nets (connected pin groups) and give the nets meaningful names.
import type { Net, PinRef, Project, PartInstance } from './types';
import { partDef } from './parts';
import { boardFor, boardPin, internalGroup } from './boards';

export const pinKey = (r: PinRef) => `${r.part}:${r.pin}`;

export function parsePinKey(k: string): PinRef {
  const i = k.indexOf(':');
  return { part: k.slice(0, i), pin: k.slice(i + 1) };
}

class DSU {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (this.parent.get(c) !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function isBoardPart(p: PartInstance): boolean {
  return partDef(p.type).category === 'board';
}

export function boardPart(project: Project): PartInstance | undefined {
  return project.parts.find(isBoardPart);
}

/** All nets in the project, including single-pin "unconnected" nets for every pin (so callers can look up any pin). */
export function buildNets(project: Project): { nets: Net[]; netOf: Map<string, Net> } {
  const dsu = new DSU();
  const allPins: PinRef[] = [];
  for (const part of project.parts) {
    const def = partDef(part.type);
    for (const pin of def.pins) {
      const ref = { part: part.id, pin: pin.name };
      allPins.push(ref);
      dsu.find(pinKey(ref));
    }
    // Pins tied together inside a board (GND.1 and GND.2, 3V3.1 and 3V3.2…)
    if (def.category === 'board') {
      const groups = new Map<string, string>();
      for (const pin of def.pins) {
        const g = internalGroup(pin.name);
        if (g === pin.name && !/^(GND|3V3|5V)/.test(pin.name)) continue;
        const k = pinKey({ part: part.id, pin: pin.name });
        if (groups.has(g)) dsu.union(groups.get(g)!, k);
        else groups.set(g, k);
      }
    }
  }
  for (const w of project.wires) {
    const ka = pinKey(w.a);
    const kb = pinKey(w.b);
    if (!dsu.parent.has(ka) || !dsu.parent.has(kb)) continue; // dangling wire to a removed part
    dsu.union(ka, kb);
  }
  const groups = new Map<string, PinRef[]>();
  for (const ref of allPins) {
    const r = dsu.find(pinKey(ref));
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(ref);
  }
  const nets: Net[] = [];
  const netOf = new Map<string, Net>();
  let i = 1;
  const used = new Set<string>();
  const board = boardPart(project);
  const bdef = boardFor(project.board);
  // Name nets: prefer power/ground and GPIO names from the board.
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  for (const pins of ordered) {
    let name = '';
    const bpins = board && bdef ? pins.filter((r) => r.part === board.id).map((r) => boardPin(bdef, r.pin)!).filter(Boolean) : [];
    if (bpins.some((b) => b.role === 'gnd')) name = 'GND';
    else {
      const pw = bpins.find((b) => b.role === 'power');
      if (pw) name = pw.voltage === 3.3 ? '+3V3' : '+5V';
      else {
        const g = bpins.find((b) => b.gpio !== undefined);
        if (g) {
          // Only mention the pin's special function (SDA, SCK…) when the net actually uses it.
          const fns = pins.map((r) => project.parts.find((x) => x.id === r.part)).filter(Boolean).flatMap((part, i) => {
            const pd = partDef(part!.type).pins.find((x) => x.name === pins[i].pin);
            return pd?.fn ? [pd.fn] : [];
          });
          const alt = (g.alt ?? []).map((x) => x.replace(/^I2C\d_/, '')).find((x) => fns.some((fn) => fn.toUpperCase().endsWith(x.replace(/\d$/, '').toUpperCase())));
          name = `GPIO${g.gpio}${alt ? '_' + alt : ''}`;
        }
      }
    }
    if (!name) {
      // Battery terminals / gnd-role pins of standalone circuits
      for (const r of pins) {
        const part = project.parts.find((x) => x.id === r.part)!;
        const pd = partDef(part.type).pins.find((x) => x.name === r.pin)!;
        if (part.type === 'battery-9v') name = r.pin === '+' ? 'VBAT' : 'GND';
        else if (pd.role === 'gnd' && pins.length > 1 && !board) name = 'GND';
        if (name) break;
      }
    }
    if (!name || used.has(name)) {
      if (name === 'GND' || name === '+3V3' || name === '+5V' || name === 'VBAT') {
        // Merge-by-name is the caller's job; keep unique names.
        name = `${name}_${i}`;
      } else name = pins.length > 1 ? `N${i}` : `NC_${pins[0].part}_${pins[0].pin}`;
    }
    used.add(name);
    const net: Net = { id: `N${i++}`, name, pins };
    nets.push(net);
    for (const r of pins) netOf.set(pinKey(r), net);
  }
  return { nets, netOf };
}

/** Assign reference designators (R1, R2, U1…) deterministically, by part order. */
export function annotate(project: Project): Project {
  const counts = new Map<string, number>();
  const parts = project.parts.map((part) => {
    const def = partDef(part.type);
    const n = (counts.get(def.refPrefix) ?? 0) + 1;
    counts.set(def.refPrefix, n);
    return { ...part, ref: `${def.refPrefix}${n}` };
  });
  return { ...project, parts };
}

export function connectedPins(project: Project, ref: PinRef): PinRef[] {
  const { netOf } = buildNets(project);
  const net = netOf.get(pinKey(ref));
  return net ? net.pins.filter((r) => pinKey(r) !== pinKey(ref)) : [];
}

export function partById(project: Project, id: string): PartInstance | undefined {
  return project.parts.find((p) => p.id === id);
}

export function displayPin(project: Project, ref: PinRef): string {
  const part = partById(project, ref.part);
  if (!part) return pinKey(ref);
  return `${part.ref ?? part.id}.${ref.pin}`;
}
