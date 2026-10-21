// Automatic breadboard layout: puts every part of a project into named holes of an 830-point
// breadboard, adds the jumpers and power-rail wiring, and verifies that what the layout connects
// is exactly what the schematic says. The result drives the hole-by-hole build steps, the
// breadboard picture and the photo wiring check.
import type { Net, PartInstance, Project } from './types';
import { partDef } from './parts';
import { customSpec } from './customParts';
import { buildNets } from './netlist';
import { boardFor, ESP32_LEFT, ESP32_RIGHT } from './boards';
import { connectivity, diffConnectivity, holeXY, picoLegs, railHoleAt, stripOf, COLS, ROWS_TOP, ROWS_BOTTOM, type BbKind, type BbLayout, type BbPart, type BbWire, type Hole } from './breadboard';
import { colourName } from './colours';

export interface BuildStep {
  text: string;
  /** Parts placed in this step (refs) and jumpers added (indexes into layout.wires). */
  parts: string[];
  wires: number[];
  /** Holes to highlight for this step. */
  holes: Hole[];
}

export interface BreadboardPlan {
  layout: BbLayout;
  /** Hole-by-hole build steps, in build order. */
  steps: BuildStep[];
  /** Nets the layout must make (REF.pin groups), from the schematic. */
  expected: string[][];
  /** Empty when the layout connects exactly what the schematic says. */
  problems: string[];
  /** What the + rails carry, e.g. "3.3 V". */
  railVoltage: string;
}

// ------------------------------------------------------------------ footprints
type Footprint =
  | { kind: 'inline'; bb: BbKind; offsets: number[]; axial?: boolean } // legs in one row at col + offset (def pin order)
  | { kind: 'dip'; order: string[]; label: string } // pins in physical order 1..n
  /**
   * Breakout board on a header in row b. `header` is the real board's pin order (names that aren't
   * pins of the part are unconnected header pins); the body reaches `left`/`right` holes past the
   * end pins. A `flat` board lies over the top rails (they're covered there); otherwise it stands up.
   * `dual`: two headers straddling the centre gap (rows d and g), like a wide chip.
   */
  | { kind: 'module'; label: string; body: string; header?: string[]; left?: number; right?: number; flat?: boolean; dual?: { top: string[]; bottom: string[] } }
  | { kind: 'offboard'; label: string; body: string; w?: number; h?: number };

