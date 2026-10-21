// Components added from a datasheet (by the AI) rather than hand-modelled in parts.ts.
// A CustomPartSpec is plain JSON: it lives in the project file and in the part's skill folder
// (.claude/skills/part-<slug>/part.json), and is turned into a PartDef at runtime.
import type { PartDef, PinDef, Project, SimControl } from './types';

export type CustomInterface = 'i2c' | 'spi' | 'analog' | 'digital-in' | 'digital-out' | 'pwm' | 'uart' | 'onewire' | 'power' | 'passive';

export interface CustomSim {
  /**
   * analog-sensor: drives `outputPin` with a voltage set by a slider
   * digital-sensor: drives `outputPin` high/low with a toggle
   * actuator: shows "on" when `inputPin` is driven high
   * i2c-device: answers at its address with a register map
   * onewire-temp: a DS18x20-family thermometer on the 1-Wire bus (MicroPython's onewire + ds18x20 modules)
   * oled-display: a monochrome I2C OLED (SSD1306/SH1106 command set); tests can read its text
   * hx711: a 24-bit bridge ADC read by clocking PD_SCK and sampling DOUT (HX711/HX710 load-cell amplifiers)
   * spi-device: a chip read over SPI (thermocouple/RTD amplifiers, SPI ADCs); pins use fn spi.sck/spi.miso/spi.mosi/spi.cs
   * uart-device: a serial module (GPS, particulate, CO2); its TX pin has fn uart.tx, its RX pin fn uart.rx
   */
  kind: 'analog-sensor' | 'digital-sensor' | 'actuator' | 'i2c-device' | 'onewire-temp' | 'oled-display' | 'hx711' | 'spi-device' | 'uart-device' | 'none';
  /** uart-device: what the module sends by itself every `everyMs` (binary fields, or NMEA sentences built from
   * the controls "lat", "lon" and optionally "speed" [knots] and "alt" [m]), and replies to commands it receives. */
  uartBaud?: number;
  uartStream?: { everyMs: number; nmea?: boolean; bytes?: ResponseSegment[] };
  uartReplies?: { match: string; bytes: ResponseSegment[] }[];
  /** spi-device: what the chip clocks out on MISO while CS is low. Each reply may require the
   * transaction to start with `match` (hex bytes, '' = any) and starts `at` bytes into it (default: after match). */
  spiReplies?: { match: string; at?: number; bytes: ResponseSegment[] }[];
  /** hx711: the PD_SCK pin (outputPin is DOUT); raw 24-bit reading = round(value × countsPerUnit + offsetCounts). */
  clockPin?: string;
  countsPerUnit?: number;
  offsetCounts?: number;
  /** oled-display: the controller chip and visible rows (SSD1306 128×64 / 128×32, SH1106 1.3" 128×64). */
  controller?: 'ssd1306' | 'sh1106';
  rows?: 32 | 64;
  /** onewire-temp: 1-Wire family code (0x28 DS18B20, 0x10 DS18S20, 0x22 DS1822); outputPin is the DQ line. */
  family?: number;
  outputPin?: string;
  inputPin?: string;
  quantity?: string; // "Temperature"
  unit?: string; // "°C"
  min?: number;
  max?: number;
  default?: number;
  /** analog-sensor: output voltage at min / max of the quantity. */
  vAtMin?: number;
  vAtMax?: number;
  /** digital-sensor: output level when active. */
  activeHigh?: boolean;
  /** i2c-device: fixed register contents, e.g. { "0xD0": 96 } (chip id). */
  registers?: Record<string, number>;
  /** i2c-device: where the slider's measured value appears: raw = round((value - offset) / scale). */
  measure?: I2CMeasure;
  /** i2c-device: more measured values, each in its own register(s) and driven by its own control. */
  measures?: I2CMeasure[];
  /** i2c-device that answers commands rather than register reads (Sensirion, Aosong…): after a write
   * starting with `match` (hex bytes, e.g. "24 00"), reads return `bytes` packed MSB-first. */
  responses?: { match: string; bytes: ResponseSegment[] }[];
  /** More sliders besides the main one (e.g. humidity next to temperature), keyed for measures/outputs/tests. */
  controls?: { key: string; quantity: string; unit?: string; min: number; max: number; default?: number }[];
  /** analog-sensor with more than one output (e.g. a joystick's X and Y). */
  analogOutputs?: { pin: string; control: string; vAtMin: number; vAtMax: number }[];
  /** On/off outputs driven by toggles (a joystick's button, an encoder's A/B, a gas module's DO). */
  digitalOutputs?: { pin: string; control: string; label?: string; activeHigh?: boolean }[];
  /** actuator with several control inputs (e.g. a motor driver's IN1/IN2); each shows as on/off. */
  inputPins?: string[];
  /** i2c-device: register width in bits. 16 = each register address holds a 16-bit word (INA219, ADS1115, LM75…). */
  regWidth?: 8 | 16;
  /** i2c-device: register address width in bits (16 for e.g. VL53L1X, VL6180X). */
  addrWidth?: 8 | 16;
}

