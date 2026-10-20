import { describe, expect, it } from 'vitest';
import { connectivity, diffConnectivity, stripOf, renderBreadboardSvg } from '../../src/core/breadboard';
import { CASES } from '../../scripts/vision-eval/layouts';
import { faultsFor } from '../../scripts/vision-eval/faults';

describe('breadboard model', () => {
  it('maps holes to strips and rails', () => {
    expect(stripOf('a12')).toBe(stripOf('e12'));
    expect(stripOf('e12')).not.toBe(stripOf('f12'));
    expect(stripOf('T+1')).toBe(stripOf('T+60'));
    expect(stripOf('T+1')).not.toBe(stripOf('B+1'));
  });

  for (const c of CASES) {
    it(`${c.id}: the reference build matches its intended circuit`, () => {
      expect(diffConnectivity(connectivity(c.layout), c.nets)).toEqual([]);
      expect(renderBreadboardSvg(c.layout)).toContain('<svg');
    });
    it(`${c.id}: every injected wiring fault changes the circuit`, () => {
      for (const f of faultsFor(c).filter((f) => f.kind !== 'reversed-led'))
        expect(diffConnectivity(connectivity(f.layout), c.nets).length, f.kind).toBeGreaterThan(0);
    });
  }
});
