// Guided multimeter checks: where to put the probes on the breadboard and what you should read,
// using the circuit solver's voltages for a correct build. "Red probe in j12, black in a − rail
// hole: about 2.0 V. If you read 0 V, the + rail isn't reaching it."
import type { Project } from './types';
import { buildNets } from './netlist';
import { planBreadboard } from './bbplace';
import { stripOf, ROWS_TOP, ROWS_BOTTOM } from './breadboard';
import { partDef } from './parts';
import { boardFor } from './boards';

export interface MeterCheck {
  /** Hole for the red probe; the black one goes on a − rail. */
  hole: string;
  ground: string;
  expectV: number;
  what: string;
  /** Plain advice if the reading is far off. */
  ifWrong: string;
  /** The value changes while it runs (GPIO-driven or oscillating). */
  varies: boolean;
  /** For readings that swing: lowest and highest seen in the simulator. */
  range?: [number, number];
}

/** Holes covered by a board or module body (a probe can't reach them). */
function covered(plan: ReturnType<typeof planBreadboard>): Set<string> {
  const out = new Set<string>();
  for (const bp of plan.layout.parts) {
    const cols = Object.values(bp.legs).map((h) => Number(/\d+$/.exec(h)![0]));
    const lo = Math.min(...cols);
    const hi = Math.max(...cols);
    const rows = bp.kind === 'esp32' ? 'bcdefghi' : bp.kind === 'pico' || bp.kind === 'cobbler' ? 'cdefgh' : bp.kind === 'module' ? 'ab' : '';
    for (let c = lo; c <= hi + (bp.kind === 'esp32' ? 4 : 0); c++) for (const r of rows) out.add(`${r}${c}`);
  }
  return out;
}

/** `samples`: net id → voltages over a short run (one per snapshot). */
export function multimeterChecks(project: Project, samples: Record<string, number[]>): MeterCheck[] {
  const plan = planBreadboard(project);
  if (plan.problems.length) return [];
  const { nets } = buildNets(project);
  const used = new Set([...plan.layout.parts.flatMap((p) => Object.values(p.legs)), ...plan.layout.wires.flatMap((w) => [w.from, w.to]), ...covered(plan)]);
  const refById = new Map(project.parts.map((p) => [p.id, p.ref ?? p.id]));
  const board = boardFor(project.board);
  // Strip of each placed pin.
  const stripOfPin = new Map<string, string>();
  const partByRef = new Map(project.parts.map((p) => [p.ref ?? p.id, p]));
  for (const bp of plan.layout.parts) {
    const part = partByRef.get(bp.ref);
    if (!part) continue;
    for (const [pin, h] of Object.entries(bp.legs)) stripOfPin.set(`${part.id}:${pin}`, stripOf(h));
  }
  const freeIn = (strip: string): string | undefined => {
    if (strip.startsWith('rail')) {
      const rail = strip.slice(4);
      for (let c = 2; c < 63; c++) if (c % 6 && !used.has(`${rail}${c}`)) return `${rail}${c}`;
      return undefined;
    }
    const col = strip.slice(1);
    const rows = strip.startsWith('T') ? ROWS_TOP : ROWS_BOTTOM;
    return [...rows].map((r) => `${r}${col}`).find((h) => !used.has(h));
  };
  const ground = freeIn('railB-') ?? freeIn('railT-') ?? 'a − rail hole';
  const out: MeterCheck[] = [];
  for (const net of nets) {
    if (net.pins.length < 2 || /^GND/.test(net.name)) continue;
    const vs = samples[net.id];
    if (!vs?.length) continue;
    const v = vs.reduce((a, b) => a + b, 0) / vs.length;
    const swings = Math.max(...vs) - Math.min(...vs) > 0.3;
    const strips = [...new Set(net.pins.map((r) => stripOfPin.get(`${r.part}:${r.pin}`)).filter((s): s is string => !!s))];
    const hole = strips.map(freeIn).find(Boolean);
    if (!hole) continue;
    const supply = /^(\+3V3|\+5V|VBAT)/.test(net.name);
    const gpio = board && net.pins.some((r) => project.parts.find((p) => p.id === r.part && partDef(p.type).category === 'board') && /^(GPIO|D\d|GP\d)/.test(r.pin.replace(/\.\d+$/, '')) === true);
    const members = net.pins
      .filter((r) => partDef(project.parts.find((p) => p.id === r.part)!.type).category !== 'board')
      .map((r) => `${refById.get(r.part)} ${r.pin}`)
      .slice(0, 3)
      .join(', ');
    const what = supply ? `the ${net.name.replace('+', '')} supply${members ? ` (feeds ${members})` : ''}` : members ? `the point joining ${members}` : net.name;
    const ifWrong = supply
      ? 'If you read 0 V, power isn’t reaching this point: check the red jumper to the + rail and that the board is plugged in. Much lower than expected means something is drawing too much — feel for a hot part.'
      : v < 0.2
        ? 'This should be near 0 V. A reading near the supply voltage means it is connected to + somewhere it shouldn’t be.'
        : 'If you read 0 V, a connection to this point is missing (a leg one hole off is the usual cause). If you read the full supply voltage, the part between here and ground is missing or not touching.';
    out.push({ hole, ground, expectV: Math.round((swings ? Math.max(...vs) : v) * 100) / 100, what, ifWrong, varies: !!gpio || swings, ...(swings ? { range: [Math.round(Math.min(...vs) * 10) / 10, Math.round(Math.max(...vs) * 10) / 10] as [number, number] } : {}) });
  }
  // Supplies first, then the rest by voltage.
  return out.sort((a, b) => Number(/supply/.test(b.what)) - Number(/supply/.test(a.what)) || b.expectV - a.expectV);
}
