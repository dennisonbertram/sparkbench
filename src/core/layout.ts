// Approximate on-canvas sizes (CSS px) of each part's breadboard picture, plus auto-placement.
import type { Project, PartInstance } from './types';
import { partDef } from './parts';

export const PART_SIZE: Record<string, [number, number]> = {
  'esp32-devkit': [107, 204],
  'pi-pico': [84, 200],
  rpi4: [330, 220],
  ssd1306: [150, 116],
  lcd1602: [302, 140],
  epaper29: [340, 190],
  pushbutton: [67, 45],
  'slide-switch': [32, 35],
  potentiometer: [76, 76],
  dht22: [57, 117],
  mpu6050: [82, 61],
  hcsr04: [170, 95],
  pir: [91, 92],
  ldr: [40, 70],
  ntc: [40, 70],
  soil: [60, 170],
  led: [40, 50],
  'rgb-led': [42, 73],
  'neopixel-ring': [110, 120],
  buzzer: [64, 76],
  servo: [170, 120],
  relay: [100, 90],
  resistor: [59, 12],
  capacitor: [36, 56],
  electrolytic: [36, 70],
  diode: [64, 16],
  npn: [44, 70],
  ne555: [90, 80],
  mcp3008: [150, 80],
  'battery-9v': [70, 120],
};

export function partSize(type: string): [number, number] {
  return PART_SIZE[type] ?? [80, 60];
}

export interface Group {
  main: string; // part id
  parts: string[]; // in visual order, main last for "R → LED"
  side?: 'left' | 'right';
}

/**
 * Lay parts out around the board: each feature group is a row (helpers then main part);
 * rows stack in two columns either side of the board.
 */
export function autoLayout(project: Project, groups: Group[]): Project {
  const parts = project.parts.map((p) => ({ ...p }));
  const byId = new Map(parts.map((p) => [p.id, p]));
  const board = parts.find((p) => partDef(p.type).category === 'board');
  const GAP = 28;
  const [bw, bh] = board ? partSize(board.type) : [0, 0];
  const boardX = 460;
  const boardY = 140;
  if (board) {
    board.x = boardX;
    board.y = boardY;
  }
  const grouped = new Set(groups.flatMap((g) => g.parts));
  const loose = parts.filter((p) => p !== board && !grouped.has(p.id)).map((p) => ({ main: p.id, parts: [p.id] }) as Group);
  const all = [...groups, ...loose];
  // Assign sides: displays + sensors right, inputs + outputs left, balanced by height.
  const rowSize = (g: Group) => {
    let w = 0;
    let h = 0;
    for (const id of g.parts) {
      const [pw, ph] = partSize(byId.get(id)!.type);
      w += pw + 16;
      h = Math.max(h, ph);
    }
    return [w - 16, h] as const;
  };
  let leftH = 0;
  let rightH = 0;
  const left: Group[] = [];
  const right: Group[] = [];
  const pref = (g: Group): 'left' | 'right' | undefined => {
    if (g.side) return g.side;
    const cat = partDef(byId.get(g.main)!.type).category;
    if (cat === 'display' || cat === 'sensor') return 'right';
    if (cat === 'input') return 'left';
    return undefined;
  };
  for (const g of all) {
    const [, h] = rowSize(g);
    const side = pref(g) ?? (leftH <= rightH ? 'left' : 'right');
    // keep columns roughly balanced
    const useLeft = side === 'left' ? leftH <= rightH + 260 : leftH + 260 < rightH;
    if (useLeft) {
      left.push(g);
      leftH += h + GAP;
    } else {
      right.push(g);
      rightH += h + GAP;
    }
  }
  const place = (col: Group[], side: 'left' | 'right') => {
    const colH = col.reduce((s, g) => s + rowSize(g)[1] + GAP, -GAP);
    let y = board ? boardY + bh / 2 - colH / 2 : 60;
    y = Math.max(20, y);
    for (const g of col) {
      const [w, h] = rowSize(g);
      let x = side === 'left' ? (board ? boardX - 120 - w : 60) : board ? boardX + bw + 120 : 420;
      // Left column: helpers (resistors) sit nearest the board, so reverse order.
      const order = side === 'left' ? [...g.parts].reverse() : g.parts;
      for (const id of order) {
        const p = byId.get(id)!;
        const [pw, ph] = partSize(p.type);
        p.x = Math.round(x);
        p.y = Math.round(y + (h - ph) / 2);
        x += pw + 16;
      }
      y += h + GAP;
    }
  };
  place(left, 'left');
  place(right, 'right');
  // Normalise so nothing is off-canvas.
  const minX = Math.min(...parts.map((p) => p.x));
  const minY = Math.min(...parts.map((p) => p.y));
  for (const p of parts) {
    p.x += 40 - minX;
    p.y += 40 - minY;
  }
  return { ...project, parts };
}

export function canvasBounds(parts: PartInstance[]) {
  let w = 0;
  let h = 0;
  for (const p of parts) {
    const [pw, ph] = partSize(p.type);
    w = Math.max(w, p.x + pw);
    h = Math.max(h, p.y + ph);
  }
  return { width: w + 40, height: h + 40 };
}
