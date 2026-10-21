// Approximate on-canvas sizes (CSS px) of each part's breadboard picture, plus auto-placement.
import type { Project, PartInstance } from './types';
import { partDef } from './parts';
import { BOARDS } from './boards';
import { customSpec } from './customParts';

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
  'level-shifter': [80, 60],
  'dc-motor': [70, 70],
  resistor: [59, 12],
  capacitor: [36, 56],
  electrolytic: [36, 70],
  diode: [64, 16],
  npn: [44, 70],
  ne555: [90, 80],
  mcp3008: [150, 80],
  'battery-9v': [70, 120],
  'dc-supply': [90, 70],
};

/** Generic drawing for datasheet-defined parts: a module with its pins along the bottom edge. */
export function customModuleSize(pins: number): [number, number] {
  return [Math.max(96, pins * 18 + 24), 78];
}

export function partSize(type: string): [number, number] {
  const cs = customSpec(type);
  if (cs) return customModuleSize(cs.pins.length);
  return PART_SIZE[type] ?? [80, 60];
}

/** Where a board pin sits on the board picture: which side, and how far down (0 = top, 1 = bottom). */
export function boardPinPlace(boardType: string, pin: string): { side: 'left' | 'right'; t: number } | undefined {
  const b = Object.values(BOARDS).find((x) => x.partType === boardType);
  const bp = b?.pins.find((p) => p.name === pin);
  if (!b || !bp?.physical) return undefined;
  const n = bp.physical;
  if (b.id === 'esp32') return n <= 15 ? { side: 'left', t: (n - 1) / 14 } : { side: 'right', t: (30 - n) / 14 };
  if (b.id === 'pico') return n <= 20 ? { side: 'left', t: (n - 1) / 19 } : { side: 'right', t: (40 - n) / 19 };
  // Raspberry Pi: header along the top edge; left half of it → left column.
  const col = Math.floor((n - 1) / 2) / 19;
  return { side: col < 0.5 ? 'left' : 'right', t: col < 0.5 ? col : 1 - col };
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
  // Where each group's signal wires land on the board (power and ground pins don't count).
  const pinPlace = (g: Group) => {
    if (!board) return undefined;
    const places = project.wires
      .flatMap((w) => [[w.a, w.b], [w.b, w.a]])
      .filter(([x, y]) => g.parts.includes(x.part) && y.part === board.id && !/^(GND|3V3|5V|VIN|VBUS|VSYS|AGND)/.test(y.pin))
      .map(([, y]) => boardPinPlace(board.type, y.pin))
      .filter((x): x is { side: 'left' | 'right'; t: number } => !!x);
    if (!places.length) return undefined;
    const left = places.filter((x) => x.side === 'left').length;
    return { side: left * 2 >= places.length ? ('left' as const) : ('right' as const), t: places.reduce((s, x) => s + x.t, 0) / places.length };
  };
  const placeOf = new Map(all.map((g) => [g, pinPlace(g)]));
  all.sort((a, b) => (placeOf.get(a)?.t ?? 0.5) - (placeOf.get(b)?.t ?? 0.5));
  for (const g of all) {
    const [, h] = rowSize(g);
    const side = placeOf.get(g)?.side ?? pref(g) ?? (leftH <= rightH ? 'left' : 'right');
    // keep columns roughly balanced
    const useLeft = side === 'left' ? leftH <= rightH + 420 : leftH + 420 < rightH;
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
