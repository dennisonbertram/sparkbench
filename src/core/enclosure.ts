// 3D-printable case for the circuit board, generated from the routed board itself: standoffs at the
// mounting holes, the USB cable opening where the dev board's USB actually is, button holes with
// printed button caps, LED and sensor openings, screen windows, cable slots. Exported as STL.
import * as jscadNs from '@jscad/modeling';

// @jscad/modeling is CommonJS: Node's ESM loader only exposes it as the default export.
const jscad: typeof jscadNs = ((jscadNs as any).default ?? jscadNs) as typeof jscadNs;
const { primitives, booleans, transforms, extrusions, measurements } = jscad;
import { MODULE_BODY } from './pcb';

type Geom = ReturnType<typeof primitives.cuboid>;
const { cuboid, cylinder, roundedRectangle } = primitives;
const { union, subtract } = booleans;
const { translate, rotateX, rotateY, rotateZ } = transforms;
const { extrudeLinear } = extrusions;

export type CaseStyle = 'rounded' | 'minimal' | 'wall-mount' | 'desk-stand';

export interface BoardLayout {
  width_mm: number;
  height_mm: number;
  holes: [number, number][];
  /** Footprint positions relative to the board's top-left corner (y down). */
  parts: { ref: string; x: number; y: number; rot: number; box: [number, number, number, number] }[];
  usb: [number, number] | null;
}

export interface CaseInput {
  board: BoardLayout;
  /** ref → part type */
  types: Record<string, string>;
  style: CaseStyle;
  name: string;
}

export interface CaseOpening {
  ref: string;
  what: string;
  where: 'lid' | 'wall' | 'floor';
}

export interface CaseResult {
  parts: { name: string; geom: Geom; note: string }[];
  outer: { w: number; d: number; h: number };
  openings: CaseOpening[];
  warnings: string[];
  /** Heights used (mm above the board's top surface). */
  tallest: { ref: string; h: number };
}

/** Case constants (mm), shared with the 3D preview. */
export const CASE_DIMS = { WALL: 2.0, FLOOR: 2.0, LID: 2.0, GAP: 1.0, STANDOFF: 5.0, PCB: 1.6 };
const WALL = 2.0;
const FLOOR = 2.0;
const LID = 2.0;
const GAP = 1.0; // board to wall
const STANDOFF = 5.0; // under the board, room for solder joints
const PCB = 1.6;
const SOCKET = 8.5; // female header height

/** Height above the board's top surface, mm. */
const HEIGHT: Record<string, number> = {
  'esp32-devkit': SOCKET + 1.6 + 3.5,
  'pi-pico': SOCKET + 1.0 + 3.2,
  rpi4: 9.0,
  dht22: 25.5,
  led: 8.6,
  'rgb-led': 8.6,
  buzzer: 9.5,
  pushbutton: 5.0,
  potentiometer: 12.0,
  'slide-switch': 9.0,
  capacitor: 6.0,
  electrolytic: 11.0,
  resistor: 3.0,
  diode: 3.0,
  npn: 5.0,
  ne555: 4.5,
  mcp3008: 4.5,
  ldr: 5.0,
  ntc: 5.0,
  'battery-9v': 18.0,
};
const CABLE_TYPES = new Set(['servo', 'dc-motor', 'relay', 'soil', 'neopixel-ring', 'lcd1602', 'epaper29', 'battery-9v', 'rpi4']);

export function partHeight(type: string): number {
  if (MODULE_BODY[type]) return MODULE_BODY[type].h;
  if (CABLE_TYPES.has(type) && type !== 'battery-9v' && type !== 'rpi4') return SOCKET + 6; // header + plugged cable
  return HEIGHT[type] ?? 8;
}