export interface I2CMeasure {
  reg: string;
  bytes: number;
  scale: number;
  offset?: number;
  signed?: boolean;
  littleEndian?: boolean;
  shift?: number;
  /** Which control supplies the value ('value' = the main slider). */
  control?: string;
}

/** One field of a command response, packed MSB-first into the reply's bit stream. */
/** Bits a reply occupies (checksums are 8 bits except sum16). */
export function segBits(segs: ResponseSegment[]): number {
  return segs.reduce((n, b) => n + ('crc' in b ? (b.crc === 'sum16' ? 16 : 8) : b.bits), 0);
}

export type ResponseSegment =
  | { const: number; bits: number }
  | { control: string; bits: number; scale: number; offset?: number; signed?: boolean }
  /** CRC-8 over the previous `over` bytes, poly 0x31: 'sensirion' starts at 0xFF (SHT3x/4x, SCD4x, AHT20), 'htu21d' at 0x00 (HTU21D, Si7021). */
  | { crc: 'sensirion' | 'htu21d'; over: number }
  /** Checksums of serial sensors over the previous `over` bytes: 'sum16' = 16-bit sum, big-endian (PMS5003);
   * 'mhz19' = 0xFF − (sum of bytes after the first) + 1 (MH-Z19, SDS011-style). */
  | { crc: 'sum16' | 'mhz19' | 'sum8'; over: number };

export interface CustomPartSpec {
  type: string; // "custom-bme280"
  name: string;
  mpn: string;
  category: PartDef['category'];
  description: string;
  eli5: string;
  refPrefix: string;
  interface: CustomInterface;
  pins: PinDef[];
  vmin?: number;
  vmax?: number;
  currentMa?: number;
  i2cAddress?: number;
  datasheetUrl?: string;
  priceUsd: number;
  supplierQuery: string;
  footprint?: string;
  buildNotes?: string[];
  keywords?: string[];
  sim: CustomSim;
  /** MicroPython driver written from the datasheet, copied into projects that use the part. */
  driver?: { filename: string; code: string };
  /** The part's skill (markdown) — given to the AI whenever the part is in a project. */
  skill?: string;
  /**
   * A tiny program that uses the part, and a test for it. The part check wires the part to a board
   * the way autoWirePart does, runs this in the simulator and runs the test. `{PIN}` placeholders
   * (e.g. {OUT}) are replaced with the GPIO number the part's pin was wired to.
   */
  example?: { code: string; test: import('./acceptance').AcceptanceTest };
}

const REGISTRY = new Map<string, { spec: CustomPartSpec; def: PartDef }>();

