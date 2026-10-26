// Power design: how much current the project really draws (measured by running its firmware in the
// simulator), how long each kind of battery would last over a day of use, which regulator/charger
// each battery needs, and the protection parts a product should have.
import type { Project } from './types';
import type { SimFrame } from '../sim/engine';
import { partDef } from './parts';
import { supplyLoads, WORST_MA, type RailLoad } from './checks';

/** Current the board itself draws (mA): typical running, and with Wi-Fi active. */
const BOARD_MA: Record<string, { run: number; wifi: number; sleep: number }> = {
  esp32: { run: 50, wifi: 120, sleep: 0.15 }, // DevKit: ~10 µA chip + USB-serial/LED/regulator leakage
  pico: { run: 25, wifi: 25, sleep: 1.3 },
  rpi4: { run: 600, wifi: 650, sleep: 600 },
  none: { run: 0, wifi: 0, sleep: 0 },
};

export interface LoadSample {
  /** Average current per part over the run (mA), keyed by ref. */
  perPart: Record<string, number>;
  /** Highest total seen in one sample (mA). */
  peakMa: number;
  /** Average total including the board (mA). */
  avgMa: number;
  seconds: number;
}

/** Current a part draws in one simulator frame (mA). */
export function partCurrent(type: string, v: SimFrame['parts'][string] | undefined, props: Record<string, any> = {}): number {
  const d = partDef(type);
  if (!v) return 0;
  switch (type) {
    case 'led':
      return v.ma ?? (v.led ?? 0) * 15;
    case 'rgb-led':
      return ((v.rgb ?? [0, 0, 0]).reduce((a, b) => a + b, 0) / 255) * 15;
    case 'neopixel-ring':
      return 1 * Number(props.pixels ?? 12) + ((v.pixels ?? []).reduce((a, b) => a + b, 0) / 255) * 20;
    case 'buzzer':
      return v.tone ? 25 : 0;
    case 'servo':
      return 10 + (v.angle !== undefined ? 0 : 0);
    case 'relay':
      return v.relay ? (d.currentMa ?? 70) : 3;
    case 'dc-motor':
      return (v.spin ?? 0) * (d.currentMa ?? 180);
    case 'ssd1306':
      return v.oledOn === false ? 0.01 : 18;
    case 'lcd1602':
      return v.lcd?.backlight ? 28 : 2;
    case 'epaper29':
      return v.epaper?.refreshing ? 8 : 0.01;
    default:
      return v.powered === false ? 0 : (d.currentMa ?? 0);
  }
}

/** Measure average/peak current from simulator frames. Servo moves are added from angle changes. */
export function measureLoad(project: Project, frames: SimFrame[], seconds: number, opts: { wifi?: boolean } = {}): LoadSample {
  const perPart: Record<string, number> = {};
  let peak = 0;
  let sum = 0;
  const base = BOARD_MA[project.board] ?? BOARD_MA.none;
  const boardMa = opts.wifi ? base.wifi : base.run;
  let lastAngle: Record<string, number> = {};
  for (const f of frames) {
    let total = boardMa;
    for (const p of project.parts) {
      const d = partDef(p.type);
      if (d.category === 'board') continue;
      let ma = partCurrent(p.type, f.parts[p.id], p.props);
      if (p.type === 'servo') {
        const a = f.parts[p.id]?.angle;
        if (a !== undefined && lastAngle[p.id] !== undefined && Math.abs(a - lastAngle[p.id]) > 1) ma += 250; // moving
        if (a !== undefined) lastAngle[p.id] = a;
      }
      if (p.type === 'ne555') ma = 6;
      const ref = p.ref ?? p.id;
      perPart[ref] = (perPart[ref] ?? 0) + ma;
      total += ma;
    }
    peak = Math.max(peak, total);
    sum += total;
  }
  const n = Math.max(1, frames.length);
  for (const k of Object.keys(perPart)) perPart[k] = Math.round((perPart[k] / n) * 10) / 10;
  return { perPart, peakMa: Math.round(peak), avgMa: Math.round((sum / n) * 10) / 10, seconds };
}

