import { describe, expect, it } from 'vitest';
import { EXAMPLES, buildExample } from '../../src/core/examples';
import { planBreadboard } from '../../src/core/bbplace';
import { renderBreadboardSvg, holeXY } from '../../src/core/breadboard';
import { buildGuide } from '../../src/core/docs';

describe('automatic breadboard layout', () => {
  for (const e of EXAMPLES) {
    it(`${e.id}: layout connects exactly the schematic's nets`, () => {
      const plan = planBreadboard(buildExample(e.id));
      expect(plan.problems).toEqual([]);
      expect(plan.expected.length).toBeGreaterThan(0);
      // Every hole holds at most one leg or wire end, and exists on the board.
      const holes = [...plan.layout.parts.flatMap((p) => Object.values(p.legs)), ...plan.layout.wires.flatMap((w) => [w.from, w.to])];
      const dup = holes.filter((h, i) => holes.indexOf(h) !== i);
      expect(dup).toEqual([]);
      for (const h of holes) expect(() => holeXY(h)).not.toThrow();
      // Every step says something and every part appears in some step.
      const stepped = new Set(plan.steps.flatMap((s) => s.parts));
      for (const p of plan.layout.parts) expect(stepped.has(p.ref), p.ref).toBe(true);
      expect(renderBreadboardSvg(plan.layout, { labels: true })).toContain('<svg');
    });
  }
  it('the build guide includes the hole-by-hole steps', () => {
    const g = buildGuide(buildExample('pico-traffic-light'));
    expect(g).toContain('## Hole-by-hole breadboard layout');
    expect(g).toMatch(/long leg \(\+\) in [a-j]\d+/);
  });
});