export function specToDef(spec: CustomPartSpec): PartDef {
  const controls: SimControl[] = [];
  const s = spec.sim;
  if (s.kind === 'analog-sensor' || s.kind === 'onewire-temp' || s.kind === 'hx711' || s.kind === 'spi-device' || s.kind === 'uart-device' || (s.kind === 'i2c-device' && (s.measure || s.measures?.length || s.responses?.length))) {
    const min = s.min ?? 0;
    const max = s.max ?? 100;
    controls.push({ key: 'value', label: s.quantity ?? 'Value', kind: 'slider', min, max, step: (max - min) / 200 >= 1 ? 1 : +((max - min) / 200).toPrecision(1), default: s.default ?? (min + max) / 2, unit: s.unit ? ` ${s.unit}`.replace(/^ (°|%)/, '$1') : '' });
  }
  if (s.kind === 'digital-sensor') controls.push({ key: 'active', label: s.quantity ?? 'Triggered', kind: 'toggle', default: 0 });
  for (const d of s.digitalOutputs ?? []) if (!controls.some((x) => x.key === d.control)) controls.push({ key: d.control, label: d.label ?? d.pin, kind: 'toggle', default: 0 });
  for (const c of s.controls ?? []) {
    if (c.key === 'value' || controls.some((x) => x.key === c.key)) continue;
    controls.push({ key: c.key, label: c.quantity, kind: 'slider', min: c.min, max: c.max, step: (c.max - c.min) / 200 >= 1 ? 1 : +((c.max - c.min) / 200).toPrecision(1), default: c.default ?? (c.min + c.max) / 2, unit: c.unit ? ` ${c.unit}`.replace(/^ (°|%)/, '$1') : '' });
  }
  return {
    type: spec.type,
    name: spec.name,
    category: spec.category,
    description: spec.description,
    eli5: spec.eli5,
    refPrefix: spec.refPrefix || 'U',
    pins: spec.pins,
    controls,
    vmin: spec.vmin,
    vmax: spec.vmax,
    currentMa: spec.currentMa,
    i2cAddress: spec.i2cAddress,
    bom: { mpn: spec.mpn, description: spec.description.split('. ')[0], priceUsd: spec.priceUsd, supplierQuery: spec.supplierQuery, footprint: spec.footprint },
    kicad: { symbol: `Sparkbench:${spec.type}`, footprint: spec.footprint ?? `Connector_PinHeader_2.54mm:PinHeader_1x${String(spec.pins.length).padStart(2, '0')}_P2.54mm_Vertical`, value: () => spec.mpn },
    keywords: spec.keywords ?? [spec.mpn.toLowerCase(), spec.name.toLowerCase()],
    buildNotes: spec.buildNotes,
  };
}

export function registerCustomPart(spec: CustomPartSpec) {
  REGISTRY.set(spec.type, { spec, def: specToDef(spec) });
}

export function registerProjectParts(project: Pick<Project, 'customParts'> | null | undefined) {
  for (const s of project?.customParts ?? []) registerCustomPart(s);
}

export function customDef(type: string): PartDef | undefined {
  return REGISTRY.get(type)?.def;
}

export function customSpec(type: string): CustomPartSpec | undefined {
  return REGISTRY.get(type)?.spec;
}

export function allCustomDefs(): PartDef[] {
  return [...REGISTRY.values()].map((x) => x.def);
}

