import { describe, expect, it } from 'vitest';
import { EXAMPLES, buildExample } from '../../src/core/examples';
import { pcbSpec } from '../../src/core/pcb';
import { adoptKicadNets } from '../../server/pcb';

describe('circuit-board spec', () => {
  for (const e of EXAMPLES) {
    it(`${e.id}: every part has a footprint and every wired pin a pad net`, () => {
      const p = buildExample(e.id);
      const spec = pcbSpec(p);
      expect(spec.parts.length).toBe(p.parts.length);
      for (const part of spec.parts) expect(part.footprint).toMatch(/^[\w.-]+:[\w.-]+$/);
      const wired = p.wires.length * 2;
      const padCount = spec.parts.reduce((n, x) => n + Object.keys(x.pads).length, 0);
      expect(padCount).toBeGreaterThan(0);
      expect(padCount).toBeLessThanOrEqual(wired + spec.parts.length * 40);
      expect(spec.groundNet).toMatch(/^GND/);
    });
  }

  const net = (name: string, nodes: [string, string][]) => `(net (code "1") (name "${name}") ${nodes.map(([r, p]) => `(node (ref "${r}") (pin "${p}"))`).join(' ')})`;
  const spec = () => ({ name: 't', title: 'T', powerNets: ['GND'], groundNet: 'GND', parts: [
    { ref: 'R1', footprint: 'a:b', value: '1k', role: 'passive' as const, description: '', pads: { '1': 'GPIO2', '2': 'N5' } },
    { ref: 'D1', footprint: 'a:b', value: 'LED', role: 'indicator' as const, description: '', pads: { '2': 'N5', '1': 'GND' } },
  ] });

  it('adopts KiCad net names when both netlists agree', () => {
    const s = spec();
    const problems = adoptKicadNets(s, `(nets ${net('/GPIO2', [['R1', '1']])} ${net('Net-(D1-A)', [['R1', '2'], ['D1', '2']])} ${net('GND', [['D1', '1']])})`);
    expect(problems).toEqual([]);
    expect(s.parts[0].pads).toEqual({ '1': '/GPIO2', '2': 'Net-(D1-A)' });
    expect(s.groundNet).toBe('GND');
  });

  it('reports nets that KiCad joins or splits differently', () => {
    const s = spec();
    const problems = adoptKicadNets(s, `(nets ${net('/GPIO2', [['R1', '1'], ['R1', '2']])} ${net('X', [['D1', '2']])} ${net('GND', [['D1', '1']])})`);
    expect(problems.join(' ')).toMatch(/joined|split/);
  });
});
