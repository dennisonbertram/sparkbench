// Power design: how much current the project really draws (measured by running its firmware in the
// simulator), how long each kind of battery would last over a day of use, which regulator/charger
// each battery needs, and the protection parts a product should have.
import type { Project } from './types';
import type { SimFrame } from '../sim/engine';
import { partDef } from './parts';

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
      return v.relay ? 75 : 3;
    case 'dc-motor':
      return (v.spin ?? 0) * 200;
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

/** Batteries that make sense for this board, with the parts each needs. */
export function batteryOptions(project: Project): BatteryOption[] {
  const b = project.board;
  if (b === 'rpi4') return [{ id: 'usb', name: 'USB-C power supply (5 V, 3 A)', mAh: Infinity, volts: 5, regulator: 'none (the Pi has its own)', factor: 1, charging: null, protection: [] }, { id: 'powerbank', name: 'USB power bank, 10 000 mAh', mAh: 10000 * 0.85 * (3.7 / 5), volts: 5, regulator: 'none: the power bank gives 5 V', factor: 1, charging: 'the power bank charges over USB', protection: [], note: 'A Pi 4 needs a power bank that can give 3 A.' }];
  if (b === 'none') {
    const v = Number(project.parts.find((p) => p.type === 'battery-9v')?.props.volts ?? 9);
    return [
      { id: '9v', name: `${v} V battery (PP3)`, mAh: 550, volts: v, regulator: 'none: the 555 runs straight from it', factor: 1, charging: null, protection: ['a 1N5817 Schottky diode in series stops damage if the snap is put on backwards'] },
      { id: 'aa3', name: '3 × AA (4.5 V)', mAh: 2500, volts: 4.5, regulator: 'none (the 555 works from 4.5 V; the LED gets a little dimmer)', factor: 1, charging: null, protection: [] },
    ];
  }
  // ESP32 / Pico: the board needs 5 V on VIN/VSYS, or 3.3 V straight on 3V3.
  return [
    { id: 'usb', name: 'USB charger or computer', mAh: Infinity, volts: 5, regulator: 'the board’s own regulator', factor: 1, charging: null, protection: [] },
    { id: 'powerbank', name: 'USB power bank, 10 000 mAh', mAh: 10000 * 0.85 * (3.7 / 5), volts: 5, regulator: 'the board’s own regulator (5 V in)', factor: 1, charging: 'the power bank charges over USB', protection: [], note: 'Some power banks switch off when the current is very low (under ~50 mA); pick one with an "always on" or low-current mode.' },
    { id: 'aa3', name: '3 × AA alkaline (4.5 V)', mAh: 2500, volts: 4.5, regulator: `into ${project.board === 'esp32' ? 'VIN' : 'VSYS'}; the board’s regulator makes 3.3 V`, factor: 1, charging: null, protection: ['a P-channel MOSFET (e.g. AO3401) or 1N5817 diode against reversed batteries'] },
    { id: 'li18650', name: '18650 Li-ion cell, 3 000 mAh', mAh: 3000, volts: 3.7, regulator: 'a low-dropout 3.3 V regulator with low quiescent current (HT7333 or MCP1700), straight to 3V3', factor: 1, charging: 'a TP4056 charger module with protection (DW01) — charge it over USB', protection: ['use a protected cell or the DW01 protection on the charger board', 'reverse-polarity MOSFET (AO3401)', 'never short or puncture a lithium cell'] },
    { id: 'lipo1000', name: 'LiPo pouch, 1 000 mAh', mAh: 1000, volts: 3.7, regulator: 'a low-dropout 3.3 V regulator (HT7333 / MCP1700), straight to 3V3', factor: 1, charging: 'a TP4056 charger module with DW01 protection', protection: ['pouch cells must have a protection circuit', 'keep it away from sharp edges inside the case'] },
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

/** Sleep advice for battery projects: what deep sleep between readings would give. */
export function sleepAdvice(project: Project, load: LoadSample): { everyMin: number; awakeS: number; avgMa: number } | null {
  if (project.board !== 'esp32' && project.board !== 'pico') return null;
  const base = BOARD_MA[project.board];
  const everyMin = 5;
  const awakeS = project.board === 'esp32' ? 3 : 2;
  const sleepMa = base.sleep;
  const avg = (load.avgMa * awakeS + sleepMa * (everyMin * 60 - awakeS)) / (everyMin * 60);
  return { everyMin, awakeS, avgMa: Math.round(avg * 100) / 100 };
}

/** Protection a product version should add (USB / battery inputs). */
export function protectionAdvice(project: Project): string[] {
  const out = ['A 500 mA resettable fuse (polyfuse) in the 5 V input stops a short from damaging the USB port.'];
  if (project.board === 'esp32' || project.board === 'pico') out.push('A USBLC6-2SC6 ESD protection chip on the USB data lines protects against static zaps when plugging in.');
  if (project.parts.some((p) => ['servo', 'dc-motor', 'relay'].includes(p.type))) out.push('Motors and relays make voltage spikes: keep a 100–470 µF capacitor across their supply and a flyback diode across any bare motor or relay coil (relay modules already have one).');
  return out;
}
