// Circuit-board spec: everything KiCad needs to lay out a printed circuit board for a project —
// one footprint per part with each pad's net, plus net classes (thicker tracks for power).
// The layout itself (placement, routing, ground pour, fab outputs) is done by scripts/pcb/
// with KiCad's own pcbnew + Freerouting, then checked with kicad-cli DRC.
import type { Project } from './types';
import { partDef, footprintOf } from './parts';
import { buildNets, annotate } from './netlist';
import { pinNumber, defaultValue } from './symbols';
import { kicadName } from './kicad';

export interface PcbPart {
  ref: string;
  /** "Library:Footprint" (KiCad standard libraries, or "Sparkbench:" for generated ones). */
  footprint: string;
  value: string;
  /** Pad number → net name. */
  pads: Record<string, string>;
  /** Pad number → pin name, printed next to sockets for plug-in boards and modules. */
  pinNames: Record<string, string>;
  /** Plain-English role, for placement hints and the assembly notes. */
  role: 'board' | 'connector' | 'module' | 'ic' | 'passive' | 'indicator' | 'input' | 'power';
  description: string;
  /** Cables plug in here (off-board screen, servo, battery…): place it at the board edge. */
  edge?: boolean;
  /** ESP32 DevKit: keep copper away from its antenna end. */
  antenna?: boolean;
  /** Dev board: pads at its USB end (the USB cable must reach the board edge there). */
  usbPads?: [string, string];
  /** USB socket soldered on the board: its opening must sit flush with the bottom edge (mm from origin to the edge line). */
  flushEdge?: number;
  /** A plug-in module lying flat above its socket: body width along the header, depth away from it, height above the board (mm). */
  module?: { w: number; d: number; h: number; window?: { w: number; d: number; off: number } };
}

/** Plug-in breakout modules (sitting on a female socket, parallel to the board). Dimensions of the common boards. */
export const MODULE_BODY: Record<string, NonNullable<PcbPart['module']>> = {
  ssd1306: { w: 27.5, d: 27.8, h: 12.5, window: { w: 25, d: 15, off: 6 } },
  mpu6050: { w: 21, d: 16, h: 11.5 },
  hcsr04: { w: 45, d: 20, h: 24 },
  pir: { w: 32, d: 24, h: 26 },
  'level-shifter': { w: 18, d: 13, h: 11 },
};

/** Parts that connect to something off the board through a cable. */
const EDGE_TYPES = new Set(['lcd1602', 'epaper29', 'neopixel-ring', 'servo', 'relay', 'dc-motor', 'battery-9v', 'hcsr04', 'pir', 'soil']);

export interface PcbSpec {
  name: string;
  title: string;
  parts: PcbPart[];
  /** Net names that carry supply current (wider tracks). */
  powerNets: string[];
  groundNet: string | null;
  /** Factory whose rules the board is checked against. */
  fab: FabId;
  /** Optional link printed as a QR code on the back of the board. */
  qr?: { url: string; modules: boolean[][] };
  /** Positions the user chose (part origin, mm, rotation in degrees): placement keeps them. */
  fixed?: Record<string, { x: number; y: number; rot: number }>;
}

export type FabId = 'jlcpcb' | 'pcbway' | 'oshpark';

/** Published standard 2-layer capabilities (conservative), in mm. */
export const FABS: Record<FabId, { name: string; track: number; space: number; drill: number; annular: number; edge: number; quote: string }> = {
  jlcpcb: { name: 'JLCPCB', track: 0.127, space: 0.127, drill: 0.3, annular: 0.13, edge: 0.3, quote: 'https://cart.jlcpcb.com/quote' },
  pcbway: { name: 'PCBWay', track: 0.127, space: 0.127, drill: 0.3, annular: 0.15, edge: 0.3, quote: 'https://www.pcbway.com/orderonline.aspx' },
  oshpark: { name: 'OSH Park', track: 0.152, space: 0.152, drill: 0.254, annular: 0.127, edge: 0.381, quote: 'https://oshpark.com/' },
};

const ROLE: Record<string, PcbPart['role']> = {
  board: 'board',
  display: 'module',
  sensor: 'module',
  input: 'input',
  output: 'indicator',
  passive: 'passive',
  power: 'power',
  ic: 'ic',
  actuator: 'connector',
};

export function pcbSpec(project: Project, opts: { fab?: FabId } = {}): PcbSpec {
  const proj = project.parts.some((p) => !p.ref) ? annotate(project) : project;
  const { nets, netOf } = buildNets(proj);
  const parts: PcbPart[] = proj.parts.map((p) => {
    const def = partDef(p.type);
    const pads: Record<string, string> = {};
    const pinNames: Record<string, string> = {};
    for (const pin of def.pins) {
      pinNames[pinNumber(p.type, pin.name)] = pin.name.replace(/\.\d+$/, '');
      const net = netOf.get(`${p.id}:${pin.name}`);
      if (!net || net.pins.length < 2) continue;
      pads[pinNumber(p.type, pin.name)] = net.name;
    }
    return {
      ref: p.ref ?? p.id,
      footprint: footprintOf(p) || 'Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical',
      value: defaultValue(def, p.props),
      pads,
      pinNames,
      role: ROLE[def.category] ?? 'passive',
      description: def.name,
      ...(EDGE_TYPES.has(p.type) ? { edge: true } : {}),
      ...(p.type === 'esp32-devkit' ? { antenna: true, usbPads: ['15', '16'] as [string, string] } : {}),
      ...(p.type === 'pi-pico' ? { usbPads: ['1', '40'] as [string, string] } : {}),
      ...(p.type === 'usb-micro' ? { flushEdge: 2.6875 } : {}),
      ...(MODULE_BODY[p.type] ? { module: MODULE_BODY[p.type] } : {}),
    };
  });
  const power = nets.filter((n) => n.pins.length > 1 && /^(GND|\+3V3|\+5V|VBAT)/.test(n.name)).map((n) => n.name);
  return {
    name: kicadName(proj),
    title: proj.name,
    parts,
    powerNets: power,
    groundNet: power.find((n) => /^GND/.test(n)) ?? null,
    fab: opts.fab ?? 'jlcpcb',
  };
}