/** Most a part can draw when it is fully on (mA): for "off during the run, up to N mA" notes. */
export function partMaxMa(type: string, props: Record<string, any> = {}): number {
  const worst = WORST_MA[type]?.({ id: '', type, props } as any);
  if (worst !== undefined) return worst;
  if (type === 'led') return 15;
  if (type === 'rgb-led') return 45;
  if (type === 'buzzer') return 25;
  if (type === 'lcd1602') return 28;
  return partDef(type).currentMa ?? 0;
}

/** Parts that need the 5 V supply (NeoPixels, servos, pumps, 5 V modules). */
function fiveVoltParts(rails: RailLoad[]): boolean {
  return rails.some((r) => r.rail === 5 && r.who.length > 0);
}

const FUSES = [500, 750, 1100, 1500, 2000, 3000, 5000];
/** Smallest standard polyfuse hold current with 25% headroom over the worst case. */
export function fuseFor(worstMa: number): number {
  return FUSES.find((f) => f >= worstMa * 1.25) ?? 5000;
}
const fmtA = (ma: number) => (ma >= 1000 ? `${(ma / 1000).toFixed(ma % 1000 ? 1 : 0)} A` : `${ma} mA`);

export interface BatteryOption {
  id: 'usb' | 'aa3' | '9v' | 'li18650' | 'lipo1000' | 'powerbank';
  name: string;
  mAh: number;
  volts: number;
  /** What sits between the battery and the board. */
  regulator: string;
  /** Battery current per mA drawn by the circuit (regulator efficiency). */
  factor: number;
  charging: string | null;
  protection: string[];
  note?: string;
}