export function buildCase(input: CaseInput): CaseResult {
  const { board, types, style } = input;
  const iw = board.width_mm + 2 * GAP;
  const id = board.height_mm + 2 * GAP;
  const ow = iw + 2 * WALL;
  const od = id + 2 * WALL;
  const boardBottom = FLOOR + STANDOFF;
  const boardTop = boardBottom + PCB;
  let tallest = { ref: '', h: 0 };
  for (const p of board.parts) {
    const h = partHeight(types[p.ref] ?? '');
    if (h > tallest.h) tallest = { ref: p.ref, h };
  }
  const innerTop = boardTop + tallest.h + 2.5;
  const oh = innerTop + LID;
  const radius = style === 'minimal' ? 1 : 5;
  const openings: CaseOpening[] = [];
  const warnings: string[] = [];

  // Board coordinates (x right, y down) → case coordinates (X right, Y up).
  const X = (x: number) => WALL + GAP + x;
  const Y = (y: number) => od - WALL - GAP - y;

  const shell = (w: number, d: number, h: number, r: number) => extrudeLinear({ height: h }, roundedRectangle({ size: [w, d], roundRadius: Math.max(0.01, Math.min(r, w / 2 - 0.1, d / 2 - 0.1)), center: [w / 2, d / 2] }));

  // ---- base: hollow box with standoffs
  let base: Geom = subtract(shell(ow, od, innerTop, radius), translate([WALL, WALL, FLOOR], shell(iw, id, innerTop, Math.max(0.5, radius - WALL))));
  const standoffs: Geom[] = [];
  const screwHoles: Geom[] = [];
  for (const [hx, hy] of board.holes) {
    standoffs.push(translate([X(hx), Y(hy), FLOOR + STANDOFF / 2], cylinder({ radius: 3, height: STANDOFF, segments: 32 })));
    // 2.6 mm pilot for an M3 self-tapping screw
    screwHoles.push(translate([X(hx), Y(hy), FLOOR + STANDOFF / 2 + 0.6], cylinder({ radius: 1.3, height: STANDOFF, segments: 24 })));
  }
  base = subtract(union(base, ...standoffs), ...screwHoles);

  // Wall openings.
  const wallCuts: Geom[] = [];
  const nearestWall = (x: number, y: number): 'left' | 'right' | 'top' | 'bottom' => {
    const d = { left: x, right: board.width_mm - x, top: y, bottom: board.height_mm - y };
    return (Object.entries(d).sort((a, b) => a[1] - b[1])[0][0]) as any;
  };
  const wallSlot = (x: number, y: number, w: number, h: number, z: number, ref: string, what: string) => {
    const side = nearestWall(x, y);
    const cut = side === 'left' || side === 'right' ? cuboid({ size: [WALL * 3, w, h] }) : cuboid({ size: [w, WALL * 3, h] });
    const pos: [number, number, number] =
      side === 'left' ? [WALL / 2, Y(y), z] : side === 'right' ? [ow - WALL / 2, Y(y), z] : side === 'top' ? [X(x), od - WALL / 2, z] : [X(x), WALL / 2, z];
    wallCuts.push(translate(pos, cut));
    openings.push({ ref, what: `${what} (${side} side)`, where: 'wall' });
    const dist = side === 'left' ? x : side === 'right' ? board.width_mm - x : side === 'top' ? y : board.height_mm - y;
    return dist;
  };
  if (board.usb) {
    const devboard = board.parts.find((p) => types[p.ref] === 'esp32-devkit' || types[p.ref] === 'pi-pico');
    const usbZ = boardTop + SOCKET + PCB + 1.5;
    const dist = wallSlot(board.usb[0], board.usb[1], 13, 8, usbZ, devboard?.ref ?? 'U1', 'USB cable opening');
    if (dist > 15) warnings.push(`The USB connector is ${Math.round(dist)} mm from the wall: use a slim USB plug.`);
  }

  // ---- lid: plate with a friction-fit lip, and openings over the parts
  const lipT = 1.2;
  const fit = 0.25;
  let lid: Geom = union(
    shell(ow, od, LID, radius),
    translate([WALL + fit, WALL + fit, -3], subtract(shell(iw - 2 * fit, id - 2 * fit, 3, Math.max(0.5, radius - WALL)), translate([lipT, lipT, -1], shell(iw - 2 * fit - 2 * lipT, id - 2 * fit - 2 * lipT, 5, Math.max(0.5, radius - WALL - lipT))))),
  );
  const lidCuts: Geom[] = [];
  const hole = (x: number, y: number, r: number) => translate([X(x), Y(y), LID / 2], cylinder({ radius: r, height: LID * 6, segments: 40 }));
  const rect = (x: number, y: number, w: number, d: number) => translate([X(x), Y(y), LID / 2], cuboid({ size: [w, d, LID * 6] }));
  const caps: { name: string; geom: Geom; note: string }[] = [];

  for (const p of board.parts) {
    const t = types[p.ref] ?? '';
    const [bx0, by0, bx1, by1] = p.box;
    const cx = (bx0 + bx1) / 2;
    const cy = (by0 + by1) / 2;
    const m = MODULE_BODY[t];
    if (m) {
      // Body lies flat beside its socket (to the right, or above when the socket is horizontal).
      const vertical = Math.round(p.rot) % 180 === 0;
      const body = vertical ? [bx0, cy - m.w / 2, bx0 + m.d, cy + m.w / 2] : [cx - m.w / 2, by1 - m.d, cx + m.w / 2, by1];
      const bcx = (body[0] + body[2]) / 2;
      const bcy = (body[1] + body[3]) / 2;
      if (t === 'ssd1306' && m.window) {
        const wx = vertical ? body[0] + m.window.off + m.window.d / 2 : bcx;
        const wy = vertical ? bcy : body[3] - m.window.off - m.window.d / 2;
        lidCuts.push(vertical ? rect(wx, wy, m.window.d, m.window.w) : rect(wx, wy, m.window.w, m.window.d));
        openings.push({ ref: p.ref, what: 'screen window', where: 'lid' });
      } else if (t === 'pir') {
        lidCuts.push(hole(bcx, bcy, 11.5));
        openings.push({ ref: p.ref, what: 'motion-sensor dome hole', where: 'lid' });
      } else if (t === 'hcsr04') {
        wallSlot(bcx, bcy, 44, 18, boardTop + SOCKET + 9, p.ref, 'opening for the two ultrasonic "eyes"');
      }
      continue;
    }
    switch (t) {
      case 'pushbutton': {
        lidCuts.push(hole(cx, cy, 3.75));
        const len = innerTop - (boardTop + 5) + LID + 2;
        caps.push({
          name: `button-cap-${p.ref}`,
          geom: union(cylinder({ radius: 3.4, height: len, segments: 40, center: [0, 0, len / 2] }), cylinder({ radius: 4.6, height: 1.2, segments: 40, center: [0, 0, 0.6] })),
          note: `Cap for ${p.ref}: slide it into the lid hole (flange inside) so it presses the button. ${len.toFixed(1)} mm long.`,
        });
        openings.push({ ref: p.ref, what: 'button hole (with a printed cap)', where: 'lid' });
        break;
      }
      case 'led':
      case 'rgb-led':
        lidCuts.push(hole(cx, cy, 2.65));
        openings.push({ ref: p.ref, what: 'LED window', where: 'lid' });
        break;
      case 'ldr':
      case 'ntc':
        lidCuts.push(hole(cx, cy, 2.5));
        openings.push({ ref: p.ref, what: t === 'ldr' ? 'light hole for the light sensor' : 'air hole for the thermistor', where: 'lid' });
        break;
      case 'potentiometer':
        lidCuts.push(hole(cx, cy, 3.75));
        openings.push({ ref: p.ref, what: 'knob shaft hole', where: 'lid' });
        break;
      case 'slide-switch':
        lidCuts.push(rect(cx, cy, 9, 4.5));
        openings.push({ ref: p.ref, what: 'switch slot', where: 'lid' });
        break;
      case 'buzzer':
        for (const dx of [-3, 0, 3]) for (const dy of [-3, 0, 3]) lidCuts.push(hole(cx + dx, cy + dy, 0.9));
        openings.push({ ref: p.ref, what: 'sound holes', where: 'lid' });
        break;
      case 'dht22':
        for (const dx of [-4.5, -1.5, 1.5, 4.5]) lidCuts.push(rect(cx + dx, cy, 1.6, 12));
        openings.push({ ref: p.ref, what: 'vents over the temperature sensor (so it reads the room, not the case)', where: 'lid' });
        break;
      default:
        if (CABLE_TYPES.has(t)) wallSlot(cx, cy, 12, 7, boardTop + SOCKET, p.ref, `cable slot for the ${t.replace(/-/g, ' ')}`);
    }
  }
  if (lidCuts.length) lid = subtract(lid, ...lidCuts);
  if (wallCuts.length) base = subtract(base, ...wallCuts);

  if (style === 'wall-mount') {
    const keyholes: Geom[] = [];
    for (const kx of [ow * 0.25, ow * 0.75]) {
      keyholes.push(translate([kx, od * 0.7, FLOOR / 2], cylinder({ radius: 4, height: FLOOR * 4, segments: 32 })));
      keyholes.push(translate([kx, od * 0.7 - 5, FLOOR / 2], cuboid({ size: [4.4, 10, FLOOR * 4] })));
    }
    base = subtract(base, ...keyholes);
    openings.push({ ref: '', what: 'two keyhole slots for wall screws', where: 'floor' });
  }

  const parts: CaseResult['parts'] = [
    { name: 'case-base', geom: base, note: 'Print open side up, no supports. 0.2 mm layers, 20 % infill.' },
    { name: 'case-lid', geom: rotateX(Math.PI, translate([0, -od, -LID], lid)), note: 'Print flat side down (as exported).' },
    ...caps,
  ];
  if (style === 'desk-stand') {
    // A wedge that tilts the case back 20° on a desk; the case sits in its lip.
    const len = od * 0.8;
    const rise = Math.tan((20 * Math.PI) / 180) * len;
    const wedge = rotateY(-Math.PI / 2, rotateZ(0, extrudeLinear({ height: ow }, primitives.polygon({ points: [[0, 0], [rise + 4, 0], [4, len], [0, len]] }))));
    const lip = translate([-ow, len - 4, rise + 4], cuboid({ size: [ow, 3, 6], center: [ow / 2, 1.5, 3] }));
    parts.push({ name: 'desk-stand', geom: union(translate([ow, 0, 0], wedge), translate([ow, 0, 0], lip)), note: 'Prop the case on it: it leans back 20° so the screen faces you.' });
    openings.push({ ref: '', what: 'separate desk stand (20° tilt)', where: 'floor' });
  }
  return { parts, outer: { w: round(ow), d: round(od), h: round(oh) }, openings, warnings, tallest: { ref: tallest.ref, h: round(tallest.h) } };
}

const round = (v: number) => Math.round(v * 10) / 10;

export function volumeOf(g: Geom): number {
  return measurements.measureVolume(g);
}

export function bboxOf(g: Geom): [[number, number, number], [number, number, number]] {
  return measurements.measureBoundingBox(g) as any;
}
