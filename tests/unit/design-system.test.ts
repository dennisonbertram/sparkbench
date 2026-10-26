import { describe, expect, it } from 'vitest';
import { regressions } from '../../scripts/ds-check';

describe('design system', () => {
  it('adds no ad-hoc UI outside src/ui/ds', () => {
    expect(regressions()).toEqual([]);
  });
});
