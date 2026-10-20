// Ground-truth breadboard builds for the vision experiment, each with its intended circuit.
import { picoLegs, picoAccess, type BbLayout, type BbPart, type BbWire } from '../../src/core/breadboard';

export interface EvalCase {
  id: string;
  title: string;
  layout: BbLayout;
  /** Intended nets as REF.pin groups (what the circuit must connect). */
  nets: string[][];
  /** Plain-English description of the circuit (condition A). */
  circuit: string;
}

const pico = (): BbPart => ({ ref: 'U1', kind: 'pico', legs: picoLegs() });
const W = (from: string, to: string, color: string): BbWire => ({ from, to, color });
const powerWires = (): BbWire[] => [W(picoAccess('3V3'), 'T+5', '#d22'), W(picoAccess('GND.8'), 'T-3', '#222'), W(picoAccess('GND.1'), 'B-3', '#222')];

/** LED chain: GPIO → resistor (legs gCol, gCol+4) → LED anode (h col+4), cathode (h col+5) → GND rail. */
function ledChain(pin: string, col: number, r: string, d: string, color: string, ohms: number, wire: string): { parts: BbPart[]; wires: BbWire[] } {
  return {
    parts: [
      { ref: r, kind: 'resistor', ohms, legs: { '1': `g${col}`, '2': `g${col + 4}` } },
      { ref: d, kind: 'led', color, legs: { A: `h${col + 4}`, C: `h${col + 5}` } },
    ],
    wires: [W(picoAccess(pin), `j${col}`, wire), W(`j${col + 5}`, `B-${col + 5}`, '#222')],
  };
}

const PICO_GND = ['U1.GND'];
const merge = (...xs: { parts: BbPart[]; wires: BbWire[] }[]) => ({ parts: xs.flatMap((x) => x.parts), wires: xs.flatMap((x) => x.wires) });

export const CASES: EvalCase[] = [];