const FOOTPRINTS: Record<string, Footprint> = {
  resistor: { kind: 'inline', bb: 'resistor', offsets: [0, 4], axial: true },
  diode: { kind: 'inline', bb: 'diode', offsets: [0, 4], axial: true },
  led: { kind: 'inline', bb: 'led', offsets: [0, 1] },
  'rgb-led': { kind: 'inline', bb: 'rgbled', offsets: [0, 1, 2, 3] },
  capacitor: { kind: 'inline', bb: 'capacitor', offsets: [0, 1] },
  electrolytic: { kind: 'inline', bb: 'electrolytic', offsets: [0, 1] },
  ldr: { kind: 'inline', bb: 'ldr', offsets: [0, 1] },
  ntc: { kind: 'inline', bb: 'ntc', offsets: [0, 1] },
  pushbutton: { kind: 'inline', bb: 'button', offsets: [0, 2] },
  buzzer: { kind: 'inline', bb: 'buzzer', offsets: [0, 3] },
  npn: { kind: 'inline', bb: 'to92', offsets: [0, 1, 2] },
  potentiometer: { kind: 'inline', bb: 'pot', offsets: [0, 1, 2] },
  'slide-switch': { kind: 'inline', bb: 'switch', offsets: [0, 1, 2] },
  ne555: { kind: 'dip', label: 'NE555P', order: ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC'] },
  mcp3008: { kind: 'dip', label: 'MCP3008', order: ['CH0', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'DGND', 'CS', 'DIN', 'DOUT', 'CLK', 'AGND', 'VREF', 'VDD'] },
  // Real board sizes at 2.54 mm per hole: OLED 27 mm (11 holes), GY-521 21 mm with 8 pins, DHT22 15 mm, HC-SR04 45 mm, HC-SR501 32 mm.
  ssd1306: { kind: 'module', label: 'OLED 0.96"', body: '#14243f', header: ['GND', 'VCC', 'SCL', 'SDA'], left: 3, right: 4, flat: true },
  mpu6050: { kind: 'module', label: 'MPU-6050 (GY-521)', body: '#1f4e9a', header: ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'], flat: true },
  dht22: { kind: 'module', label: 'DHT22', body: '#e9ecef', header: ['VCC', 'DATA', 'NC', 'GND'], left: 1, right: 1 },
  hcsr04: { kind: 'module', label: 'HC-SR04', body: '#1f5fa8', header: ['VCC', 'TRIG', 'ECHO', 'GND'], left: 7, right: 7 },
  pir: { kind: 'module', label: 'PIR (HC-SR501)', body: '#2e7d4f', header: ['VCC', 'OUT', 'GND'], left: 5, right: 5, flat: true },
  soil: { kind: 'offboard', label: 'Soil sensor (in the pot)', body: '#b03030', w: 90, h: 70 },
  'level-shifter': { kind: 'module', label: 'Level shifter', body: '#b0302a', dual: { top: ['LV1', 'LV2', 'LV', 'GND', 'LV3', 'LV4'], bottom: ['HV1', 'HV2', 'HV', 'GND', 'HV3', 'HV4'] } },
  lcd1602: { kind: 'offboard', label: 'LCD 16×2 (I2C)', body: '#1f6f3f', w: 220, h: 80 },
  epaper29: { kind: 'offboard', label: 'E-paper 2.9"', body: '#2a2a2a', w: 240, h: 90 },
  'neopixel-ring': { kind: 'offboard', label: 'NeoPixel ring', body: '#222', w: 110, h: 90 },
  servo: { kind: 'offboard', label: 'Servo', body: '#1f4fa0', w: 110, h: 60 },
  relay: { kind: 'offboard', label: 'Relay module', body: '#1f5fa8', w: 150, h: 70 },
  'dc-motor': { kind: 'offboard', label: 'DC motor', body: '#9aa0a6', w: 90, h: 60 },
  'battery-9v': { kind: 'offboard', label: '9 V battery', body: '#333' },
  rpi4: { kind: 'offboard', label: 'Raspberry Pi 4 (GPIO header)', body: '#2d7a3e', w: 300, h: 110 },
};

function footprintFor(type: string, pinCount: number): Footprint {
  if (FOOTPRINTS[type]) return FOOTPRINTS[type];
  // Datasheet-defined parts: take the physical form from their KiCad footprint.
  const def = partDef(type);
  const fpName = def.kicad.footprint ?? '';
  if (/TO-92/.test(fpName) && def.pins.length === 3) return { kind: 'inline', bb: 'to92', offsets: [0, 1, 2] };
  const dip = /DIP-(\d+)/.exec(fpName);
  if (dip && Number(dip[1]) === def.pins.length) return { kind: 'dip', label: def.name.split(/[ (]/)[0], order: def.pins.map((p) => p.name) };
  // Datasheet modules with connectors on more than one edge are wired with jumper leads, whatever their size.
  if (customSpec(type)?.cabled) return { kind: 'offboard', label: partDef(type).name, body: '#3a4a5c', w: 40 + pinCount * 22, h: 80 };
  return FOOTPRINTS[type] ?? (pinCount <= 8 ? { kind: 'module', label: partDef(type).name.split(/[ (]/)[0], body: '#3a4a5c' } : { kind: 'offboard', label: partDef(type).name, body: '#3a4a5c', w: 40 + pinCount * 22, h: 80 });
}

const SIGNAL_COLORS = ['#2e7d32', '#1e88e5', '#f9a825', '#8e24aa', '#ffffff', '#546e7a', '#6d4c41', '#ef6c00'];
const LEAD_ORDER: Record<string, string[]> = { servo: ['#6d4c41', '#d22', '#ef6c00'] };

// ------------------------------------------------------------------ placer
interface Leg { part: PartInstance; pin: string; hole: Hole }

export function planBreadboard(project: Project): BreadboardPlan {
  const { nets, netOf } = buildNets(project);
  const board = boardFor(project.board);
  const boardPart = project.parts.find((p) => partDef(p.type).category === 'board');
  const refOf = (p: PartInstance) => p.ref ?? p.id;
  const netFor = (p: PartInstance, pin: string) => netOf.get(`${p.id}:${pin}`)!;
  const wiredPins = new Set(project.wires.flatMap((w) => [`${w.a.part}:${w.a.pin}`, `${w.b.part}:${w.b.pin}`]));
  // A net matters only if it joins two or more pins that are actually wired.
  const realNet = (n: Net) => n.pins.filter((r) => wiredPins.has(`${r.part}:${r.pin}`)).length >= 2;

  // Power: the most-used supply net goes on the + rails; ground on the − rails.
  const isGnd = (n: Net) => /^GND/.test(n.name);
  const supplies = nets.filter((n) => /^(\+3V3|\+5V|VBAT)/.test(n.name) && realNet(n)).sort((a, b) => b.pins.length - a.pins.length);
  const railNet = supplies[0];
  const railVoltage = !railNet ? '' : railNet.name.startsWith('+3V3') ? '3.3 V' : railNet.name.startsWith('+5V') ? '5 V' : `${project.parts.find((p) => p.type === 'battery-9v')?.props.volts ?? 9} V`;
  const railOf = (n: Net): '-' | '+' | null => (isGnd(n) ? '-' : n === railNet ? '+' : null);

  let cols = COLS;
  const used = new Set<Hole>();
  const blocked = new Set<Hole>();
  const legs: Leg[] = [];
  const bbParts: BbPart[] = [];
  const wires: BbWire[] = [];
  const steps: BuildStep[] = [];
  const step = (text: string, parts: string[], holes: Hole[], wiresIdx: number[] = []) => steps.push({ text, parts, holes, wires: wiresIdx });
  const problems: string[] = [];

  const put = (part: PartInstance, pin: string, hole: Hole) => {
    if (used.has(hole) || blocked.has(hole)) problems.push(`hole ${hole} used twice (${refOf(part)}.${pin})`);
    used.add(hole);
    legs.push({ part, pin, hole });
  };
  const holeIn = (row: string, col: number) => `${row}${col}`;
  const free = (h: Hole) => !used.has(h) && !blocked.has(h);

  // ---- 1. the board (no board: leave the first columns for the battery leads and the rail bridges)
  let start = boardPart ? 1 : 5;
  if (board && boardPart) {
    const bp: BbPart = { ref: refOf(boardPart), kind: 'pico', legs: {} };
    if (board.id === 'pico') {
      bp.legs = picoLegs();
      for (let c = 1; c <= 20; c++) for (const r of 'defg') blocked.add(holeIn(r, c));
      start = 22;
    } else if (board.id === 'esp32') {
      bp.kind = 'esp32';
      // USB end at column 1: the top row is the left header read from the USB end, the bottom row the right header.
      [...ESP32_LEFT].reverse().forEach((n, i) => (bp.legs[n] = `b${i + 1}`));
      ESP32_RIGHT.forEach((n, i) => (bp.legs[n] = `i${i + 1}`));
      for (let c = 1; c <= 19; c++) for (const r of 'cdefgh') blocked.add(holeIn(r, c));
      for (let c = 16; c <= 19; c++) for (const r of 'abij') blocked.add(holeIn(r, c));
      start = 21;
    } else if (board.id === 'rpi4') {
      // A 40-pin T-Cobbler breakout straddles the gap; a ribbon cable goes to the Pi's GPIO header.
      bp.kind = 'cobbler';
      for (const pin of board.pins) bp.legs[pin.name] = pin.physical! % 2 ? `h${(pin.physical! + 1) / 2}` : `c${pin.physical! / 2}`;
      bp.pinLabels = Object.fromEntries(board.pins.map((pin) => [pin.name, pin.gpio !== undefined ? String(pin.gpio) : pin.name.replace(/\.\d+$/, '').replace('ID_S', 'ID')]));
      for (let c = 1; c <= 20; c++) for (const r of 'defg') blocked.add(holeIn(r, c));
      start = 22;
    }
    {
      for (const [pin, h] of Object.entries(bp.legs)) put(boardPart, pin, h);
      bbParts.push(bp);
      step(
        board.id === 'pico'
          ? `Push the Raspberry Pi Pico into the board so it straddles the centre gap with its USB socket hanging off the left end: its top pins go in row c, columns 1–20 (pin 40, VBUS, in c1) and its bottom pins in row h (pin 1, GP0, in h1). Press evenly on both ends until it sits flat.`
          : board.id === 'rpi4'
            ? `Push the 40-pin T-Cobbler breakout into the board so it straddles the centre gap at columns 1–20, ribbon socket on the left: even-numbered Pi pins (2, 4 … 40) go in row c, odd pins (1, 3 … 39) in row h. Plug the ribbon cable into the cobbler and into the Pi's GPIO header with the coloured edge of the cable on pin 1 (the corner nearest the SD card). Leave the Pi switched off while you wire.`
            : `Push the ESP32 DevKit into the board across the centre gap with its USB socket at the left end: its top pins go in row b, columns 1–15 (VIN in b1) and its bottom pins in row i (3V3 in i1). It covers rows c–h, so rows a and j are the only free holes next to it — that's normal for this board.`,
        [bp.ref],
        Object.values(bp.legs),
      );
    }
  }

  // ---- 2. chips across the gap
  const half = { T: start, B: start };
  const advance = (h: 'T' | 'B', col: number) => (half[h] = Math.max(half[h], col));
  for (const part of project.parts) {
    const fp = footprintFor(part.type, partDef(part.type).pins.length);
    if (fp.kind !== 'dip') continue;
    const n = fp.order.length / 2;
    const c0 = Math.max(half.T, half.B);
    const bp: BbPart = { ref: refOf(part), kind: 'dip', label: fp.label, legs: {} };
    fp.order.forEach((pin, i) => {
      const h = i < n ? holeIn('f', c0 + i) : holeIn('e', c0 + (2 * n - 1 - i));
      bp.legs[pin] = h;
      put(part, pin, h);
    });
    bbParts.push(bp);
    half.T = half.B = c0 + n + 2;
    step(`${refOf(part)} ${fp.label} chip: straddle the centre gap with the notch (and the dot by pin 1) facing left. Pin 1 (${fp.order[0]}) goes in f${c0}, pin ${n} in f${c0 + n - 1}; pin ${n + 1} is above it in e${c0 + n - 1} and pin ${2 * n} (${fp.order[2 * n - 1]}) in e${c0}. Bent legs: press them straight against the table first.`, [bp.ref], Object.values(bp.legs));
  }

  // ---- 3. modules in the top half (header in row b), sized like the real boards
  for (const part of project.parts) {
    const def = partDef(part.type);
    const fp = footprintFor(part.type, def.pins.length);
    if (fp.kind !== 'module') continue;
    const isPin = (n: string) => def.pins.some((p) => p.name === n);
    const bp: BbPart = { ref: refOf(part), kind: 'module', label: fp.label, body: fp.body, legs: {}, pinLabels: {} };
    // Header pins the design doesn't use still sit in a hole; nothing else may share their strip.
    const plug = (name: string, h: Hole, others: string) => {
      const key = isPin(name) && !bp.legs[name] ? name : `~${name}`;
      bp.legs[key] = h;
      bp.pinLabels![key] = name;
      if (key === name) put(part, name, h);
      else {
        used.add(h);
        for (const r of others) blocked.add(holeIn(r, Number(h.slice(1))));
      }
    };
    if (fp.dual) {
      // Two headers across the centre gap (rows d and g); the board covers rows e and f between them.
      const n = Math.max(fp.dual.top.length, fp.dual.bottom.length);
      const c0 = Math.max(half.T, half.B);
      if (c0 + n > cols) cols = c0 + n + 1;
      fp.dual.top.forEach((name, i) => plug(name, holeIn('d', c0 + i), 'abc'));
      fp.dual.bottom.forEach((name, i) => plug(name, holeIn('g', c0 + i), 'hij'));
      for (let c = c0; c < c0 + n; c++) for (const r of 'ef') blocked.add(holeIn(r, c));
      bp.span = [c0, c0 + n - 1];
      bbParts.push(bp);
      half.T = half.B = c0 + n + 1;
      step(`${refOf(part)} ${fp.label}: it has a header on each side. Put it across the centre gap with ${fp.dual.top.slice(0, 3).join('/')}… in row d (${fp.dual.top.map((p, i) => `${p} d${c0 + i}`).join(', ')}) and ${fp.dual.bottom.slice(0, 3).join('/')}… in row g (${fp.dual.bottom.map((p, i) => `${p} g${c0 + i}`).join(', ')}). Check the labels printed next to its pins match.`, [bp.ref], Object.values(bp.legs));
      continue;
    }
    const header = fp.header ?? def.pins.map((p) => p.name);
    const left = fp.left ?? 0;
    const right = fp.right ?? 0;
    const c0 = half.T + left;
    const lo = c0 - left;
    const hi = c0 + header.length - 1 + right;
    if (hi + 1 > cols) cols = hi + 2;
    header.forEach((name, i) => plug(name, holeIn('b', c0 + i), 'cde'));
    for (let c = lo; c <= hi; c++) {
      blocked.add(holeIn('a', c));
      if (fp.flat) for (const r of ['T+', 'T-']) blocked.add(`${r}${c}`);
    }
    bp.span = [lo, hi];
    bp.flat = !!fp.flat;
    bbParts.push(bp);
    half.T = hi + 2;
    const spare = header.filter((n) => !isPin(n) || !project.wires.some((w) => (w.a.part === part.id && w.a.pin === n) || (w.b.part === part.id && w.b.pin === n)));
    step(
      `${refOf(part)} ${fp.label}: plug its ${header.length}-pin header into row b — ${header.map((n, i) => `${n} in b${c0 + i}`).join(', ')}.${spare.length ? ` (${spare.join(', ')} ${spare.length > 1 ? 'aren’t' : 'isn’t'} used.)` : ''} ${fp.flat ? `The board lies flat, reaching out over the top power rails from column ${lo} to ${hi}, so its power wires go to rail holes just beside it.` : `It stands upright${left || right ? ` and is about ${hi - lo + 1} holes wide (columns ${lo}–${hi})` : ''}.`}`,
      [bp.ref],
      Object.values(bp.legs),
    );
  }

  // ---- 4. discrete parts, chained so neighbours share a strip (e.g. resistor → LED)
  const discretes = project.parts.filter((p) => footprintFor(p.type, partDef(p.type).pins.length).kind === 'inline');
  const touchesBoard = (p: PartInstance) => partDef(p.type).pins.some((pin) => netFor(p, pin.name).pins.some((r) => r.part === boardPart?.id) && !railOf(netFor(p, pin.name)));
  const queue = [...discretes.filter(touchesBoard), ...discretes.filter((p) => !touchesBoard(p))];
  const placed = new Set<string>();
  const ROWS = { B: { axial: 'g', radial: 'h', alt: ['i', 'f', 'g', 'h'] }, T: { axial: 'd', radial: 'c', alt: ['b', 'e', 'd', 'c'] } };
  let open = null as { net: Net; col: number; h: 'T' | 'B' } | null;

  const placeInline = (part: PartInstance, pinOrder: string[], col: number, h: 'T' | 'B'): boolean => {
    const fp = footprintFor(part.type, pinOrder.length) as Extract<Footprint, { kind: 'inline' }>;
    if (part.type === 'pushbutton') return placeButton(part, pinOrder, col, h);
    const pref = fp.axial ? ROWS[h].axial : ROWS[h].radial;
    const row = [pref, ...ROWS[h].alt].find((r) => fp.offsets.every((o) => free(holeIn(r, col + o)) && col + o <= cols));
    if (!row) return false;
    const bp: BbPart = { ref: refOf(part), kind: fp.bb, legs: {}, color: part.props.color, ohms: part.props.ohms ?? part.props.resistance, farads: part.props.farads ?? part.props.capacitance, label: part.type === 'npn' ? '2N2222' : fp.bb === 'to92' ? partDef(part.type).name.split(/[ (]/)[0] : undefined };
    pinOrder.forEach((pin, i) => {
      bp.legs[pin] = holeIn(row, col + fp.offsets[i]);
      put(part, pin, bp.legs[pin]);
    });
    bbParts.push(bp);
    placed.add(part.id);
    const last = pinOrder[pinOrder.length - 1];
    open = { net: netFor(part, last), col: col + fp.offsets[fp.offsets.length - 1], h };
    advance(h, open.col + 3);
    return true;
  };
  // The usual 6 mm push button has 4 legs and straddles the centre gap: the two legs facing each
  // other across the gap are joined inside it, and pressing joins column `col` to column `col + 2`.
  const placeButton = (part: PartInstance, pinOrder: string[], col: number, h: 'T' | 'B'): boolean => {
    const near = h === 'T' ? 'e' : 'f';
    const far = h === 'T' ? 'f' : 'e';
    const farStrip = h === 'T' ? ROWS_BOTTOM : ROWS_TOP;
    const ok = col + 2 <= cols && [col, col + 2].every((c) => free(holeIn(near, c)) && [...farStrip].every((r) => free(holeIn(r, c)))) && free(holeIn('e', col + 1)) && free(holeIn('f', col + 1));
    if (!ok) return false;
    const bp: BbPart = { ref: refOf(part), kind: 'button', legs: {}, color: part.props.color };
    pinOrder.forEach((pin, i) => {
      const c = col + 2 * i;
      bp.legs[pin] = holeIn(near, c);
      put(part, pin, bp.legs[pin]);
      // The leg across the gap is the same contact: its whole strip belongs to this pin.
      bp.legs[`${pin}.2`] = holeIn(far, c);
      used.add(holeIn(far, c));
      for (const r of farStrip) blocked.add(holeIn(r, c));
    });
    // The body sits over the gap between the legs.
    blocked.add(holeIn('e', col + 1));
    blocked.add(holeIn('f', col + 1));
    bbParts.push(bp);
    placed.add(part.id);
    open = { net: netFor(part, pinOrder[pinOrder.length - 1]), col: col + 2, h };
    advance(h, col + 4);
    advance(h === 'T' ? 'B' : 'T', col + 4);
    return true;
  };
  const orderPins = (part: PartInstance, first?: Net): string[] | null => {
    const pins = partDef(part.type).pins.map((p) => p.name);
    if (!first) {
      // Start a chain with the pin that goes to the board / a signal, so the chain runs away from it.
      if (pins.length === 2) {
        const sig = pins.find((pn) => !railOf(netFor(part, pn)) && netFor(part, pn).pins.some((r) => r.part === boardPart?.id)) ?? pins.find((pn) => !railOf(netFor(part, pn)));
        return sig === pins[1] ? [pins[1], pins[0]] : pins;
      }
      return pins;
    }
    if (netFor(part, pins[0]) === first) return pins;
    if (netFor(part, pins[pins.length - 1]) === first) return [...pins].reverse();
    return null;
  };

  const fits = (part: PartInstance, h: 'T' | 'B', col: number) => {
    const fp = footprintFor(part.type, 0) as Extract<Footprint, { kind: 'inline' }>;
    return col + fp.offsets[fp.offsets.length - 1] <= cols - 1;
  };
  while (placed.size < discretes.length) {
    // Continue the open chain if a part can share its last strip.
    let next: PartInstance | undefined;
    let order: string[] | null = null;
    if (open && !railOf(open.net)) {
      for (const p of queue) {
        if (placed.has(p.id)) continue;
        order = orderPins(p, open.net);
        if (order) { next = p; break; }
      }
    }
    if (next && order && open && fits(next, open.h, open.col) && placeInline(next, order, open.col, open.h)) continue;
    // Otherwise start a new chain in whichever half has more room.
    const p = queue.find((x) => !placed.has(x.id))!;
    const h: 'T' | 'B' = half.B <= half.T + 6 ? 'B' : 'T';
    let col = half[h];
    let hh = h;
    if (!fits(p, h, col)) {
      hh = h === 'B' ? 'T' : 'B';
      col = half[hh];
      if (!fits(p, hh, col)) cols = Math.max(cols, col + 6);
    }
    open = null;
    if (!placeInline(p, orderPins(p)!, col, hh)) {
      // Past everything placed in either half (a straddling button needs both).
      const c2 = Math.max(half.T, half.B, col);
      if (c2 + 6 > cols) cols = c2 + 6;
      if (!placeInline(p, orderPins(p)!, c2, hh)) {
        problems.push(`no room for ${refOf(p)}`);
        placed.add(p.id);
      }
    }
  }
  for (const bp of bbParts.filter((b) => !['pico', 'esp32', 'dip', 'module'].includes(b.kind))) {
    const part = project.parts.find((p) => refOf(p) === bp.ref)!;
    step(describeInline(part, bp), [bp.ref], Object.values(bp.legs));
  }

  // ---- 5. wiring: every net becomes shared strips, jumpers, rail jumpers and off-board leads
  const stripsOf = (net: Net) => [...new Set(legs.filter((l) => netFor(l.part, l.pin) === net && (l.part.id !== boardPart?.id || wiredPins.has(`${l.part.id}:${l.pin}`))).map((l) => stripOf(l.hole)))];
  const accessOrder = (strip: string) => (strip.startsWith('T') ? ROWS_TOP.split('') : ROWS_BOTTOM.split('').reverse()).map((r) => holeIn(r, Number(strip.slice(1))));
  const take = (strip: string): Hole | null => {
    const h = accessOrder(strip).find(free);
    if (h) used.add(h);
    return h ?? null;
  };
  const isBoardStrip = (strip: string) => legs.some((l) => l.part.id === boardPart?.id && stripOf(l.hole) === strip);
  const railHole = (rail: '+' | '-', side: 'T' | 'B', col: number): Hole => {
    for (let d = 0; d < cols; d++)
      for (const c of [col + d, col - d]) {
        if (c < 1 || c > cols || !railHoleAt(c)) continue;
        const h = `${side}${rail}${c}`;
        if (free(h)) { used.add(h); return h; }
      }
    problems.push(`no free ${side}${rail} rail hole`);
    return `${side}${rail}1`;
  };
  const pinWords = (l: Leg) => {
    if (l.part.id === boardPart?.id) return `${board!.short} pin ${l.pin.replace(/\.\d+$/, '')}${board!.pins.find((b) => b.name === l.pin)?.physical ? ` (header pin ${board!.pins.find((b) => b.name === l.pin)!.physical})` : ''}`;
    const fp = footprintFor(l.part.type, partDef(l.part.type).pins.length);
    if (fp.kind === 'dip') return `${refOf(l.part)} pin ${fp.order.indexOf(l.pin) + 1} (${l.pin})`;
    if (l.part.type === 'led') return `${refOf(l.part)} ${l.pin === 'A' ? '+' : '−'}`;
    return partDef(l.part.type).pins.length > 2 || ['electrolytic', 'buzzer', 'diode'].includes(l.part.type) ? `${refOf(l.part)} ${l.pin.replace('-', '−')}` : refOf(l.part);
  };
  const describeStrip = (strip: string) => {
    const here = legs.filter((l) => stripOf(l.hole) === strip);
    return here.map((l) => pinWords(l)).join(' / ') || 'empty strip';
  };
  // One colour per connection everywhere: use the colour the wiring table gives this net's wires.
  const tableColour = (net: Net): string | undefined => {
    const counts = new Map<string, number>();
    for (const w of project.wires) if (netOf.get(`${w.a.part}:${w.a.pin}`) === net && w.color) counts.set(w.color, (counts.get(w.color) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  // A jumper that stands in for one wiring-table wire takes that wire's colour.
  const wireColourBetween = (sa: string, sb: string): string | undefined => {
    const at = (s: string) => new Set(legs.filter((l) => stripOf(l.hole) === s).map((l) => `${l.part.id}:${l.pin}`));
    const A = at(sa);
    const B = at(sb);
    const key = (r: { part: string; pin: string }) => `${r.part}:${r.pin}`;
    return project.wires.find((w) => w.color && ((A.has(key(w.a)) && B.has(key(w.b))) || (A.has(key(w.b)) && B.has(key(w.a)))))?.color;
  };
  const colorFor = (net: Net, i: number) => (isGnd(net) ? '#222' : net === railNet ? '#d22' : tableColour(net) ?? (/^\+5V/.test(net.name) ? '#ef6c00' : SIGNAL_COLORS[i % SIGNAL_COLORS.length]));

  const jumper = (from: Hole, to: Hole, color: string, why: string) => {
    wires.push({ from, to, color });
    step(`${cap(colourName(color))} jumper from ${from} to ${to} — ${why}.`, [], [from, to], [wires.length - 1]);
  };

  // Rails first: join the top and bottom rails next to where the power comes in (the board, or the battery on the left).
  const bridgeCol = boardPart ? start - 1 : 2;
  if (nets.some((n) => isGnd(n) && realNet(n))) jumper(railHole('-', 'T', bridgeCol), railHole('-', 'B', bridgeCol), '#222', 'joins the top and bottom − (ground) rails');
  if (railNet) jumper(railHole('+', 'T', bridgeCol + 1), railHole('+', 'B', bridgeCol + 1), '#d22', `joins the top and bottom + rails (${railVoltage})`);

  // Off-board parts: leads, collected per part.
  const offParts = project.parts.filter((p) => footprintFor(p.type, partDef(p.type).pins.length).kind === 'offboard' && p.type !== 'battery-9v' && partDef(p.type).category !== 'board');
  const offLegs = new Map<string, BbPart>();
  for (const p of offParts) {
    const fp = footprintFor(p.type, partDef(p.type).pins.length) as Extract<Footprint, { kind: 'offboard' }>;
    offLegs.set(p.id, { ref: refOf(p), kind: 'offboard', label: fp.label, body: fp.body, legs: {}, pinLabels: {}, leadColors: {}, at: { x: 0, y: 0, w: fp.w ?? 140, h: fp.h ?? 70 } });
  }
  const battery = project.parts.find((p) => p.type === 'battery-9v');
  let batteryStep = () => {};

  let sigIdx = 0;
  for (const net of nets) {
    if (!realNet(net)) continue;
    const rail = railOf(net);
    const color = colorFor(net, rail ? 0 : sigIdx++);
    const offPins = net.pins.filter((r) => offLegs.has(r.part) && wiredPins.has(`${r.part}:${r.pin}`));
    const strips = stripsOf(net);
    const lead = (r: { part: string; pin: string }, hole: Hole) => {
      const bp = offLegs.get(r.part)!;
      const part = project.parts.find((p) => p.id === r.part)!;
      bp.legs[r.pin] = hole;
      used.add(hole);
      bp.pinLabels![r.pin] = part.type === 'rpi4' ? `${r.pin.replace(/\.\d+$/, '')} (pin ${board?.pins.find((b) => b.name === r.pin)?.physical ?? '?'})` : r.pin;
      bp.leadColors![r.pin] = LEAD_ORDER[part.type]?.[partDef(part.type).pins.findIndex((x) => x.name === r.pin)] ?? (rail === '-' ? '#222' : rail === '+' ? '#d22' : color);
    };
    if (rail) {
      for (const s of strips) {
        const side = s[0] as 'T' | 'B';
        const h = take(s);
        if (!h) { problems.push(`no free hole in strip ${s} for its ${rail} rail jumper`); continue; }
        jumper(h, railHole(rail, side, Number(s.slice(1))), color, `${describeStrip(s)} to the ${rail === '-' ? '− (ground)' : `+ (${railVoltage})`} rail`);
      }
      for (const r of offPins) lead(r, railHole(rail, 'T', 4 + Object.keys(offLegs.get(r.part)!.legs).length));
      continue;
    }
    // Signal net: chain the strips (board strips at the ends: they have the fewest free holes).
    const ordered = [...strips].sort((a, b) => Number(isBoardStrip(b)) - Number(isBoardStrip(a)) || Number(a.slice(1)) - Number(b.slice(1)));
    for (let i = 0; i + 1 < ordered.length; i++) {
      const a = take(ordered[i]);
      const b = take(ordered[i + 1]);
      if (!a || !b) { problems.push(`out of holes joining ${ordered[i]} and ${ordered[i + 1]}`); continue; }
      jumper(a, b, wireColourBetween(ordered[i], ordered[i + 1]) ?? color, `${describeStrip(ordered[i])} to ${describeStrip(ordered[i + 1])}`);
    }
    // Not enough free holes for the off-board leads (or no strip at all): extend the net into an empty column.
    const freeCount = () => ordered.reduce((n, s) => n + accessOrder(s).filter(free).length, 0);
    while (offPins.length >= (ordered.length ? 1 : 2) && freeCount() < offPins.length) {
      const c = half.B;
      advance('B', c + 2);
      if (c > cols) cols = c + 1;
      const junction = `B${c}`;
      if (ordered.length) {
        const from = [...ordered].reverse().find((s) => accessOrder(s).some(free));
        if (!from) break;
        jumper(take(from)!, take(junction)!, color, `${describeStrip(from)} to an empty column, so there are holes for more wires`);
      }
      ordered.push(junction);
    }
    for (const r of offPins) {
      const target = [...ordered].sort((a, b) => accessOrder(b).filter(free).length - accessOrder(a).filter(free).length)[0];
      const h = target ? take(target) : null;
      if (!h) { problems.push(`no hole for ${r.part}.${r.pin}`); continue; }
      lead(r, h);
    }
  }

  // Battery leads go straight into the rails at the left end.
  if (battery) {
    const plus = railHole('+', 'T', 2);
    const minus = railHole('-', 'T', 2);
    bbParts.push({ ref: refOf(battery), kind: 'battery', legs: { '+': plus, '-': minus } });
    legs.push({ part: battery, pin: '+', hole: plus }, { part: battery, pin: '-', hole: minus });
    batteryStep = () => step(`Battery last! Clip the 9 V battery snap on only when everything else is in place: its red lead goes in ${plus} (top + rail) and its black lead in ${minus} (top − rail).`, [refOf(battery)], [plus, minus]);
  }

  // Off-board bodies sit above the board, roughly over the holes they connect to.
  let xCursor = -40;
  for (const bp of [...offLegs.values()].sort((a, b) => meanX(a) - meanX(b))) {
    const w = bp.at!.w;
    const x = Math.max(xCursor, meanX(bp) - w / 2);
    bp.at = { x, y: -60 - bp.at!.h - 50, w, h: bp.at!.h };
    xCursor = x + w + 24;
    bbParts.push(bp);
    const part = project.parts.find((p) => refOf(p) === bp.ref)!;
    for (const [pin, h] of Object.entries(bp.legs)) legs.push({ part, pin, hole: h });
    step(`${bp.ref} ${bp.label} sits off the board. Connect its leads: ${Object.entries(bp.legs).map(([pin, h]) => `${bp.pinLabels![pin] ?? pin} → ${h}`).join(', ')}.${part.type === 'rpi4' ? ' Use female-to-male jumper wires and count header pins from pin 1 (the square pad, next to the SD-card end).' : ''}`, [bp.ref], Object.values(bp.legs));
  }

  batteryStep();

  // Many full-size boards split each rail in the middle; anything past the split needs a bridge.
  const railCols = [...used].map((h) => /^[TB][+-](\d+)$/.exec(h)).filter((m): m is RegExpExecArray => !!m).map((m) => Number(m[1]));
  if (railCols.some((c) => c <= 28) && railCols.some((c) => c >= 33))
    steps.splice(steps.findIndex((st) => st.wires.length) + (railNet ? 2 : 1), 0, {
      text: 'Look along the red and blue rail lines: on many full-size breadboards they stop half-way (around column 30), which means each rail is really two separate halves. If yours has that gap, bridge each of the four rails across it with a short jumper (red for the + rails, black for the − rails). Without it, the parts on the far half get no power.',
      parts: [],
      wires: [],
      holes: [],
    });

  // ---- 6. verify against the schematic
  const layout: BbLayout = { name: project.name, cols, parts: bbParts, wires };
  const norm = (pin: string) => pin.replace(/\.\d+$/, '');
  const onLayout = new Set(legs.map((l) => `${l.part.id}:${l.pin}`));
  const expected = nets
    .filter(realNet)
    .map((n) => [...new Set(n.pins.filter((r) => onLayout.has(`${r.part}:${r.pin}`) && (r.part !== boardPart?.id || wiredPins.has(`${r.part}:${r.pin}`))).map((r) => `${refOf(project.parts.find((p) => p.id === r.part)!)}.${norm(r.pin)}`))].sort())
    .filter((g) => g.length > 1);
  problems.push(...diffConnectivity(connectivity(layout), expected));
  for (const h of [...used]) {
    try { holeXY(h); } catch { problems.push(`bad hole ${h}`); }
  }

  const intro: BuildStep = {
    parts: [],
    wires: [],
    holes: [],
    text: `Lay the breadboard in front of you with column 1 on the left. Rows a–e are the top half and f–j the bottom half; the five holes of each column in a half are joined underneath. The long + (red line) and − (blue line) rails run along both edges. Rail holes are named by edge and sign plus the column above them: T+ and T− are the top rails, B− and B+ the bottom ones, so T−12 is the top − rail at column 12. Rail holes come in groups of five with a gap every sixth column, so a wire to a rail sometimes lands one column over.${cols > COLS ? ` This build needs ${cols} columns: clip a second breadboard onto the right-hand end so the columns continue (${COLS + 1}…).` : ''}`,
  };
  return { layout, steps: [intro, ...steps], expected, problems, railVoltage };
}

function meanX(bp: BbPart) {
  const xs = Object.values(bp.legs).map((h) => holeXY(h).x);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function describeInline(part: PartInstance, bp: BbPart): string {
  const def = partDef(part.type);
  const L = bp.legs;
  switch (part.type) {
    case 'resistor':
      return `${bp.ref} ${fmtOhms(bp.ohms)} resistor: one leg in ${L['1']}, the other in ${L['2']} (either way round).`;
    case 'led':
      return `${bp.ref} ${part.props.color ?? ''} LED: long leg (+) in ${L.A}, short leg (−, flat edge of the rim) in ${L.C}. This one must be the right way round.`;
    case 'electrolytic':
      return `${bp.ref} electrolytic capacitor: long leg (+) in ${L['+']}, the leg by the stripe (−) in ${L['-']}. Must be the right way round.`;
    case 'capacitor':
      return `${bp.ref} ${part.props.farads ?? part.props.capacitance ? `${fmtFarads(Number(part.props.farads ?? part.props.capacitance))} ` : ''}ceramic capacitor: legs in ${L['1']} and ${L['2']} (either way round).`;
    case 'diode':
      return `${bp.ref} diode: the end with the stripe (cathode) in ${L.K}, the other end in ${L.A}.`;
    case 'pushbutton':
      return `${bp.ref} push button (the usual square 4-leg one): push it across the centre gap with its legs in ${L['1']}, ${L['2']}, ${L['1.2']} and ${L['2.2']}. It only fits easily one way round; if the program later acts as if it is always pressed, turn it a quarter turn.`;
    case 'buzzer':
      return `${bp.ref} buzzer: + leg (marked +, usually longer) in ${L['+']}, the other in ${L['-']}.`;
    case 'npn':
      return `${bp.ref} NPN transistor (2N2222/BC547): flat face towards you, legs E in ${L.E}, B in ${L.B}, C in ${L.C} — check the order printed on its datasheet.`;
    case 'rgb-led':
      return `${bp.ref} RGB LED: longest leg (common −) in ${L.COM}; red in ${L.R}, green in ${L.G}, blue in ${L.B}.`;
    default:
      return `${bp.ref} ${def.name}: ${Object.entries(L).map(([pin, h]) => `${pin} in ${h}`).join(', ')}.`;
  }
}

function fmtFarads(f: number) {
  return f >= 1e-6 ? `${+(f * 1e6).toPrecision(3)} µF` : f >= 1e-9 ? `${+(f * 1e9).toPrecision(3)} nF` : `${+(f * 1e12).toPrecision(3)} pF`;
}

function fmtOhms(o?: number) {
  if (!o) return '';
  return o >= 1e6 ? `${o / 1e6} MΩ` : o >= 1000 ? `${o / 1000} kΩ` : `${o} Ω`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
