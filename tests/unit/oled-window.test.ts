import { describe, it, expect } from 'vitest';
import { SSD1306Device } from '../../src/sim/devices';
import { validateSpec } from '../../src/core/customParts';
import { readFileSync } from 'node:fs';

// Page-addressed write of one byte column pattern: set the column window then send data.
function draw(d: SSD1306Device, x0: number, x1: number, bytes: number[]) {
  d.write([0x00, 0x21, x0, x1, 0x22, 0, 7]);
  d.write([0x40, ...bytes]);
}

describe('small-window SSD1306 panels', () => {
  it('shows only GDDRAM columns colOffset..colOffset+width-1, at the top left of the frame', () => {
    const d = new SSD1306Device('p', { rows: 48, width: 64, colOffset: 32 });
    draw(d, 32, 95, new Array(64 * 6).fill(0xff));
    const v = d.visibleRam();
    expect(v.slice(0, 64).every((b) => b === 0xff)).toBe(true); // page 0, visible columns
    expect(v[64]).toBe(0); // nothing beyond the 64-column window
    expect(v[5 * 128]).toBe(0xff); // page 5 = rows 40-47 is on the glass
    expect(v[6 * 128]).toBe(0); // page 6 (rows 48-55) is not
  });

  it('a driver that forgets the 32-column offset draws half off the glass', () => {
    const d = new SSD1306Device('p', { rows: 32, width: 64, colOffset: 32 });
    const bytes = new Array(64 * 4).fill(0);
    for (let page = 0; page < 4; page++) for (let x = 0; x < 64; x++) bytes[page * 64 + x] = x < 32 ? 0xaa : 0x55;
    draw(d, 0, 63, bytes); // columns 0-63: only 32-63 are visible, and they land at the left edge
    const v = d.visibleRam();
    expect(v[0]).toBe(0x55);
    expect(v[31]).toBe(0x55);
    expect(v[32]).toBe(0); // RAM column 64 was never written
  });

  it('validates the window against the controller RAM', () => {
    const f = JSON.parse(readFileSync('tests/fixtures/parts/oled-64x48.json', 'utf8'));
    expect(validateSpec(f)).toEqual([]);
    expect(validateSpec({ ...f, sim: { ...f.sim, colOffset: 80 } }).join(' ')).toMatch(/colOffset \+ width/);
    expect(validateSpec({ ...f, sim: { ...f.sim, rows: 40 } }).join(' ')).toMatch(/rows must be 32, 48 or 64/);
  });
});
