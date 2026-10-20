import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planFromPrompt } from '../../src/core/planner';
import { ElectricalModel } from '../../src/core/circuit';
import { exportSpice, parseNgspiceOp, parseNgspiceTran, spiceNode, type SpiceOptions } from '../../src/core/spice';
import type { Project } from '../../src/core/types';

const NGSPICE = ['/opt/homebrew/bin/ngspice', '/usr/local/bin/ngspice', '/usr/bin/ngspice'].find((p) => existsSync(p));

function runNgspice(project: Project, opts: SpiceOptions): string {
  const dir = mkdtempSync(join(tmpdir(), 'sparkbench-spice-'));
  try {
    const file = join(dir, 'circuit.cir');
    writeFileSync(file, exportSpice(project, opts));
    return execFileSync(NGSPICE!, ['-b', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

/** Rising-edge frequency of a sampled waveform (skips the power-up pulse, which starts from an empty capacitor). */
function edgeFreq(t: number[], v: number[], thresh: number): number {
  const edges: number[] = [];
  let i0 = 1;
  while (i0 < v.length && !(v[i0] <= thresh && v[i0 - 1] > thresh)) i0++;
  for (let i = i0 + 1; i < v.length; i++) if (v[i] > thresh && v[i - 1] <= thresh) edges.push(t[i]);
  expect(edges.length).toBeGreaterThanOrEqual(3);
  return (edges.length - 1) / (edges[edges.length - 1] - edges[0]);
}

describe('SPICE export', () => {
  it('emits an ngspice netlist with refs, sanitized nodes and LED models', () => {
    const p = planFromPrompt('raspberry pi pico traffic light');
    const cir = exportSpice(p, { gpioLevels: { 2: 1 } });
    expect(cir).toMatch(/^\.model LED_RED D\(IS=[\d.e+-]+ N=2\)/m);
    expect(cir).toMatch(/^D1 n5 0 LED_RED$/m);
    expect(cir).toMatch(/^R1 gpio2 n5 220$/m);
    expect(cir).toMatch(/^\* GPIO2 output high/m);
    expect(cir).toMatch(/^\.control[\s\S]*^op$[\s\S]*^\.endc$/m);
    expect(spiceNode('+3V3')).toBe('p3v3');
    expect(spiceNode('GPIO21/SDA')).toBe('gpio21_sda');
    expect(parseNgspiceOp('n5 = 1.93e+00\n@d1[id] = 5.4e-03\nfoo bar')).toEqual({ n5: 1.93, '@d1[id]': 0.0054 });
  });
});

describe.skipIf(!NGSPICE)('ngspice cross-check', () => {
  it('Pico traffic light: LED currents and node voltages match ElectricalModel within 5%', () => {
    const p = planFromPrompt('raspberry pi pico traffic light');
    const red = p.features!.find((f) => f.parts.some((id) => p.parts.find((x) => x.id === id)?.props.color === 'red'))!;
    const gpio = red.gpio.pin;
    const res = parseNgspiceOp(runNgspice(p, { gpioLevels: { [gpio]: 1 } }));

    const m = new ElectricalModel(p);
    m.setPinMode(gpio, { kind: 'out', level: 1 });
    for (const led of p.parts.filter((x) => x.type === 'led')) {
      const ours = m.ledCurrentMa(led.id);
      const spice = res[`@${led.ref!.toLowerCase()}[id]`] * 1000;
      expect(spice).toBeDefined();
      if (led.props.color === 'red') {
        console.log(`red LED: ngspice ${spice.toFixed(4)} mA, ours ${ours.toFixed(4)} mA`);
        expect(ours).toBeGreaterThan(3);
        expect(rel(spice, ours)).toBeLessThan(0.05);
      } else {
        expect(ours).toBeLessThan(0.01);
        expect(spice).toBeLessThan(0.01);
      }
    }
    const nv = m.netVoltages();
    for (const net of m.nets) {
      if (net.pins.length < 2 || net === m.groundNet) continue;
      const spice = res[spiceNode(net.name)];
      expect(spice, net.name).toBeDefined();
      if (Math.abs(nv[net.id]) < 1e-3) expect(Math.abs(spice), net.name).toBeLessThan(1e-3);
      else expect(rel(spice, nv[net.id]), net.name).toBeLessThan(0.05);
    }
  });

  it('transistor LED switch (button pressed): LED current matches within 10%', () => {
    const p = planFromPrompt('transistor led switch with no microcontroller');
    const btn = p.parts.find((x) => x.type === 'pushbutton')!;
    const led = p.parts.find((x) => x.type === 'led')!;
    const res = parseNgspiceOp(runNgspice(p, { partStates: { [btn.id]: { pressed: 1 } } }));

    const m = new ElectricalModel(p);
    m.setPartState(btn.id, 'pressed', 1);
    const ours = m.ledCurrentMa(led.id);
    const spice = res[`@${led.ref!.toLowerCase()}[id]`] * 1000;
    console.log(`transistor LED: ngspice ${spice.toFixed(3)} mA, ours ${ours.toFixed(3)} mA`);
    expect(ours).toBeGreaterThan(5);
    expect(rel(spice, ours)).toBeLessThan(0.1);
    // Released: both say off.
    const off = parseNgspiceOp(runNgspice(p, {}));
    expect(off[`@${led.ref!.toLowerCase()}[id]`] * 1000).toBeLessThan(0.01);
  });

  it('555 blinker oscillates at 1.44/((R1+2R2)C) in ngspice and in our solver', () => {
    const p = planFromPrompt('555 blinker');
    const ohms = (label: string) => Number(p.parts.find((x) => x.label === label)!.props.ohms);
    const C = Number(p.parts.find((x) => x.type === 'electrolytic')!.props.farads);
    const expected = 1.44 / ((ohms('R1 (timing)') + 2 * ohms('R2 (timing)')) * C);
    expect(expected).toBeCloseTo(1.38, 1);

    const m = new ElectricalModel(p);
    const timer = p.parts.find((x) => x.type === 'ne555')!;
    const outNet = m.netOf.get(`${timer.id}:OUT`)!;

    const tr = parseNgspiceTran(runNgspice(p, { analysis: 'tran', tranStop: 3, tranStep: 1e-3 }));
    const vout = tr[`v(${spiceNode(outNet.name)})`];
    expect(vout?.length).toBeGreaterThan(1000);
    const fSpice = edgeFreq(tr.time, vout, 4);

    // Our solver, as in tests/unit/mna.test.ts.
    const c = m.circuit;
    m.solve();
    c.initCaps(true);
    const t: number[] = [], v: number[] = [];
    for (let k = 0; k < 15000; k++) {
      c.step(2e-4);
      t.push(c.time);
      v.push(c.voltage(outNet.id));
    }
    const fOurs = edgeFreq(t, v, 4);

    console.log(`555: expected ${expected.toFixed(3)} Hz, ngspice ${fSpice.toFixed(3)} Hz, ours ${fOurs.toFixed(3)} Hz`);
    expect(rel(fSpice, expected)).toBeLessThan(0.15);
    expect(rel(fOurs, expected)).toBeLessThan(0.15);
    expect(rel(fSpice, fOurs)).toBeLessThan(0.15);
  }, 60000);
});