/** Batteries that make sense for this board, with the parts each needs. `worstMa` sizes the regulator. */
export function batteryOptions(project: Project, worstMa = 0, rails: RailLoad[] = []): BatteryOption[] {
  const b = project.board;
  if (b === 'rpi4') return [{ id: 'usb', name: 'USB-C power supply (5 V, 3 A)', mAh: Infinity, volts: 5, regulator: 'none (the Pi has its own)', factor: 1, charging: null, protection: [] }, { id: 'powerbank', name: 'USB power bank, 10 000 mAh', mAh: 10000 * 0.85 * (3.7 / 5), volts: 5, regulator: 'none: the power bank gives 5 V', factor: 1, charging: 'the power bank charges over USB', protection: [], note: 'A Pi 4 needs a power bank that can give 3 A.' }];
  if (b === 'none') {
    const v = Number(project.parts.find((p) => p.type === 'battery-9v')?.props.volts ?? 9);
    return [
      { id: '9v', name: `${v} V battery (PP3)`, mAh: 550, volts: v, regulator: 'none: the 555 runs straight from it', factor: 1, charging: null, protection: ['a 1N5817 Schottky diode in series stops damage if the snap is put on backwards'] },
      { id: 'aa3', name: '3 × AA (4.5 V)', mAh: 2500, volts: 4.5, regulator: 'none (the 555 works from 4.5 V; the LED gets a little dimmer)', factor: 1, charging: null, protection: [] },
    ];
  }
  if (b === 'nicla-vision' || b === 'nicla-voice')
    // Both datasheets: a single-cell 3.7 V Li-Po on the battery connector (J4), charged by the board's own PMIC.
    return [
      { id: 'usb', name: 'USB charger or computer (micro USB)', mAh: Infinity, volts: 5, regulator: 'the board’s own PMIC', factor: 1, charging: null, protection: [] },
      {
        id: 'lipo1000',
        name: 'LiPo pouch, 1 000 mAh, on the board’s battery connector (J4)',
        mAh: 1000,
        volts: 3.7,
        regulator: 'the board’s own PMIC',
        factor: 1,
        charging: 'the board charges it from USB (its PMIC has a Li-Po charger)',
        protection: b === 'nicla-vision' ? ['the battery input has no reverse-polarity protection (datasheet): check the plug before connecting'] : [],
        note: 'Only one battery at a time: the J3 pads and the J4 connector are the same battery input.',
      },
    ];
  const vin = b === 'esp32' ? 'VIN' : 'VSYS';
  const needs5 = fiveVoltParts(rails);
  // A lithium cell gives 3.0–4.2 V: 5 V parts need a boost converter; otherwise an LDO sized for the load.
  const ldo = worstMa <= 200 && b === 'pico' ? 'a low-dropout 3.3 V regulator with low quiescent current (HT7333 or MCP1700, 250 mA)' : worstMa <= 450 ? 'a low-dropout 3.3 V regulator that can give 600 mA (AP2112K-3.3)' : 'a 3.3 V buck-boost converter rated 1 A or more (e.g. a TPS63020 module)';
  const liReg = needs5 ? `a 5 V boost converter rated for at least ${fmtA(Math.max(500, Math.ceil(worstMa / 100) * 100))} (e.g. an MT3608 module, or a "battery shield" with charger and 5 V output) into ${vin}: the 5 V parts need it, and the board makes its own 3.3 V` : `${ldo}, straight to 3V3`;
  const liFactor = needs5 ? 5 / (3.7 * 0.88) : 1;
  return [
    { id: 'usb', name: 'USB charger or computer', mAh: Infinity, volts: 5, regulator: 'the board’s own regulator', factor: 1, charging: null, protection: [] },
    { id: 'powerbank', name: 'USB power bank, 10 000 mAh', mAh: 10000 * 0.85 * (3.7 / 5), volts: 5, regulator: 'the board’s own regulator (5 V in)', factor: 1, charging: 'the power bank charges over USB', protection: [] },
    { id: 'aa3', name: '3 × AA alkaline (4.5 V)', mAh: 2500, volts: 4.5, regulator: `into ${vin}; the board’s regulator makes 3.3 V${needs5 ? ' (the 5 V parts get 4.5 V: they work, a little weaker)' : ''}`, factor: 1, charging: null, protection: ['a P-channel MOSFET (e.g. AO3401) or 1N5817 diode against reversed batteries'] },
    { id: 'li18650', name: '18650 Li-ion cell, 3 000 mAh', mAh: 3000, volts: 3.7, regulator: liReg, factor: liFactor, charging: 'a TP4056 charger module with protection (DW01) — charge it over USB', protection: ['use a protected cell or the DW01 protection on the charger board', 'reverse-polarity MOSFET (AO3401)', 'never short or puncture a lithium cell'] },
    { id: 'lipo1000', name: 'LiPo pouch, 1 000 mAh', mAh: 1000, volts: 3.7, regulator: liReg, factor: liFactor, charging: 'a TP4056 charger module with DW01 protection', protection: ['pouch cells must have a protection circuit', 'keep it away from sharp edges inside the case'] },
  ];
}

export interface BatteryLife {
  battery: BatteryOption;
  /** Hours of use, and days at the given hours-per-day. */
  hours: number;
  days: number;
}

export function batteryLife(load: LoadSample, options: BatteryOption[], hoursPerDay: number): BatteryLife[] {
  return options.map((battery) => {
    const hours = battery.mAh === Infinity ? Infinity : (battery.mAh * 0.8) / (load.avgMa * battery.factor);
    return { battery, hours, days: hours / Math.max(0.1, hoursPerDay) };
  });
}

/** Parts whose job is to stay visibly on (lights): sleeping would switch them off. */
const ALWAYS_ON = new Set(['led', 'rgb-led', 'neopixel-ring', 'dc-motor', 'relay', 'servo']);
const SCREENS = new Set(['ssd1306', 'lcd1602']);

