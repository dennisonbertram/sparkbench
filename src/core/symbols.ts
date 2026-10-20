// Schematic symbol library: one symbol per part type, in millimetres on a 2.54 mm grid.
// Coordinates are Y-down (SVG); the KiCad exporter flips Y inside lib_symbols.
// Pin x/y is the connection point (outer end); `dir` points from the body towards it.
import type { PartDef, PinDef } from './types';
import { PARTS, partDef } from './parts';
import { BOARDS, internalGroup } from './boards';

export const GRID = 2.54;
/** Estimated advance per character for 1.27 mm text (generous so KiCad's stroke font fits too). */
export const CHAR_W = 1.2;
export const TEXT = 1.27;

export type Pt = [number, number];
export type Dir = 'left' | 'right' | 'up' | 'down';
export type PinType = 'passive' | 'bidirectional' | 'power_in' | 'power_out' | 'input' | 'output' | 'open_collector';
export type Fill = 'none' | 'body' | 'solid';

export interface SymPin {
  name: string;
  number: string;
  x: number;
  y: number;
  dir: Dir;
  length: number;
  type: PinType;
}

export type Graphic =
  | { kind: 'rect'; x1: number; y1: number; x2: number; y2: number; fill?: Fill }
  | { kind: 'poly'; pts: Pt[]; fill?: Fill; width?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill?: Fill }
  | { kind: 'arc'; start: Pt; mid: Pt; end: Pt; width?: number }
  | { kind: 'text'; x: number; y: number; text: string; size?: number };

export interface SymbolDef {
  /** Library item name (without the `Sparkbench:` nickname). */
  name: string;
  type: string;
  graphics: Graphic[];
  pins: SymPin[];
  /** Box symbols show pin names (inside) and numbers; discrete symbols hide both. */
  box?: { x1: number; y1: number; x2: number; y2: number };
  description: string;
}

export const LIB = 'Sparkbench';

// ------------------------------------------------------------------ geometry helpers

export const snap = (v: number, g = GRID) => Math.round(v / g) * g;
export const snapUp = (v: number, g = GRID) => Math.ceil(v / g - 1e-9) * g;
export const textWidth = (s: string, size = TEXT) => s.length * CHAR_W * (size / TEXT);

/** Rotate a symbol-local offset by `rot` degrees counter-clockwise on screen (KiCad convention). */
export function rotate([x, y]: Pt, rot: number): Pt {
  switch (((rot % 360) + 360) % 360) {
    case 90:
      return [y, -x];
    case 180:
      return [-x, -y];
    case 270:
      return [-y, x];
    default:
      return [x, y];
  }
}

const DIRS: Dir[] = ['right', 'up', 'left', 'down']; // counter-clockwise order
export function rotateDir(d: Dir, rot: number): Dir {
  return DIRS[(DIRS.indexOf(d) + Math.round((((rot % 360) + 360) % 360) / 90)) % 4];
}
export const dirVec = (d: Dir): Pt => (d === 'left' ? [-1, 0] : d === 'right' ? [1, 0] : d === 'up' ? [0, -1] : [0, 1]);