{
  const led = ledChain('GP15', 24, 'R1', 'D1', 'red', 220, '#2a9d3a');
  CASES.push({
    id: 'blink',
    title: 'Pico blink',
    layout: { name: 'blink', parts: [pico(), ...led.parts], wires: [...powerWires(), ...led.wires] },
    nets: [['R1.1', 'U1.GP15'], ['D1.A', 'R1.2'], ['D1.C', ...PICO_GND], ['U1.3V3']].filter((n) => n.length > 1),
    circuit: 'Raspberry Pi Pico U1. GP15 → 220 Ω resistor R1 → red LED D1 anode (+); D1 cathode (−, flat side) → GND. The Pico 3V3 pin feeds the top + rail and its GND pins feed both − rails.',
  });
}
{
  const a = ledChain('GP2', 24, 'R1', 'D1', 'red', 220, '#2a9d3a');
  const b = ledChain('GP3', 32, 'R2', 'D2', 'yellow', 220, '#8e24aa');
  const c = ledChain('GP4', 40, 'R3', 'D3', 'green', 220, '#1e88e5');
  const m = merge(a, b, c);
  CASES.push({
    id: 'traffic',
    title: 'Pico traffic light',
    layout: { name: 'traffic', parts: [pico(), ...m.parts], wires: [...powerWires(), ...m.wires] },
    nets: [['R1.1', 'U1.GP2'], ['D1.A', 'R1.2'], ['R2.1', 'U1.GP3'], ['D2.A', 'R2.2'], ['R3.1', 'U1.GP4'], ['D3.A', 'R3.2'], ['D1.C', 'D2.C', 'D3.C', ...PICO_GND]],
    circuit: 'Raspberry Pi Pico U1. GP2 → 220 Ω R1 → red LED D1 → GND. GP3 → 220 Ω R2 → yellow LED D2 → GND. GP4 → 220 Ω R3 → green LED D3 → GND. Each LED: anode (+) toward its resistor, cathode (−, flat side) to GND. 3V3 feeds the top + rail; GND feeds both − rails.',
  });
}
{
  const led = ledChain('GP15', 24, 'R1', 'D1', 'green', 220, '#2a9d3a');
  const btn = { parts: [{ ref: 'SW1', kind: 'button' as const, legs: { '1': 'f50', '2': 'f52' }, color: '#c22' }], wires: [W(picoAccess('GP14'), 'j50', '#f9a825'), W('j52', 'B-52', '#222')] };
  const m = merge(led, btn);
  CASES.push({
    id: 'button',
    title: 'Pico button + LED',
    layout: { name: 'button', parts: [pico(), ...m.parts], wires: [...powerWires(), ...m.wires] },
    nets: [['R1.1', 'U1.GP15'], ['D1.A', 'R1.2'], ['SW1.1', 'U1.GP14'], ['D1.C', 'SW1.2', ...PICO_GND]],
    circuit: 'Raspberry Pi Pico U1. Push button SW1 between GP14 and GND (internal pull-up). GP15 → 220 Ω R1 → green LED D1 anode; D1 cathode → GND. 3V3 feeds the top + rail; GND feeds both − rails.',
  });
}
{
  const led = ledChain('GP15', 24, 'R2', 'D1', 'white', 47, '#2a9d3a');
  const ldr = {
    parts: [
      { ref: 'R1', kind: 'ldr' as const, legs: { '1': 'd30', '2': 'd31' } },
      { ref: 'R3', kind: 'resistor' as const, ohms: 10000, legs: { '1': 'c31', '2': 'c35' } },
    ],
    wires: [W('a30', 'T+30', '#d22'), W(picoAccess('GP26'), 'a31', '#1e88e5'), W('a35', 'T-35', '#222')],
  };
  const m = merge(led, ldr);
  CASES.push({
    id: 'nightlight',
    title: 'Pico night light',
    layout: { name: 'nightlight', parts: [pico(), ...m.parts], wires: [...powerWires(), ...m.wires] },
    nets: [['R2.1', 'U1.GP15'], ['D1.A', 'R2.2'], ['R1.1', 'U1.3V3'], ['R1.2', 'R3.1', 'U1.GP26'], ['D1.C', 'R3.2', ...PICO_GND]],
    circuit: 'Raspberry Pi Pico U1. Light sensor: photoresistor R1 from 3V3 to GP26, and a 10 kΩ resistor R3 from GP26 to GND (a voltage divider). White LED: GP15 → 47 Ω R2 → LED D1 anode; D1 cathode → GND. 3V3 feeds the top + rail; GND feeds both − rails.',
  });
}
{
  const parts: BbPart[] = [
    { ref: 'U1', kind: 'ne555', legs: { GND: 'f20', TRIG: 'f21', OUT: 'f22', RESET: 'f23', VCC: 'e20', DIS: 'e21', THR: 'e22', CTRL: 'e23' } },
    { ref: 'BT1', kind: 'battery', legs: { '+': 'T+2', '-': 'T-2' } },
    { ref: 'R1', kind: 'resistor', ohms: 10000, legs: { '1': 'b20', '2': 'b25' } },
    { ref: 'R2', kind: 'resistor', ohms: 47000, legs: { '1': 'd21', '2': 'd26' } },
    { ref: 'R3', kind: 'resistor', ohms: 470, legs: { '1': 'g22', '2': 'g26' } },
    { ref: 'C1', kind: 'electrolytic', farads: 10e-6, legs: { '+': 'h28', '-': 'h29' } },
    { ref: 'C2', kind: 'capacitor', farads: 10e-9, legs: { '1': 'b23', '2': 'b24' } },
    { ref: 'D1', kind: 'led', color: 'red', legs: { A: 'h26', C: 'h27' } },
  ];
  const wires: BbWire[] = [
    W('a20', 'T+20', '#d22'),
    W('j20', 'B-20', '#222'),
    W('j23', 'B+23', '#d22'),
    W('c25', 'c21', '#2a9d3a'),
    W('a26', 'a22', '#8e24aa'),
    W('g21', 'b22', '#f9a825'),
    W('c22', 'g28', '#1e88e5'),
    W('j29', 'B-29', '#222'),
    W('a24', 'T-24', '#222'),
    W('j27', 'B-27', '#222'),
    W('T+58', 'B+58', '#d22'),
    W('T-57', 'B-57', '#222'),
  ];
  CASES.push({
    id: '555',
    title: '555 LED blinker',
    layout: { name: '555', parts, wires },
    nets: [
      ['BT1.+', 'R1.1', 'U1.RESET', 'U1.VCC'],
      ['R1.2', 'R2.1', 'U1.DIS'],
      ['C1.+', 'R2.2', 'U1.THR', 'U1.TRIG'],
      ['R3.1', 'U1.OUT'],
      ['D1.A', 'R3.2'],
      ['C2.1', 'U1.CTRL'],
      ['BT1.-', 'C1.-', 'C2.2', 'D1.C', 'U1.GND'],
    ],
    circuit: 'NE555 timer U1 (DIP-8) on a 9 V battery BT1, astable LED blinker. Pin 8 VCC and pin 4 RESET → +9 V; pin 1 GND → −. R1 10 kΩ from + to pin 7 (DIS). R2 47 kΩ from pin 7 to pin 6 (THR). Pin 2 (TRIG) joined to pin 6. C1 10 µF electrolytic from pin 6 (+ leg) to GND (− leg, striped). C2 10 nF from pin 5 (CTRL) to GND. Pin 3 (OUT) → 470 Ω R3 → red LED D1 anode; D1 cathode → GND.',
  });
}