/** Sleep advice for battery projects: what deep sleep between readings would give. Null when the
 *  device's lights/motors must stay on, so sleeping would defeat its purpose. */
export function sleepAdvice(project: Project, load: LoadSample): { everyMin: number; awakeS: number; avgMa: number; caveat?: string } | null {
  if (project.board !== 'esp32' && project.board !== 'pico') return null;
  if (project.parts.some((p) => ALWAYS_ON.has(p.type))) return null;
  const base = BOARD_MA[project.board];
  const everyMin = 5;
  const awakeS = project.board === 'esp32' ? 3 : 2;
  const sleepMa = base.sleep;
  const avg = (load.avgMa * awakeS + sleepMa * (everyMin * 60 - awakeS)) / (everyMin * 60);
  const screen = project.parts.find((p) => SCREENS.has(p.type));
  return { everyMin, awakeS, avgMa: Math.round(avg * 100) / 100, ...(screen ? { caveat: 'The screen would be blank while it sleeps, so this only suits a device you glance at now and then (an e-paper screen keeps its picture without power).' } : {}) };
}

/** Protection a product version should add (USB / battery inputs), sized for the worst-case current. */
export function protectionAdvice(project: Project, worstMa = 0): string[] {
  const out: string[] = [];
  if (project.board === 'rpi4') out.push('The Pi has its own input fuse; give the parts on its 5 V pins their own 1 A polyfuse if they sit on a separate board.');
  else if (project.board !== 'none') {
    const fuse = fuseFor(worstMa);
    out.push(`A ${fmtA(fuse)} resettable fuse (polyfuse) in the 5 V input stops a short from damaging the USB port${worstMa ? ` (sized for the worst case of about ${worstMa} mA)` : ''}.${fuse > 500 ? ' That is more than a computer USB port gives: use a 5 V 2 A (or bigger) charger.' : ''}`);
  }
  if (project.board === 'esp32' || project.board === 'pico') out.push('A USBLC6-2SC6 ESD protection chip on the USB data lines protects against static zaps when plugging in.');
  if (project.parts.some((p) => ['servo', 'dc-motor', 'relay'].includes(p.type))) {
    const bare = project.parts.filter((p) => p.type === 'dc-motor');
    out.push(`Motors and relays make voltage spikes: keep a 100–470 µF capacitor across their supply${bare.length ? `; the flyback diode across ${bare.map((p) => p.ref ?? p.id).join(', ')} is in the design (check the Problems tab if it says one is missing)` : ' (relay modules already have their flyback diode)'}.`);
  }
  return out;
}

export interface PowerReport {
  load: LoadSample;
  /** Datasheet worst case: everything on at full power at once (same figures as the Problems tab). */
  worst: { totalMa: number; rails: RailLoad[] };
  options: BatteryOption[];
  sleep: ReturnType<typeof sleepAdvice>;
  protection: string[];
  /** Highest current each part can draw (mA), keyed by ref: for parts that were off during the run. */
  maxPerPart: Record<string, number>;
}

/** Everything the Power card shows, from a measured simulator run plus the datasheet worst case. */
export function powerReport(project: Project, load: LoadSample): PowerReport {
  let rails: RailLoad[] = [];
  try {
    rails = supplyLoads(project);
  } catch {
    rails = [];
  }
  const base = BOARD_MA[project.board] ?? BOARD_MA.none;
  const fromRails = rails.reduce((n, r) => n + r.worst, 0) + (project.board === 'rpi4' ? base.run : 0);
  const totalMa = Math.round(Math.max(load.peakMa, fromRails));
  const maxPerPart: Record<string, number> = {};
  for (const p of project.parts) if (partDef(p.type).category !== 'board') maxPerPart[p.ref ?? p.id] = partMaxMa(p.type, p.props);
  return { load, worst: { totalMa, rails }, options: batteryOptions(project, totalMa, rails), sleep: sleepAdvice(project, load), protection: protectionAdvice(project, totalMa), maxPerPart };
}
