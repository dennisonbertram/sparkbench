import { describe, it, expect } from 'vitest';
import { buildExample } from '../../src/core/examples';
import { releaseRevision, unreleasedChanges } from '../../src/core/revisions';

describe('revisions', () => {
  it('releases Rev A, then Rev B with an exact change list', () => {
    let p = buildExample('pico-traffic-light');
    p = releaseRevision(p, 'First boards', '2026-10-20');
    expect(p.revision).toBe('A');
    expect(p.revisions![0].changes).toEqual(['First release.']);
    expect(unreleasedChanges(p)).toEqual([]);
    // Change a resistor value and the program.
    const r = p.parts.find((x) => x.type === 'resistor')!;
    p = { ...p, parts: p.parts.map((x) => (x.id === r.id ? { ...x, props: { ...x.props, ohms: 330 } } : x)), files: { ...p.files, 'main.py': p.files['main.py'] + '\nprint("hi")\n' } };
    const pending = unreleasedChanges(p);
    expect(pending.join(' ')).toMatch(/ohms 220 → 330/);
    expect(pending.join(' ')).toMatch(/Program main\.py/);
    p = releaseRevision(p, 'Dimmer red LED', '2026-11-02');
    expect(p.revision).toBe('B');
    expect(p.revisions![1].changes.join(' ')).toMatch(/330/);
  });
  it('reports added parts and rewiring', () => {
    const a = buildExample('pico-traffic-light');
    let p = releaseRevision(a, 'x');
    const extra = { id: 'buzzer9', type: 'buzzer', ref: 'BZ1', props: {}, x: 0, y: 0 };
    const pin = Object.keys(a.parts[0]).length ? a.wires[0] : null;
    p = { ...p, parts: [...p.parts, extra], wires: [...p.wires, { id: 'w9', a: { part: 'buzzer9', pin: '+' }, b: pin!.a }] };
    const ch = unreleasedChanges(p).join(' ');
    expect(ch).toMatch(/Added BZ1/);
    expect(ch).toMatch(/Wiring changed/);
  });
});
