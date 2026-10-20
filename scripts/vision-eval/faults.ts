// Deliberate wiring mistakes beginners really make, applied to a correct layout.
import { connectivity, diffConnectivity, type BbLayout } from '../../src/core/breadboard';
import type { EvalCase } from './layouts';

export interface Fault {
  kind: 'reversed-led' | 'shifted-leg' | 'wrong-pin' | 'missing-wire' | 'rail-swap' | 'shorted-part';
  description: string;
  /** Identifiers a correct diagnosis would mention (part refs, holes). */
  culprits: string[];
  layout: BbLayout;
}

const clone = (l: BbLayout): BbLayout => JSON.parse(JSON.stringify(l));
const col = (h: string) => Number(/(\d+)$/.exec(h)![1]);
const withCol = (h: string, c: number) => h.replace(/\d+$/, String(c));

export function faultsFor(c: EvalCase): Fault[] {
  const out: Fault[] = [];
  const L = c.layout;
  const leds = L.parts.filter((p) => p.kind === 'led');
  const resistors = L.parts.filter((p) => p.kind === 'resistor');
  // 1. LED in backwards (connectivity unchanged, polarity wrong)
  if (leds[0]) {
    const l = clone(L);
    const d = l.parts.find((p) => p.ref === leds[0].ref)!;
    [d.legs.A, d.legs.C] = [d.legs.C, d.legs.A];
    out.push({ kind: 'reversed-led', description: `${d.ref} is in backwards (anode and cathode swapped)`, culprits: [d.ref], layout: l });
  }
  // 2. A resistor leg one column off (lands in an unused strip → open circuit)
  const r = resistors[resistors.length - 1];
  if (r) {
    const l = clone(L);
    const rr = l.parts.find((p) => p.ref === r.ref)!;
    rr.legs['2'] = withCol(rr.legs['2'], col(rr.legs['2']) + 1);
    out.push({ kind: 'shifted-leg', description: `${rr.ref}'s second leg is one column off (${r.legs['2']} → ${rr.legs['2']}) — it's no longer in the strip the design needs`, culprits: [rr.ref, rr.legs['2'], r.legs['2']], layout: l });
  }
  // 3. A signal jumper on the neighbouring board pin
  const sig = L.wires.find((w) => /^[ij]\d+$/.test(w.from) && col(w.from) <= 20 && !['#d22', '#222'].includes(w.color));
  if (sig) {
    const l = clone(L);
    const w = l.wires.find((x) => x.from === sig.from && x.to === sig.to)!;
    w.from = withCol(w.from, col(w.from) - 1);
    out.push({ kind: 'wrong-pin', description: `the jumper from ${sig.from} was plugged into ${w.from} instead — the neighbouring Pico pin`, culprits: [sig.from, w.from, sig.to], layout: l });
  }
  // 4. A ground return jumper missing
  const gnd = L.wires.filter((w) => /^[ij]\d+$/.test(w.from) && w.to.startsWith('B-')).pop();
  if (gnd) {
    const l = clone(L);
    l.wires = l.wires.filter((w) => !(w.from === gnd.from && w.to === gnd.to));
    out.push({ kind: 'missing-wire', description: `the black jumper ${gnd.from} → ${gnd.to} is missing`, culprits: [gnd.from, gnd.to], layout: l });
  }
  // 5. A ground jumper plugged into the + rail instead of −
  const g2 = L.wires.find((w) => /-/.test(w.to) && /^[a-j]/.test(w.from) && col(w.from) > 20);
  if (g2) {
    const l = clone(L);
    const w = l.wires.find((x) => x.from === g2.from && x.to === g2.to)!;
    w.to = w.to.replace('-', '+');
    out.push({ kind: 'rail-swap', description: `the jumper from ${g2.from} goes to the + rail (${w.to}) instead of the − rail`, culprits: [g2.from, w.to, g2.to], layout: l });
  }
  // 6. A resistor with both legs in the same column strip (shorted out)
  if (resistors[0]) {
    const l = clone(L);
    const rr = l.parts.find((p) => p.ref === resistors[0].ref)!;
    const a = rr.legs['1'];
    rr.legs['2'] = (a[0] === 'g' ? 'i' : a[0] === 'c' || a[0] === 'b' ? 'd' : 'a') + col(a);
    out.push({ kind: 'shorted-part', description: `both of ${rr.ref}'s legs are in column ${col(a)} (same strip), so it is bypassed`, culprits: [rr.ref, rr.legs['2']], layout: l });
  }
  // Keep only faults that really change the circuit (reversal is a polarity fault by design).
  return out.filter((f) => f.kind === 'reversed-led' || diffConnectivity(connectivity(f.layout), c.nets).length > 0);
}