/** Hole-by-hole build plan (condition B), like an expanded build guide. */
export function buildPlan(c: EvalCase): string {
  const lines: string[] = [];
  for (const p of c.layout.parts) {
    if (p.kind === 'pico') lines.push(`U1 Raspberry Pi Pico straddles the centre gap, USB end at column 1: its pins sit in row c (top edge: VBUS col 1, VSYS 2, GND 3, 3V3_EN 4, 3V3 5, ADC_VREF 6, GP28 7, AGND 8, GP27 9, GP26 10, RUN 11, GP22 12, GND 13, GP21 14, GP20 15, GP19 16, GP18 17, GND 18, GP17 19, GP16 20) and row h (bottom edge: GP0 col 1, GP1 2, GND 3, GP2 4, GP3 5, GP4 6, GP5 7, GND 8, GP6 9, GP7 10, GP8 11, GP9 12, GND 13, GP10 14, GP11 15, GP12 16, GP13 17, GND 18, GP14 19, GP15 20).`);
    else {
      const legs = Object.entries(p.legs)
        .map(([k, h]) => `${k === 'A' ? 'anode (+)' : k === 'C' ? 'cathode (−, flat side)' : k} in ${h}`)
        .join(', ');
      const what = p.kind === 'resistor' ? `${p.ohms! >= 1000 ? `${p.ohms! / 1000} kΩ` : `${p.ohms} Ω`} resistor` : p.kind === 'led' ? `${p.color} LED` : p.kind === 'ldr' ? 'photoresistor' : p.kind === 'electrolytic' ? '10 µF electrolytic capacitor' : p.kind === 'capacitor' ? '10 nF ceramic capacitor' : p.kind === 'ne555' ? 'NE555 timer (notch toward column 19)' : p.kind === 'battery' ? '9 V battery leads' : p.kind;
      lines.push(`${p.ref} ${what}: ${legs}.`);
    }
  }
  const name = (c: string) => ({ '#d22': 'red', '#222': 'black', '#2a9d3a': 'green', '#8e24aa': 'purple', '#1e88e5': 'blue', '#f9a825': 'yellow' })[c] ?? c;
  for (const w of c.layout.wires) lines.push(`${name(w.color)} jumper from ${w.from} to ${w.to}.`);
  return lines.map((l) => `- ${l}`).join('\n');
}