export function slugType(mpn: string): string {
  return `custom-${mpn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** Sanity-check AI-extracted specs before they enter a design. */
export function validateSpec(spec: CustomPartSpec): string[] {
  const errs: string[] = [];
  if (!/^custom-[a-z0-9-]+$/.test(spec.type)) errs.push('type must look like custom-<mpn>');
  if (!spec.pins?.length) errs.push('no pins');
  const names = new Set<string>();
  for (const p of spec.pins ?? []) {
    if (!p.name || names.has(p.name)) errs.push(`bad or duplicate pin name "${p.name}"`);
    names.add(p.name);
  }
  if (!spec.pins?.some((p) => p.role === 'gnd') && spec.interface !== 'passive') errs.push('no ground pin');
  const s = spec.sim;
  const keys = new Set(['value', 'active', ...(s.controls ?? []).map((c) => c.key), ...(s.digitalOutputs ?? []).map((d) => d.control)]);
  if (s.outputPin && !names.has(s.outputPin)) errs.push(`sim.outputPin ${s.outputPin} is not a pin`);
  if (s.inputPin && !names.has(s.inputPin)) errs.push(`sim.inputPin ${s.inputPin} is not a pin`);
  if (s.kind === 'i2c-device' && spec.i2cAddress === undefined) errs.push('i2c-device without i2cAddress');
  if (s.kind === 'onewire-temp' && !s.outputPin) errs.push('onewire-temp needs outputPin (the DQ line)');
  if (s.kind === 'oled-display' && spec.i2cAddress === undefined) errs.push('oled-display needs i2cAddress');
  if (s.kind === 'spi-device') {
    if (!spec.pins.some((p) => p.fn === 'spi.sck') || !spec.pins.some((p) => p.fn === 'spi.miso') || !spec.pins.some((p) => p.fn === 'spi.cs')) errs.push('spi-device needs pins with fn spi.sck, spi.miso and spi.cs');
    if (!s.spiReplies?.length) errs.push('spi-device needs spiReplies');
    for (const r of s.spiReplies ?? []) {
      if (r.match && !/^([0-9a-f]{2})( [0-9a-f]{2})*$/i.test(r.match)) errs.push(`spi reply match "${r.match}" must be hex bytes like "01" or ""`);
      const bits = segBits(r.bytes);
      if (bits % 8) errs.push(`spi reply "${r.match}" is ${bits} bits, not whole bytes`);
      for (const b of r.bytes) if ('control' in b && !keys.has(b.control)) errs.push(`spi reply field control ${b.control} is not a control`);
    }
  }
  if (s.kind === 'uart-device') {
    if (!spec.pins.some((p) => p.fn === 'uart.tx')) errs.push('uart-device needs its TX pin marked fn uart.tx');
    if (!s.uartStream && !s.uartReplies?.length) errs.push('uart-device needs uartStream or uartReplies');
    if (s.uartStream?.nmea && !(keys.has('lat') && keys.has('lon'))) errs.push('an NMEA stream needs controls "lat" and "lon"');
    for (const r of [...(s.uartReplies ?? []), ...(s.uartStream?.bytes ? [{ match: '', bytes: s.uartStream.bytes }] : [])]) {
      if (r.match && !/^([0-9a-f]{2})( [0-9a-f]{2})*$/i.test(r.match)) errs.push(`uart reply match "${r.match}" must be hex bytes`);
      if (segBits(r.bytes) % 8) errs.push(`uart reply "${r.match}" is not whole bytes`);
      for (const b of r.bytes) if ('control' in b && !keys.has(b.control)) errs.push(`uart field control ${b.control} is not a control`);
    }
  }
  if (s.kind === 'hx711' && (!s.outputPin || !s.clockPin || !names.has(s.clockPin) || !s.countsPerUnit)) errs.push('hx711 needs outputPin (DOUT), clockPin (PD_SCK) and countsPerUnit');
  if (s.kind === 'onewire-temp' && s.family !== undefined && ![0x10, 0x22, 0x28, 0x3b, 0x42].includes(s.family)) errs.push(`1-Wire family 0x${s.family.toString(16)} is not a DS18x20-type thermometer`);
  for (const m of [...(s.measures ?? []), ...(s.measure ? [s.measure] : [])]) {
    if (!/^0x[0-9a-f]{1,2}$/i.test(m.reg)) errs.push(`measure reg ${m.reg} must be hex like 0x1A`);
    if (m.control && !keys.has(m.control)) errs.push(`measure control ${m.control} is not a control`);
    if (!(m.bytes >= 1 && m.bytes <= 4) || !m.scale) errs.push(`measure at ${m.reg} needs 1-4 bytes and a non-zero scale`);
  }
  for (const r of s.responses ?? []) {
    if (!/^([0-9a-f]{2})( [0-9a-f]{2})*$/i.test(r.match)) errs.push(`response match "${r.match}" must be hex bytes like "24 00"`);
    const bits = segBits(r.bytes);
    if (bits % 8) errs.push(`response "${r.match}" is ${bits} bits, not whole bytes`);
    for (const b of r.bytes) if ('control' in b && !keys.has(b.control)) errs.push(`response field control ${b.control} is not a control`);
  }
  for (const d of s.digitalOutputs ?? []) if (!names.has(d.pin)) errs.push(`digital output ${d.pin} is not a pin`);
  for (const p of s.inputPins ?? []) if (!names.has(p)) errs.push(`input ${p} is not a pin`);
  for (const o of s.analogOutputs ?? []) {
    if (!names.has(o.pin)) errs.push(`analog output ${o.pin} is not a pin`);
    if (!keys.has(o.control)) errs.push(`analog output control ${o.control} is not a control`);
  }
  return errs;
}
