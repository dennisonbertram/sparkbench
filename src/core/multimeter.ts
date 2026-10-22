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
    const [lo, hi] = bp.span ?? [Math.min(...cols), Math.max(...cols)];
    const rows = bp.kind === 'esp32' ? 'bcdefghi' : bp.kind === 'nicla' ? 'bcdefgh' : bp.kind === 'pico' || bp.kind === 'cobbler' ? 'cdefgh' : bp.kind === 'module' ? 'ab' : '';
    for (let c = lo; c <= hi + (bp.kind === 'esp32' ? 4 : 0); c++) {
      for (const r of rows) out.add(`${r}${c}`);
      if (bp.flat) out.add(`T+${c}`).add(`T-${c}`);
    }
  }
  return out;
}

/** "the OLED display SCL", "resistor R2", "LED D1 + leg": a part's pin in words a beginner can find. */
function pinName(project: Project, partId: string, pin: string): string {
  const part = project.parts.find((p) => p.id === partId)!;
  const def = partDef(part.type);
  const ref = part.ref ?? part.id;
  const f = project.features?.find((x) => x.parts[0] === partId);
  const name = f ? `${f.label} (${ref})` : `${def.name.split(' (')[0].replace(/ \d.*$/, '').toLowerCase()} ${ref}`;
  if (part.type === 'led') return `${name} ${pin === 'A' ? '+ (long) leg' : '− (short) leg'}`;
  if (def.pins.length <= 2 && !['electrolytic', 'buzzer', 'diode'].includes(part.type)) return name;
  return `${name} ${pin.replace(/\.\d+$/, '')}`;
}

const listWords = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

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
  const battery = project.parts.find((p) => p.type === 'battery-9v');
  const supplyV = plan.railVoltage ? parseFloat(plan.railVoltage) : 0;
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
    const supply = /^(\+3V3|\+5V|VBAT|VEXT)/.test(net.name);
    const ext = project.parts.find((p) => p.type === 'dc-supply' && net.pins.some((r) => r.part === p.id));
    const gpio = board && net.pins.some((r) => project.parts.find((p) => p.id === r.part && partDef(p.type).category === 'board') && /^(GPIO|D\d|GP\d)/.test(r.pin.replace(/\.\d+$/, '')) === true);
    const members = [...new Set(net.pins.filter((r) => partDef(project.parts.find((p) => p.id === r.part)!.type).category !== 'board').map((r) => pinName(project, r.part, r.pin)))].slice(0, 3);
    const supplyName = net.name.startsWith('+3V3') ? '3.3 V supply' : net.name.startsWith('+5V') ? '5 V supply' : ext ? `external supply's + (${ext.props.volts ?? 12} V)` : battery ? `battery's + (${battery.props.volts ?? 9} V)` : `${net.name} supply`;
    const what = supply ? `the ${supplyName}${members.length ? ` (feeds ${listWords(members)})` : ''}` : members.length ? `${members.length > 1 ? 'the point joining ' : ''}${listWords(members)}` : net.name;
    const level = swings ? Math.max(...vs) : v;
    // Reads the full supply when it is right (a pull-up line, an idle input, a switched-off output…).
    const atSupply = !swings && supplyV > 0 && Math.abs(level - supplyV) < 0.2;
    const ifWrong = supply
      ? ext
        ? `If you read 0 V, the external supply isn’t reaching this point: check the adapter is plugged in, the screw terminals are tight, and its − goes to GND. Much lower than expected means the adapter is overloaded.`
        : `If you read 0 V, power isn’t reaching this point: check the red jumper to the + rail${battery ? ', and that the battery is clipped on with its leads in the + and − rails' : board ? ` and that the ${board.short} is plugged in` : ''}. Much lower than expected means something is drawing too much — feel for a hot part.`
      : v < 0.2
        ? 'This should be near 0 V. A reading near the supply voltage means it is connected to + somewhere it shouldn’t be.'
        : atSupply
          ? 'Reading the full supply here is correct. If you read 0 V, this point is shorted to ground or the part that holds it up (its pull-up resistor or the part’s own power) is missing.'
          : 'If you read 0 V, a connection to this point is missing (a leg one hole off is the usual cause). If you read the full supply voltage, the part between here and ground is missing or not touching.';
    out.push({ hole, ground, expectV: Math.round(level * 100) / 100, what, ifWrong, varies: !!gpio || swings, ...(swings ? { range: [Math.round(Math.min(...vs) * 10) / 10, Math.round(Math.max(...vs) * 10) / 10] as [number, number] } : {}) });
  }
  // Supplies first, then the rest by voltage.
  return out.sort((a, b) => Number(/supply/.test(b.what)) - Number(/supply/.test(a.what)) || b.expectV - a.expectV);
}
