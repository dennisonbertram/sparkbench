// Read the text currently shown on a simulated display, so tests (and the AI) can check
// "the screen says Water me" without knowing how the firmware drew it. Works on the exact
// fonts the drivers use: MicroPython's framebuf 8x8 font and the Raspberry Pi driver's 5x7 font.
import { FRAMEBUF_FONT } from './fontdata';
import { FONT5X7 } from '../core/drivers';
import type { PartVisual } from './engine';

type Pixel = (x: number, y: number) => boolean;

const FONT5: number[][] = Array.from({ length: 95 }, (_, i) => [...FONT5X7.slice(i * 5, i * 5 + 5), 0, 0, 0]);

/** Lines of text found on a w×h monochrome image where `on` pixels form the characters. */
export function ocr(w: number, h: number, on: Pixel): string[] {
  // Column bytes: bits y..y+7 of column x.
  const col = (x: number, y: number) => {
    let b = 0;
    for (let r = 0; r < 8; r++) if (on(x, y + r)) b |= 1 << r;
    return b;
  };
  const cols: number[][] = [];
  for (let y = 0; y + 8 <= h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) row.push(col(x, y));
    cols.push(row);
  }
  const hits: { x: number; y: number; ch: string }[] = [];
  for (const font of [FRAMEBUF_FONT, FONT5]) {
    for (let y = 0; y + 8 <= h; y++) {
      const row = cols[y];
      for (let x = 0; x + 8 <= w; x++) {
        if (!row[x] && !row[x + 1] && !row[x + 2] && !row[x + 3] && !row[x + 4] && !row[x + 5]) continue; // blank cell
        for (let g = 1; g < 95; g++) {
          const glyph = font[g];
          let ok = true;
          for (let c = 0; c < 8 && ok; c++) if (row[x + c] !== glyph[c]) ok = false;
          if (ok) {
            hits.push({ x, y, ch: String.fromCharCode(32 + g) });
            break;
          }
        }
      }
    }
  }
  // Join characters that sit on the same baseline 8 px apart into words and lines.
  hits.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: string[] = [];
  const used = new Set<number>();
  for (let i = 0; i < hits.length; i++) {
    if (used.has(i)) continue;
    let s = hits[i].ch;
    let last = hits[i];
    used.add(i);
    for (let j = i + 1; j < hits.length; j++) {
      const hj = hits[j];
      if (used.has(j) || hj.y !== last.y) continue;
      const gap = hj.x - last.x;
      if (gap % 8 !== 0 || gap > 24) continue;
      s += ' '.repeat(gap / 8 - 1) + hj.ch;
      last = hj;
      used.add(j);
    }
    lines.push(s);
  }
  return lines;
}

/** Text on a display part (OLED, 16×2 LCD or e-paper), one entry per line or text run. */
export function screenText(v: PartVisual | undefined): string[] {
  if (!v) return [];
  if (v.segText !== undefined) return v.segText.trim() ? [v.segText] : [];
  if (v.lcd) {
    const s = String.fromCharCode(...v.lcd.chars.map((c) => (c >= 32 && c < 127 ? c : 32)));
    return [s.slice(0, 16).trimEnd(), s.slice(16).trimEnd()].filter(Boolean);
  }
  if (v.oled && v.oledOn !== false) {
    const buf = v.oled;
    const lit: Pixel = (x, y) => x >= 0 && x < 128 && y >= 0 && y < 64 && ((buf[x + (y >> 3) * 128] >> (y & 7)) & 1) === 1;
    const lines = ocr(128, 64, lit);
    // Text drawn dark on a lit background (inverted highlights).
    return lines.length ? lines : ocr(128, 64, (x, y) => !lit(x, y));
  }
  if (v.epaper) {
    const ram = v.epaper.ram;
    const black: Pixel = (lx, ly) => {
      const px = 127 - ly;
      return lx >= 0 && lx < 296 && ly >= 0 && ly < 128 && (ram[lx * 16 + (px >> 3)] & (0x80 >> (px & 7))) === 0;
    };
    return ocr(296, 128, black);
  }
  return [];
}
