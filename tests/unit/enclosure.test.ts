import { describe, it, expect } from 'vitest';
import { buildCase, volumeOf, bboxOf, CASE_DIMS } from '../../src/core/enclosure';
import * as stlNs from '@jscad/stl-serializer';

const stl: any = (stlNs as any).default ?? stlNs;
const board = {
  width_mm: 60,
  height_mm: 50,
  holes: [[3.5, 3.5], [56.5, 3.5], [56.5, 46.5], [3.5, 46.5]] as [number, number][],
  parts: [
    { ref: 'U1', x: 20, y: 25, rot: 180, box: [10, 8, 30, 45] as [number, number, number, number] },
    { ref: 'SW1', x: 45, y: 15, rot: 0, box: [42, 12, 48, 18] as [number, number, number, number] },
    { ref: 'D1', x: 45, y: 35, rot: 0, box: [42, 32, 48, 38] as [number, number, number, number] },
    { ref: 'DS1', x: 36, y: 25, rot: 0, box: [35, 20, 37, 30] as [number, number, number, number] },
  ],
  usb: [20, 46] as [number, number],
};
const types = { U1: 'pi-pico', SW1: 'pushbutton', D1: 'led', DS1: 'ssd1306' };

describe('3D-printable case', () => {
  it('fits the board with clearance and has an opening for every part that needs one', () => {
    const r = buildCase({ board, types, style: 'rounded', name: 'T' });
    const inner = { w: r.outer.w - 2 * CASE_DIMS.WALL, d: r.outer.d - 2 * CASE_DIMS.WALL };
    expect(inner.w).toBeGreaterThan(board.width_mm);
    expect(inner.d).toBeGreaterThan(board.height_mm);
    expect(r.tallest.ref).toBe('DS1');
    const what = r.openings.map((o) => o.what).join(' | ');
    expect(what).toMatch(/USB cable opening \(bottom side\)/);
    expect(what).toMatch(/button hole/);
    expect(what).toMatch(/LED window/);
    expect(what).toMatch(/screen window/);
    expect(r.parts.map((p) => p.name)).toEqual(['case-base', 'case-lid', 'button-cap-SW1']);
  });
  it('produces solid, printable parts within the outer size', () => {
    const r = buildCase({ board, types, style: 'desk-stand', name: 'T' });
    for (const p of r.parts) {
      expect(volumeOf(p.geom)).toBeGreaterThan(100);
      const [[x0, y0], [x1, y1]] = bboxOf(p.geom);
      if (p.name.startsWith('case-')) {
        expect(x1 - x0).toBeCloseTo(r.outer.w, 0);
        expect(y1 - y0).toBeCloseTo(r.outer.d, 0);
      }
      const data = stl.serialize({ binary: true }, p.geom);
      expect(data.reduce((n: number, d: ArrayBuffer) => n + d.byteLength, 0)).toBeGreaterThan(1000);
    }
    expect(r.parts.some((p) => p.name === 'desk-stand')).toBe(true);
  });
  it('the lid gets lighter for every hole (holes really go through)', () => {
    const none = buildCase({ board: { ...board, parts: [board.parts[0]] }, types, style: 'minimal', name: 'T' });
    const full = buildCase({ board, types, style: 'minimal', name: 'T' });
    expect(volumeOf(full.parts[1].geom)).toBeLessThan(volumeOf(none.parts[1].geom) - 300);
  });
});
