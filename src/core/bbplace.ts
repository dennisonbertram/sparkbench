// Automatic breadboard layout: puts every part of a project into named holes of an 830-point
// breadboard, adds the jumpers and power-rail wiring, and verifies that what the layout connects
// is exactly what the schematic says. The result drives the hole-by-hole build steps, the
// breadboard picture and the photo wiring check.
import type { Net, PartInstance, Project } from './types';
import { partDef } from './parts';
import { buildNets } from './netlist';
import { boardFor, ESP32_LEFT, ESP32_RIGHT } from './boards';
import { connectivity, diffConnectivity, holeXY, picoLegs, railHoleAt, stripOf, COLS, ROWS_TOP, ROWS_BOTTOM, type BbKind, type BbLayout, type BbPart, type BbWire, type Hole } from './breadboard';

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
  | { kind: 'module'; label: string; body: string }
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
  ssd1306: { kind: 'module', label: 'OLED 0.96"', body: '#14243f' },
  mpu6050: { kind: 'module', label: 'MPU-6050', body: '#1f4e9a' },
  dht22: { kind: 'module', label: 'DHT22', body: '#e9ecef' },
  hcsr04: { kind: 'module', label: 'HC-SR04', body: '#1f5fa8' },
  pir: { kind: 'module', label: 'PIR', body: '#2e7d4f' },
  soil: { kind: 'module', label: 'Soil sensor', body: '#b03030' },
  'level-shifter': { kind: 'module', label: 'Level shifter', body: '#b0302a' },
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
  return FOOTPRINTS[type] ?? (pinCount <= 8 ? { kind: 'module', label: partDef(type).name.split(/[ (]/)[0], body: '#3a4a5c' } : { kind: 'offboard', label: partDef(type).name, body: '#3a4a5c', w: 40 + pinCount * 22, h: 80 });
}

const SIGNAL_COLORS = ['#2a9d3a', '#1e88e5', '#f9a825', '#8e24aa', '#00838f', '#c2185b', '#ef6c00', '#6d4c41', '#7cb342', '#5c6bc0'];
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

  // ---- 1. the board
  let start = 1;
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
    half.T = half.B = c0 + n + 1;
    step(`${refOf(part)} ${fp.label} chip: straddle the centre gap with the notch (and the dot by pin 1) facing left. Pin 1 (${fp.order[0]}) goes in f${c0}, pin ${n} in f${c0 + n - 1}; pin ${n + 1} is above it in e${c0 + n - 1} and pin ${2 * n} (${fp.order[2 * n - 1]}) in e${c0}. Bent legs: press them straight against the table first.`, [bp.ref], Object.values(bp.legs));
  }

  // ---- 3. modules in the top half (header in row b; the body covers row a)
  for (const part of project.parts) {
    const def = partDef(part.type);
    const fp = footprintFor(part.type, def.pins.length);
    if (fp.kind !== 'module') continue;
    const c0 = half.T;
    if (c0 + def.pins.length > cols) cols = c0 + def.pins.length + 1;
    const bp: BbPart = { ref: refOf(part), kind: 'module', label: fp.label, body: fp.body, legs: {}, pinLabels: {} };
    def.pins.forEach((pin, i) => {
      const h = holeIn('b', c0 + i);
      bp.legs[pin.name] = h;
      bp.pinLabels![pin.name] = pin.name;
      put(part, pin.name, h);
      blocked.add(holeIn('a', c0 + i));
    });
    bbParts.push(bp);
    half.T = c0 + def.pins.length + 1;
    step(`${refOf(part)} ${fp.label}: plug its header pins into row b, ${def.pins.map((p, i) => `${p.name} in b${c0 + i}`).join(', ')}. The board leans over row a.`, [bp.ref], Object.values(bp.legs));
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
    advance(h, open.col + 2);
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
      cols += 6;
      placeInline(p, orderPins(p)!, col, hh);
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
    if (l.part.id === boardPart?.id) return `${board!.short} ${l.pin.replace(/\.\d+$/, '')}${board!.pins.find((b) => b.name === l.pin)?.physical ? ` (pin ${board!.pins.find((b) => b.name === l.pin)!.physical})` : ''}`;
    const fp = footprintFor(l.part.type, partDef(l.part.type).pins.length);
    if (fp.kind === 'dip') return `${refOf(l.part)} pin ${fp.order.indexOf(l.pin) + 1} (${l.pin})`;
    if (l.part.type === 'led') return `${refOf(l.part)} ${l.pin === 'A' ? '+' : '−'}`;
    return partDef(l.part.type).pins.length > 2 || ['electrolytic', 'buzzer', 'diode'].includes(l.part.type) ? `${refOf(l.part)} ${l.pin}` : refOf(l.part);
  };
  const describeStrip = (strip: string) => {
    const here = legs.filter((l) => stripOf(l.hole) === strip);
    return here.map((l) => pinWords(l)).join(' / ') || 'empty strip';
  };
  const colorFor = (net: Net, i: number) => (isGnd(net) ? '#222' : net === railNet ? '#d22' : /^\+5V/.test(net.name) ? '#ef6c00' : SIGNAL_COLORS[i % SIGNAL_COLORS.length]);

  const jumper = (from: Hole, to: Hole, color: string, why: string) => {
    wires.push({ from, to, color });
    step(`${cap(colorWord(color))} jumper from ${from} to ${to} — ${why}.`, [], [from, to], [wires.length - 1]);
  };

  // Rails first: bridge top and bottom rails at the right-hand end.
  const bridgeCol = [cols - 1, cols - 2, cols - 3, cols - 4].find(railHoleAt)!;
  if (nets.some((n) => isGnd(n) && realNet(n))) jumper(railHole('-', 'T', bridgeCol), railHole('-', 'B', bridgeCol), '#222', 'joins the two − (ground) rails');
  if (railNet) jumper(railHole('+', 'T', bridgeCol - 1), railHole('+', 'B', bridgeCol - 1), '#d22', `joins the two + rails (${railVoltage})`);

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
      jumper(a, b, color, `${describeStrip(ordered[i])} to ${describeStrip(ordered[i + 1])}`);
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
    text: `Lay the breadboard in front of you with column 1 on the left. Rows a–e are the top half and f–j the bottom half; the five holes of each column in a half are joined underneath. The long + (red line) and − (blue line) rails run along both edges.${cols > COLS ? ` This build needs ${cols} columns: clip a second breadboard onto the right-hand end so the columns continue (${COLS + 1}…).` : ''}`,
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
    case 'diode':
      return `${bp.ref} diode: the end with the stripe (cathode) in ${L.K}, the other end in ${L.A}.`;
    case 'pushbutton':
      return `${bp.ref} push button: legs in ${L['1']} and ${L['2']}. (A 4-leg button: put it across the centre gap instead and use two legs on the same side.)`;
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

function fmtOhms(o?: number) {
  if (!o) return '';
  return o >= 1e6 ? `${o / 1e6} MΩ` : o >= 1000 ? `${o / 1000} kΩ` : `${o} Ω`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function colorWord(hex: string) {
  return ({ '#222': 'black', '#d22': 'red', '#2a9d3a': 'green', '#1e88e5': 'blue', '#f9a825': 'yellow', '#8e24aa': 'purple', '#00838f': 'teal', '#c2185b': 'pink', '#ef6c00': 'orange', '#6d4c41': 'brown', '#7cb342': 'light green', '#5c6bc0': 'indigo' } as Record<string, string>)[hex] ?? 'a';
}