export function symbolBounds(s: SymbolDef): { x1: number; y1: number; x2: number; y2: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => (xs.push(x), ys.push(y));
  for (const g of s.graphics) {
    if (g.kind === 'rect') add(g.x1, g.y1), add(g.x2, g.y2);
    else if (g.kind === 'poly') g.pts.forEach(([x, y]) => add(x, y));
    else if (g.kind === 'circle') add(g.cx - g.r, g.cy - g.r), add(g.cx + g.r, g.cy + g.r);
    else if (g.kind === 'arc') [g.start, g.mid, g.end].forEach(([x, y]) => add(x, y));
    else if (g.kind === 'text') add(g.x - 0.6, g.y - 0.8), add(g.x + 0.6, g.y + 0.8);
  }
  for (const p of s.pins) add(p.x, p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

// ------------------------------------------------------------------ building blocks

const pin = (name: string, number: string, x: number, y: number, dir: Dir, length: number, type: PinType = 'passive'): SymPin => ({ name, number, x, y, dir, length, type });
const line = (...pts: Pt[]): Graphic => ({ kind: 'poly', pts });
const thick = (...pts: Pt[]): Graphic => ({ kind: 'poly', pts, width: 0.3 });

/** Small filled arrow from `a` to `b` (head at b). */
function arrow(a: Pt, b: Pt, head = 0.6): Graphic[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  const ux = dx / l;
  const uy = dy / l;
  const bx = b[0] - ux * head;
  const by = b[1] - uy * head;
  const w = head * 0.5;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [
    line(a, [r(bx), r(by)]),
    { kind: 'poly', pts: [b, [r(bx - uy * w), r(by + ux * w)], [r(bx + uy * w), r(by - ux * w)], b], fill: 'solid' },
  ];
}

/** Pin numbers for a part's pins (physical header / package numbering where it matters). */
const NUMBER_OVERRIDES: Record<string, Record<string, string>> = {
  led: { C: '1', A: '2' },
  diode: { K: '1', A: '2' },
  mcp3008: { DGND: '9', CS: '10', DIN: '11', DOUT: '12', CLK: '13', AGND: '14', VREF: '15', VDD: '16' },
  // ESP32 DevKit V1: left header 1–15 top to bottom, right header 16–30 bottom to top (DIP style).
  'esp32-devkit': Object.fromEntries(
    [
      ...['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND.1', 'VIN'],
      ...['3V3', 'GND.2', 'D15', 'D2', 'D4', 'RX2', 'TX2', 'D5', 'D18', 'D19', 'D21', 'RX0', 'TX0', 'D22', 'D23'],
    ].map((n, i) => [n, String(i + 1)]),
  ),
};

export function pinNumber(type: string, pinName: string): string {
  const def = partDef(type);
  const o = NUMBER_OVERRIDES[type]?.[pinName];
  if (o) return o;
  if (def.category === 'board') {
    const b = Object.values(BOARDS).find((x) => x.partType === type);
    const ph = b?.pins.find((p) => p.name === pinName)?.physical;
    if (ph !== undefined) return String(ph);
  }
  return String(def.pins.findIndex((p) => p.name === pinName) + 1);
}

const IC_PIN_TYPES: Record<string, Record<string, PinType>> = {
  ne555: { TRIG: 'input', THR: 'input', RESET: 'input', CTRL: 'input', OUT: 'output', DIS: 'open_collector' },
  mcp3008: { CLK: 'input', DIN: 'input', CS: 'input', DOUT: 'output', VREF: 'power_in' },
};

/**
 * KiCad electrical type. Boards and batteries drive their supply nets (one power_out per internally
 * tied group, so ERC sees a driver without PWR_FLAGs); modules consume power.
 */
function pinType(def: PartDef, p: PinDef): PinType {
  if (def.category === 'board') {
    if (p.role !== 'power' && p.role !== 'gnd') return p.role === 'io' && p.fn ? 'bidirectional' : 'passive';
    const group = internalGroup(p.name);
    const first = def.pins.find((q) => q.role === p.role && internalGroup(q.name) === group);
    return first === p && p.name !== 'AGND' ? 'power_out' : 'passive';
  }
  if (def.category === 'power') return 'power_out';
  const t = IC_PIN_TYPES[def.type]?.[p.name];
  if (t) return t;
  if (p.role === 'passive' || p.role === 'nc') return 'passive';
  if (p.role === 'power' || p.role === 'gnd') return 'power_in';
  return 'bidirectional';
}

// ------------------------------------------------------------------ discrete symbols (horizontal: pin 1 left)

type Discrete = { graphics: Graphic[]; pins: [string, Pt, Dir, number][] };

function twoPin(a: string, b: string, inner: number): Discrete['pins'] {
  return [
    [a, [-5.08, 0], 'left', 5.08 - inner],
    [b, [5.08, 0], 'right', 5.08 - inner],
  ];
}

const resistorBody: Graphic = { kind: 'rect', x1: -2.54, y1: -1.016, x2: 2.54, y2: 1.016, fill: 'body' };

const DISCRETE: Record<string, () => Discrete> = {
  resistor: () => ({ graphics: [resistorBody], pins: twoPin('1', '2', 2.54) }),
  ldr: () => ({
    graphics: [resistorBody, ...arrow([-3.556, -3.81], [-1.778, -1.524]), ...arrow([-1.524, -3.81], [0.254, -1.524])],
    pins: twoPin('1', '2', 2.54),
  }),
  ntc: () => ({
    graphics: [resistorBody, line([-3.556, 2.032], [-2.54, 2.032], [2.54, -2.032]), { kind: 'text', x: 3.302, y: -2.286, text: '-t°', size: 1 }],
    pins: twoPin('1', '2', 2.54),
  }),
  capacitor: () => ({
    graphics: [thick([-0.508, -2.032], [-0.508, 2.032]), thick([0.508, -2.032], [0.508, 2.032])],
    pins: twoPin('1', '2', 0.508),
  }),
  electrolytic: () => ({
    graphics: [
      thick([-0.508, -2.032], [-0.508, 2.032]),
      { kind: 'arc', start: [1.27, -2.032], mid: [0.508, 0], end: [1.27, 2.032], width: 0.3 },
      { kind: 'text', x: -1.778, y: -2.286, text: '+', size: 1.27 },
    ],
    pins: twoPin('+', '-', 0.508),
  }),
  led: () => ({
    graphics: [
      { kind: 'poly', pts: [[-1.27, -1.524], [-1.27, 1.524], [1.27, 0], [-1.27, -1.524]], fill: 'body' },
      thick([1.27, -1.524], [1.27, 1.524]),
      ...arrow([-0.254, -1.778], [1.016, -3.048]),
      ...arrow([1.016, -1.778], [2.286, -3.048]),
    ],
    pins: twoPin('A', 'C', 1.27),
  }),
  diode: () => ({
    graphics: [{ kind: 'poly', pts: [[-1.27, -1.524], [-1.27, 1.524], [1.27, 0], [-1.27, -1.524]], fill: 'body' }, thick([1.27, -1.524], [1.27, 1.524])],
    pins: twoPin('A', 'K', 1.27),
  }),
  buzzer: () => ({
    graphics: [
      { kind: 'arc', start: [-2.54, 0], mid: [0, -2.54], end: [2.54, 0] },
      line([-2.54, 0], [2.54, 0]),
      line([-1.27, 0], [-1.27, 1.016]),
      line([1.27, 0], [1.27, 1.016]),
      { kind: 'text', x: -3.302, y: -1.27, text: '+', size: 1.27 },
    ],
    pins: twoPin('+', '-', 2.54),
  }),
  'battery-9v': () => ({
    graphics: [
      line([-1.27, -2.032], [-1.27, 2.032]),
      { kind: 'poly', pts: [[-0.508, -1.016], [-0.508, 1.016]], width: 0.5 },
      line([0.508, -2.032], [0.508, 2.032]),
      { kind: 'poly', pts: [[1.27, -1.016], [1.27, 1.016]], width: 0.5 },
      line([-0.508, 0], [0.508, 0]),
      { kind: 'text', x: -2.794, y: -2.286, text: '+', size: 1.27 },
    ],
    pins: twoPin('+', '-', 1.27),
  }),
  pushbutton: () => ({
    graphics: [
      { kind: 'circle', cx: -2.032, cy: 0, r: 0.508 },
      { kind: 'circle', cx: 2.032, cy: 0, r: 0.508 },
      line([-2.794, -1.524], [2.794, -1.524]),
      line([0, -1.524], [0, -3.048]),
      line([-1.016, -3.048], [1.016, -3.048]),
    ],
    pins: twoPin('1', '2', 2.54),
  }),
  'slide-switch': () => ({
    graphics: [
      { kind: 'circle', cx: -2.032, cy: 0, r: 0.508 },
      { kind: 'circle', cx: 2.032, cy: -2.54, r: 0.508 },
      { kind: 'circle', cx: 2.032, cy: 2.54, r: 0.508 },
      line([-1.524, -0.254], [1.778, -2.032]),
    ],
    pins: [
      ['2', [-5.08, 0], 'left', 2.54],
      ['1', [5.08, -2.54], 'right', 2.54],
      ['3', [5.08, 2.54], 'right', 2.54],
    ],
  }),
  potentiometer: () => ({
    graphics: [{ kind: 'rect', x1: -1.016, y1: -2.54, x2: 1.016, y2: 2.54, fill: 'body' }, ...arrow([-2.54, 0], [-1.016, 0])],
    pins: [
      ['VCC', [0, -5.08], 'up', 2.54],
      ['SIG', [-5.08, 0], 'left', 2.54],
      ['GND', [0, 5.08], 'down', 2.54],
    ],
  }),
  npn: () => ({
    graphics: [
      { kind: 'circle', cx: 0.635, cy: 0, r: 3.175 },
      { kind: 'poly', pts: [[-1.27, -1.905], [-1.27, 1.905]], width: 0.4 },
      line([-1.27, -0.635], [2.54, -2.54]),
      ...arrow([-1.27, 0.635], [1.905, 2.222], 0.9),
      line([1.905, 2.222], [2.54, 2.54]),
    ],
    pins: [
      ['B', [-5.08, 0], 'left', 3.81],
      ['C', [2.54, -5.08], 'up', 2.54],
      ['E', [2.54, 5.08], 'down', 2.54],
    ],
  }),
  'rgb-led': () => {
    const g: Graphic[] = [{ kind: 'rect', x1: -5.08, y1: -10.16, x2: 5.08, y2: 10.16, fill: 'body' }];
    ['R', 'G', 'B'].forEach((c, i) => {
      const y = (i - 1) * 7.62;
      g.push(
        line([-5.08, y], [-1.27, y]),
        { kind: 'poly', pts: [[-1.27, y - 1.016], [-1.27, y + 1.016], [0.762, y], [-1.27, y - 1.016]], fill: 'none' },
        thick([0.762, y - 1.016], [0.762, y + 1.016]),
        line([0.762, y], [2.54, y]),
        { kind: 'text', x: -3.302, y: y - 1.016, text: c, size: 1 },
      );
    });
    g.push(line([2.54, -7.62], [2.54, 7.62]), line([2.54, 0], [5.08, 0]), { kind: 'circle', cx: 2.54, cy: 0, r: 0.3, fill: 'solid' });
    return {
      graphics: g,
      pins: [
        ['R', [-7.62, -7.62], 'left', 2.54],
        ['G', [-7.62, 0], 'left', 2.54],
        ['B', [-7.62, 7.62], 'left', 2.54],
        ['COM', [7.62, 0], 'right', 2.54],
      ],
    };
  },
};

// ------------------------------------------------------------------ box symbols (modules, ICs, boards)

interface BoxLayout {
  left?: (string | null)[];
  right?: (string | null)[];
  top?: string[];
  bottom?: string[];
}

const MODULE_BOXES: Record<string, BoxLayout> = {
  ssd1306: { top: ['VCC'], bottom: ['GND'], left: ['SCL', 'SDA'] },
  lcd1602: { top: ['VCC'], bottom: ['GND'], left: ['SDA', 'SCL'] },
  dht22: { top: ['VCC'], bottom: ['GND'], left: ['DATA'], right: ['NC'] },
  mpu6050: { top: ['VCC'], bottom: ['GND'], left: ['SCL', 'SDA'], right: ['AD0', 'INT'] },
  hcsr04: { top: ['VCC'], bottom: ['GND'], left: ['TRIG', 'ECHO'] },
  pir: { top: ['VCC'], bottom: ['GND'], left: ['OUT'] },
  soil: { top: ['VCC'], bottom: ['GND'], left: ['AOUT'] },
  'neopixel-ring': { top: ['VCC'], bottom: ['GND'], left: ['DIN'], right: ['DOUT'] },
  servo: { top: ['V+'], bottom: ['GND'], left: ['PWM'] },
  relay: { top: ['VCC'], bottom: ['GND'], left: ['IN'], right: ['COM', 'NO', 'NC'] },
  // Laid out for the classic astable drawing: timing pins on the left, output on the right.
  ne555: { top: ['RESET', 'VCC'], bottom: ['CTRL', 'GND'], left: ['DIS', null, null, null, 'THR', 'TRIG'], right: [null, null, 'OUT'] },
  mcp3008: { top: ['VDD', 'VREF'], bottom: ['AGND', 'DGND'], left: ['CH0', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7'], right: ['CLK', 'DOUT', 'DIN', 'CS'] },
};

function boardBox(type: string): BoxLayout {
  const def = partDef(type);
  const names = def.pins.map((p) => p.name);
  // Supplies on top (pins tied together kept adjacent so they share one symbol), grounds at the bottom.
  const groups = [...new Set(def.pins.map((p) => internalGroup(p.name)))];
  const top = def.pins.filter((p) => p.role === 'power').map((p) => p.name).sort((a, b) => groups.indexOf(internalGroup(a)) - groups.indexOf(internalGroup(b)));
  const bottom = def.pins.filter((p) => p.role === 'gnd').map((p) => p.name);
  const sides = names.filter((n) => !top.includes(n) && !bottom.includes(n));
  if (type === 'esp32-devkit')
    return {
      top,
      bottom,
      left: ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13'],
      right: ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15'],
    };
  if (type === 'pi-pico') {
    // Physical order: left header top→bottom, right header top→bottom.
    const b = BOARDS.pico.pins;
    const phys = (lo: number, hi: number, desc = false) =>
      b.filter((p) => p.physical! >= lo && p.physical! <= hi && sides.includes(p.name)).sort((x, y) => (desc ? y.physical! - x.physical! : x.physical! - y.physical!)).map((p) => p.name);
    return { top, bottom, left: phys(1, 20), right: phys(21, 40, true) };
  }
  if (type === 'rpi4') {
    const g = (n: string) => Number(/\d+$/.exec(n)?.[0] ?? 99);
    const gpios = sides.filter((n) => n.startsWith('GPIO')).sort((a, b) => g(a) - g(b));
    const half = Math.ceil(gpios.length / 2);
    return { top, bottom, left: gpios.slice(0, half), right: [...gpios.slice(half), null, ...sides.filter((n) => !n.startsWith('GPIO'))] };
  }
  const half = Math.ceil(sides.length / 2);
  return { top, bottom, left: sides.slice(0, half), right: sides.slice(half) };
}

function genericBox(def: PartDef): BoxLayout {
  const top = def.pins.filter((p) => p.role === 'power').map((p) => p.name);
  const bottom = def.pins.filter((p) => p.role === 'gnd').map((p) => p.name);
  const rest = def.pins.filter((p) => !top.includes(p.name) && !bottom.includes(p.name)).map((p) => p.name);
  const half = Math.ceil(rest.length / 2);
  return { top, bottom, left: rest.slice(0, half), right: rest.slice(half) };
}

/** Text shown in the middle of a box symbol (its value), used to size the box. */
export function defaultValue(def: PartDef, props: Record<string, any> = {}): string {
  if (def.kicad.value) return def.kicad.value(props);
  return def.category === 'board' ? def.name : def.kicad.symbol.split(':').pop()!;
}

function buildBox(def: PartDef, layout: BoxLayout): { graphics: Graphic[]; pins: SymPin[]; box: SymbolDef['box'] } {
  const L = GRID;
  const isBoard = def.category === 'board';
  const left = layout.left ?? [];
  const right = layout.right ?? [];
  const top = layout.top ?? [];
  const bottom = layout.bottom ?? [];
  const nameW = (ns: (string | null)[]) => Math.max(0, ...ns.map((n) => (n ? textWidth(n) : 0)));
  const rows = Math.max(left.length, right.length, 1);
  const tbPitch = 2 * GRID;
  // Vertical room: top/bottom pin names are drawn rotated inside the box.
  const mTop = top.length ? snapUp(nameW(top) + 2.2) : GRID;
  const mBot = bottom.length ? snapUp(nameW(bottom) + 2.2) : GRID;
  // Centre text block (reference + value) must fit between the side pin names.
  const centerW = Math.max(textWidth(defaultValue(def)), textWidth(def.refPrefix + '00')) + 1.5;
  const halfW = snapUp(Math.max(Math.max(nameW(left), nameW(right)) + 1.2 + centerW / 2, ((Math.max(top.length, bottom.length) - 1) * tbPitch) / 2 + GRID, 2 * GRID));
  const y0 = -Math.floor((rows - 1) / 2) * GRID;
  let y1 = y0 - mTop;
  let y2 = y0 + (rows - 1) * GRID + mBot;
  // Ensure the centre text (reference + value) has clear height.
  const free = y2 - mBot - (y1 + mTop) + 2 * GRID;
  if (free < 6.5) y2 += snapUp(6.5 - free);
  const pins: SymPin[] = [];
  const add = (name: string, x: number, y: number, dir: Dir) => {
    const pd = def.pins.find((p) => p.name === name);
    if (!pd) throw new Error(`symbol ${def.type}: unknown pin ${name}`);
    pins.push(pin(name, pinNumber(def.type, name), x, y, dir, L, pinType(def, pd)));
  };
  left.forEach((n, i) => n && add(n, -halfW - L, y0 + i * GRID, 'left'));
  right.forEach((n, i) => n && add(n, halfW + L, y0 + i * GRID, 'right'));
  const tbX = (i: number, n: number) => (i - (n - 1) / 2) * tbPitch;
  top.forEach((n, i) => add(n, tbX(i, top.length), y1 - L, 'up'));
  bottom.forEach((n, i) => add(n, tbX(i, bottom.length), y2 + L, 'down'));
  const box = { x1: -halfW, y1, x2: halfW, y2 };
  const graphics: Graphic[] = [{ kind: 'rect', ...box, fill: 'body' }];
  if (isBoard) graphics.push({ kind: 'rect', x1: -halfW + 0.635, y1: y1 + 0.635, x2: halfW - 0.635, y2: y2 - 0.635, fill: 'none' });
  return { graphics, pins, box };
}

// ------------------------------------------------------------------ library

const symbolName = (def: PartDef) => {
  const base = def.kicad.symbol.split(':').pop()!;
  // Several part types share a KiCad symbol name with different pinouts; keep names unique.
  const shared = PARTS.filter((d) => d.kicad.symbol.split(':').pop() === base).length > 1;
  return shared ? `${base}_${def.type.replace(/[^A-Za-z0-9]/g, '_')}` : base;
};

const cache = new Map<string, SymbolDef>();

export function symbolFor(type: string): SymbolDef {
  const hit = cache.get(type);
  if (hit) return hit;
  const def = partDef(type);
  let sym: SymbolDef;
  const d = DISCRETE[type];
  if (d) {
    const { graphics, pins } = d();
    sym = {
      name: symbolName(def),
      type,
      graphics,
      pins: pins.map(([n, [x, y], dir, len]) => pin(n, pinNumber(type, n), x, y, dir, len, pinType(def, def.pins.find((p) => p.name === n)!))),
      description: def.name,
    };
  } else {
    const layout = def.category === 'board' ? boardBox(type) : MODULE_BOXES[type] ?? genericBox(def);
    const { graphics, pins, box } = buildBox(def, layout);
    sym = { name: symbolName(def), type, graphics, pins, box, description: def.name };
  }
  const missing = def.pins.filter((p) => !sym.pins.some((s) => s.name === p.name));
  if (missing.length) throw new Error(`symbol ${type} is missing pins ${missing.map((p) => p.name).join(', ')}`);
  cache.set(type, sym);
  return sym;
}

export const symbolLibId = (type: string) => `${LIB}:${symbolFor(type).name}`;

export function allSymbols(): SymbolDef[] {
  return PARTS.map((d) => symbolFor(d.type));
}

export function symPin(type: string, name: string): SymPin {
  const p = symbolFor(type).pins.find((x) => x.name === name);
  if (!p) throw new Error(`No pin ${name} on ${type}`);
  return p;
}

// ------------------------------------------------------------------ power symbols (drawn by schematic + KiCad export)

export type PowerKind = 'gnd' | 'supply';
export const POWER_NETS: Record<string, { kind: PowerKind; lib: string }> = {
  GND: { kind: 'gnd', lib: 'GND' },
  '+3V3': { kind: 'supply', lib: '+3V3' },
  '+5V': { kind: 'supply', lib: '+5V' },
  VBAT: { kind: 'supply', lib: '+BATT' },
};
export const isPowerNet = (name: string) => name in POWER_NETS;
