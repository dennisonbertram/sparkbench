import { describe, it, expect } from 'vitest';
import { buildExample, EXAMPLES } from '../../src/core/examples';

describe('generated code stays about the project', () => {
  it('leaves out helpers and state the program never uses', () => {
    const src = buildExample('pico-traffic-light').files['main.py'];
    expect(src).not.toMatch(/def scale\(/);
    expect(src).not.toMatch(/\bframe\b/);
    expect(src).not.toMatch(/last_print/);
    expect(src).toMatch(/def set_led\(/);
  });
  it('names pins as GPIOn (board pin X) and points at the main loop line', () => {
    const src = buildExample('esp32-weather-imu').files['main.py'];
    expect(src).toMatch(/GPIO4 \(board pin D4\)/);
    expect(src).not.toMatch(/GPIO0\d/);
    const n = Number(/main loop near the end \(line (\d+)\)/.exec(src)![1]);
    expect(src.split('\n')[n - 1]).toBe('while True:');
  });
  it('every helper it keeps is used', () => {
    for (const ex of EXAMPLES) {
      const src = buildExample(ex.id).files['main.py'];
      if (!src) continue;
      for (const fn of ['scale', 'clamp']) if (src.includes(`def ${fn}(`)) expect((src.match(new RegExp(`\\b${fn}\\(`, 'g')) ?? []).length).toBeGreaterThan(1);
    }
  });
});
