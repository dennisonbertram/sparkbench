import { describe, it, expect } from 'vitest';
import { Circuit, Resistor, VSource, Diode, NPN, Timer555, Capacitor, LED_PARAMS } from '../../src/core/mna';

describe('MNA solver', () => {
  it('solves a voltage divider', () => {
    const c = new Circuit();
    const a = c.node('a'), m = c.node('m');
    c.add(new VSource('v', a, -1, 10, 1e-3));
    c.add(new Resistor('r1', a, m, 1000));
    c.add(new Resistor('r2', m, -1, 1000));
    c.dc();
    expect(c.voltage('m')).toBeCloseTo(5, 2);
  });
  it('red LED with 220Ω from 3.3V draws ~5-7 mA', () => {
    const c = new Circuit();
    const a = c.node('a'), m = c.node('m');
    c.add(new VSource('v', a, -1, 3.3, 30));
    c.add(new Resistor('r', a, m, 220));
    const d = c.add(new Diode('d', m, -1, LED_PARAMS.red.is, LED_PARAMS.red.n));
    expect(c.dc()).toBe(true);
    const i = d.current(c.x) * 1000;
    expect(i).toBeGreaterThan(4);
    expect(i).toBeLessThan(8);
  });
  it('NPN low-side switch saturates', () => {
    const c = new Circuit();
    const vcc = c.node('vcc'), b = c.node('b'), col = c.node('c'), g = c.node('gpio');
    c.add(new VSource('v', vcc, -1, 5, 0.01));
    c.add(new VSource('g', g, -1, 3.3, 30));
    c.add(new Resistor('rb', g, b, 1000));
    c.add(new Resistor('rl', vcc, col, 100));
    c.add(new NPN('q', col, b, -1));
    expect(c.dc()).toBe(true);
    expect(c.voltage('c')).toBeLessThan(0.3);
  });
  it('555 astable oscillates near the textbook frequency', () => {
    const c = new Circuit();
    const vcc = c.node('vcc'), dis = c.node('dis'), thr = c.node('thr'), out = c.node('out'), ctrl = c.node('ctrl');
    c.add(new VSource('bat', vcc, -1, 9, 1));
    const R1 = 10000, R2 = 47000, C = 10e-6;
    c.add(new Resistor('r1', vcc, dis, R1));
    c.add(new Resistor('r2', dis, thr, R2));
    c.add(new Capacitor('c', thr, -1, C));
    c.add(new Capacitor('cc', ctrl, -1, 10e-9));
    c.add(new Resistor('load', out, -1, 1000));
    c.add(new Timer555('u', [-1, thr, out, vcc, ctrl, thr, dis, vcc]));
    c.dc();
    c.initCaps(true);
    let edges = 0, last = c.voltage('out') > 4;
    const dt = 2e-4; const T = 3;
    let firstEdge = -1, lastEdge = -1;
    for (let t = 0; t < T; t += dt) {
      c.step(dt);
      const hi = c.voltage('out') > 4;
      if (hi && !last) { edges++; if (firstEdge < 0) firstEdge = c.time; lastEdge = c.time; }
      last = hi;
    }
    const f = (edges - 1) / (lastEdge - firstEdge);
    const expected = 1.44 / ((R1 + 2 * R2) * C);
    expect(f).toBeGreaterThan(expected * 0.85);
    expect(f).toBeLessThan(expected * 1.15);
  });
});
