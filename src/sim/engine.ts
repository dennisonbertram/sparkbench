// The simulation engine. Environment-agnostic: runs in a Web Worker (real-time, inputs via
// SharedArrayBuffer) and in Node tests (fast virtual time, scripted inputs).
import type { Project, PartInstance } from '../core/types';
import { ElectricalModel } from '../core/circuit';
import { partDef } from '../core/parts';
import { pinKey } from '../core/netlist';
import { ocr } from './ocr';
import { SSD1306Device, MPU6050Device, Lcd1602Device, EPaperDevice, GenericI2CDevice, TM1637Device, MAX7219Device, TFTDevice, HT16K33Device, segText, alphaText, packResponse, type I2CDevice } from './devices';
import { registerProjectParts, customSpec } from '../core/customParts';
import { ESP32_PY, SIMTIME_PY, MACHINE_PY, DHT_PY, ONEWIRE_PY, DS18X20_PY, NEOPIXEL_MP_PY, NETWORK_PY, REQUESTS_PY, NTPTIME_PY, GPIOZERO_PY, SMBUS2_PY, BOARD_PY, ADAFRUIT_DHT_PY, NEOPIXEL_PI_PY, PITIME_EXTRA_PY, SIGNAL_PY, bootstrapPy } from './pyshims';

export class SimStop extends Error {
  constructor(public reason: 'user' | 'time' | 'reset') {
    super(`SIM_STOP:${reason}`);
  }
}

export interface InputChange {
  part: string;
  key: string;
  value: number;
}

export interface SimHost {
  /** Block for `us` microseconds of wall time (no-op in fast mode). */
  waitUs(us: number): void;
  wallNowMs(): number;
  pollInputs(): InputChange[] | null;
  shouldStop(): boolean;
  emit(frame: SimFrame): void;
  /** Synchronous HTTP (worker: sync XHR). Return status < 0 on network failure. */
  httpRequest?(method: string, url: string, body: string): { status: number; text: string };
  /** Real-world time for NTP (ms since 1970). */
  nowEpochMs?(): number;
}

export interface PartVisual {
  led?: number; // 0..1 brightness
  ma?: number; // LED current
  rgb?: [number, number, number];
  pixels?: number[]; // flat r,g,b
  oled?: number[]; // 1024 bytes GDDRAM
  oledOn?: boolean;
  /** Segment displays (TM1637/MAX7219): the digits as text, and whether the display is on. */
  segText?: string;
  segOn?: boolean;
  /** Text read off a colour TFT, and a small RGB thumbnail of it. */
  textLines?: string[];
  tft?: { w: number; h: number; thumb: number[]; on: boolean };
  /** cols: characters per row (16 when absent; the built-in 16×2). */
  lcd?: { chars: number[]; backlight: boolean; cols?: number };
  epaper?: { ram: number[]; refreshing: boolean; refreshes: number };
  angle?: number;
  tone?: number;
  relay?: boolean;
  spin?: number; // motor speed 0..1
  dir?: 'cw' | 'ccw'; // continuous-rotation servo: which way it turns while spin > 0
  active?: boolean; // datasheet-defined actuator is switched on
  inputs?: Record<string, boolean>; // datasheet-defined actuator: which control inputs are high
  powered?: boolean;
}

export interface SimWarning {
  id: string;
  severity: 'error' | 'warning' | 'info';
  text: string;
  parts?: string[];
}

export interface SimFrame {
  t: number; // sim ms
  status: 'booting' | 'running' | 'stopped' | 'error' | 'finished';
  parts: Record<string, PartVisual>;
  pins: Record<number, { mode: string; level: number; duty?: number; freq?: number; v: number; ma: number }>;
  serial: string[];
  warnings: SimWarning[];
  error?: { message: string; line?: number; file?: string; hint?: string; raw: string };
  nets?: Record<string, number>;
  scope?: { t: number; v: Record<string, number> }[];
  i2c?: string[];
}

export interface MicroPythonLike {
  registerJsModule(name: string, mod: Record<string, unknown>): void;
  runPython(code: string): unknown;
  FS: { mkdir(p: string): void; writeFile(p: string, data: string): void };
}

export type MicroPythonLoader = (opts: { stdout: (s: string) => void; stderr: (s: string) => void }) => Promise<MicroPythonLike>;

export interface EngineOptions {
  mode: 'realtime' | 'fast';
  speed?: number;
  untilMs?: number; // fast mode: stop after this much sim time
  frameMs?: number; // realtime: emit frames this often (wall ms)
}

const ENODEV = 19;
const ETIMEDOUT = 116;

export class SimEngine {
  model: ElectricalModel;
  timeUs = 0;
  status: SimFrame['status'] = 'booting';
  serialAll: string[] = [];
  private serialNew: string[] = [];
  private warnings = new Map<string, SimWarning>();
  private warningsNew: SimWarning[] = [];
  private devices: { dev: I2CDevice; part: PartInstance }[] = [];
  private buses: { sda: number; scl: number }[] = [];
  private pwm = new Map<number, { freq: number; duty: number }>();
  private outLevel = new Map<number, number>();
  private trig = new Map<number, { rise: number; pulse: number; at: number }>();
  private irqWatch = new Map<number, number>();
  private irqQueue: number[] = [];
  private pixels = new Map<string, number[]>();
  private servos = new Map<string, number>();
  /** Continuous-rotation servos: signed speed −1…1 (positive = clockwise). */
  private servoSpeeds = new Map<string, number>();
  private tones = new Map<string, number>();
  private relays = new Map<string, boolean>();
  private pirHold = new Map<string, number>();
  private i2cLog: string[] = [];
  private epapers: { dev: EPaperDevice; part: PartInstance }[] = [];
  private spiBuses: { sck: number; mosi: number; miso: number }[] = [];
  private wifi = { status: 0, readyAt: 0, ssid: '' };
  private epochBase = 946684800; // board RTC starts at 2000-01-01 until NTP sync
  httpLog: string[] = [];
  private wallStart = 0;
  private simStart = 0;
  private lastFrameWall = 0;
  private lastInputPoll = 0;
  error?: SimFrame['error'];
  scope: { t: number; v: Record<string, number> }[] = [];
  speed: number;
  lines = 0;

  constructor(public project: Project, public host: SimHost, public opts: EngineOptions) {
    registerProjectParts(project);
    this.model = new ElectricalModel(project);
    this.speed = opts.speed ?? 1;
    // A Raspberry Pi runs Linux and already knows the real time.
    if (project.board === 'rpi4') this.epochBase = (host.nowEpochMs?.() ?? Date.UTC(2026, 9, 20, 10, 30)) / 1000;
    for (const part of project.parts) {
      if (part.type === 'ssd1306') this.devices.push({ dev: new SSD1306Device(part.id), part });
      if (part.type === 'lcd1602') this.devices.push({ dev: new Lcd1602Device(part.id), part });
      const cs = customSpec(part.type);
      if (cs?.sim.kind === 'segment-display' && cs.sim.protocol === 'ht16k33') this.devices.push({ dev: new HT16K33Device(part.id, cs.i2cAddress ?? 0x70), part });
      // An SPI OLED gets no I2C address (-1 never answers a scan); spiWrite feeds it.
      if (cs?.sim.kind === 'char-lcd') this.devices.push({ dev: new Lcd1602Device(part.id, { addr: cs.i2cAddress ?? 0x27, cols: cs.sim.lcd?.cols, rows: cs.sim.lcd?.rows, pins: cs.sim.lcd?.pins }), part });
      if (cs?.sim.kind === 'oled-display') this.devices.push({ dev: new SSD1306Device(part.id, { addr: cs.sim.bus === 'spi' ? -1 : (cs.i2cAddress ?? 0x3c), controller: cs.sim.controller === 'sh1106' ? 'sh1106' : 'ssd1306', rows: cs.sim.rows }), part });
      if (cs?.sim.kind === 'i2c-device')
        for (const sd of cs.sim.subDevices ?? [])
          this.devices.push({ part, dev: new GenericI2CDevice(part.id, sd.i2cAddress, sd.registers ?? {}, sd.measures ?? [], (k) => (this.model.states.get(part.id) as any)?.[k] ?? 0, [], { regWidth: sd.regWidth, autoIncrementBit7: sd.autoIncrementBit7 }) });
      if (cs?.sim.kind === 'i2c-device' && cs.i2cAddress !== undefined)
        for (const al of cs.sim.i2cAliases ?? []) {
          const owner = () => this.devices.find((x) => x.part.id === part.id && x.dev instanceof GenericI2CDevice && x.dev.addr === cs.i2cAddress)?.dev as GenericI2CDevice | undefined;
          this.devices.push({ part, dev: { addr: al.addr, partId: part.id, write: () => {}, read: (n: number) => Array.from({ length: n }, () => owner()?.peek(Number(al.reg)) ?? 0) } as unknown as I2CDevice });
        }
      if (cs?.sim.kind === 'i2c-device' && cs.i2cAddress !== undefined)
        this.devices.push({ dev: new GenericI2CDevice(part.id, cs.i2cAddress, cs.sim.registers ?? {}, [...(cs.sim.measure ? [cs.sim.measure] : []), ...(cs.sim.measures ?? [])], (k) => (this.model.states.get(part.id) as any)?.[k] ?? 0, cs.sim.responses ?? [], { regWidth: cs.sim.regWidth, addrWidth: cs.sim.addrWidth, autoIncrementBit7: cs.sim.autoIncrementBit7, pointerless: cs.sim.pointerless, pointerlessBytes: cs.sim.pointerlessBytes, readFromZero: cs.sim.readFromZero, inputBits: cs.sim.inputBits, rtc: cs.sim.rtc, nowMs: () => this.timeUs / 1000 }), part });
      if (part.type === 'epaper29') this.epapers.push({ dev: new EPaperDevice(part.id, () => this.timeUs), part });
      if (part.type === 'mpu6050') {
        const st = () => this.model.states.get(part.id)! as any;
        const ad0 = this.model.gpiosOnNet(part.id, 'AD0').length === 0 && this.model.pinVoltage(part.id, 'AD0') > 2;
        this.devices.push({ dev: new MPU6050Device(part.id, st, () => this.timeUs, ad0), part });
      }
    }
  }

  get board() {
    return this.model.board;
  }

  // ------------------------------------------------------------------ clock
  private realtime() {
    return this.opts.mode === 'realtime';
  }
  private syncClock() {
    if (this.realtime()) {
      const simFromWall = this.simStart + (this.host.wallNowMs() - this.wallStart) * 1000 * this.speed;
      if (simFromWall > this.timeUs) this.timeUs = simFromWall;
    } else this.timeUs += 15; // every hardware call costs a little time, so polling loops advance
  }
  private checkStop() {
    if (this.host.shouldStop()) throw new SimStop('user');
    if (!this.realtime() && this.opts.untilMs !== undefined && this.timeUs >= this.opts.untilMs * 1000) throw new SimStop('time');
  }
  private tick() {
    this.checkStop();
    this.syncClock();
    this.pollInputs();
    this.updateBusyLines();
    this.maybeFrame();
  }
  private updateBusyLines() {
    for (const { dev, part } of this.epapers) this.model.setModuleOutput(part.id, 'busy', dev.busy() && this.model.modulePowered(part.id) ? 3.3 : 0);
  }
  sleepUs(us: number) {
    this.checkStop();
    us = Math.max(0, us);
    if (!this.realtime()) {
      this.timeUs += us;
      this.pollInputs();
      this.checkStop();
      return;
    }
    const target = this.timeUs + us;
    this.timeUs = target;
    const wallTarget = this.wallStart + (target - this.simStart) / 1000 / this.speed;
    let wait = wallTarget - this.host.wallNowMs();
    if (wait < -250) {
      // we're far behind (slow code); re-anchor so we don't race to catch up
      this.wallStart = this.host.wallNowMs();
      this.simStart = this.timeUs;
      wait = 0;
    }
    while (wait > 0) {
      const chunk = Math.min(wait, 16);
      this.host.waitUs(chunk * 1000);
      this.checkStop();
      this.pollInputs();
      this.maybeFrame();
      wait = wallTarget - this.host.wallNowMs();
    }
    this.pollInputs();
    this.maybeFrame();
  }

  // ------------------------------------------------------------------ inputs
  pollInputs() {
    const changes = this.host.pollInputs();
    if (changes) for (const ch of changes) this.applyInput(ch);
    // Release PIR holds
    for (const [id, until] of this.pirHold) {
      if (this.timeUs >= until) {
        this.pirHold.delete(id);
        this.model.setPartState(id, 'motion', 0);
      }
    }
    if (this.irqWatch.size && (changes?.length || this.model.dirty)) this.checkIrqs();
  }
  /** Change speed without jumping simulated time: re-anchor the wall clock mapping. */
  setSpeed(speed: number) {
    if (speed === this.speed) return;
    this.syncClock();
    this.wallStart = this.host.wallNowMs();
    this.simStart = this.timeUs;
    this.speed = speed;
  }
  applyInput(ch: InputChange) {
    const part = this.project.parts.find((p) => p.id === ch.part);
    if (!part) return;
    if (part.type === 'pir' && ch.key === 'motion') {
      if (ch.value) {
        this.pirHold.delete(part.id);
        this.model.setPartState(part.id, 'motion', 1);
      } else this.pirHold.set(part.id, this.timeUs + 2_000_000); // HC-SR501 holds OUT high ~2 s
      return;
    }
    this.model.setPartState(ch.part, ch.key, ch.value);
  }
  private checkIrqs() {
    for (const [g, last] of this.irqWatch) {
      const v = this.readPin(g);
      if (v !== last) {
        this.irqWatch.set(g, v);
        this.irqQueue.push(g, v);
      }
    }
  }

  // ------------------------------------------------------------------ warnings / serial
  warn(id: string, severity: SimWarning['severity'], text: string, parts?: string[]) {
    if (this.warnings.has(id)) return;
    const w = { id, severity, text, parts };
    this.warnings.set(id, w);
    this.warningsNew.push(w);
  }
  get allWarnings() {
    return [...this.warnings.values()];
  }
  serial(line: string) {
    this.lines++;
    this.serialAll.push(line);
    if (this.serialAll.length > 2000) this.serialAll.splice(0, 500);
    this.serialNew.push(line);
  }

  // ------------------------------------------------------------------ GPIO
  private gpioValid(g: number) {
    return !!this.board?.pins.find((p) => p.gpio === g);
  }
  pinInit(g: number, mode: number, pull: number, value: number): number {
    this.tick();
    if (this.board?.id === 'pico' && g === 25) {
      if (value >= 0) this.outLevel.set(25, value);
      return 0;
    }
    if (!this.gpioValid(g)) return -1;
    const bp = this.board!.pins.find((p) => p.gpio === g)!;
    if ((mode === 3 || mode === 7) && !bp.caps?.includes('out')) return -2;
    if (mode === 3 || mode === 7) {
      const level = value >= 0 ? value : this.outLevel.get(g) ?? 0;
      this.outLevel.set(g, level);
      this.pwm.delete(g);
      this.model.setPinMode(g, { kind: 'out', level });
    } else {
      if (pull === 1 && !bp.caps?.includes('out')) this.warn(`nopull${g}`, 'warning', `GPIO${g} is input-only and has no internal pull-up resistor — Pin.PULL_UP is ignored. Add an external 10 kΩ pull-up or use another pin.`);
      const pullKind = pull === 1 && bp.caps?.includes('out') ? 'up' : pull === 2 ? 'down' : 'none';
      this.model.setPinMode(g, { kind: 'in', pull: pullKind });
    }
    return 0;
  }
  private tfts = new Map<string, { dev: TFTDevice; ocrAt: number; lines: string[] }>();
  private tftDev(part: PartInstance, cs: NonNullable<ReturnType<typeof customSpec>>): TFTDevice {
    let t = this.tfts.get(part.id);
    if (!t) {
      t = { dev: new TFTDevice(part.id, cs.sim.width ?? 240, cs.sim.height ?? 240, cs.sim.controller === 'ssd1351' ? 'ssd1351' : 'dcs', cs.sim.pixelBits ?? 16), ocrAt: -1, lines: [] };
      this.tfts.set(part.id, t);
    }
    return t.dev;
  }
  /** Segment displays driven by datasheet parts (TM1637 by pin changes, MAX7219 over SPI). */
  private segDevs = new Map<string, TM1637Device | MAX7219Device>();
  private segDev(part: PartInstance) {
    const cs = customSpec(part.type);
    if (cs?.sim.kind !== 'segment-display') return undefined;
    let d = this.segDevs.get(part.id);
    if (!d) {
      d = cs.sim.protocol === 'max7219' ? new MAX7219Device(part.id, cs.sim.count ?? 1) : new TM1637Device(part.id, cs.sim.digits ?? 4);
      this.segDevs.set(part.id, d);
    }
    return d;
  }
  /** Before a pin changes: feed TM1637s on CLK/DIO and latch MAX7219s on LOAD rising. */
  private segPinChange(g: number, v: number) {
    const prev = this.outLevel.get(g) ?? 0;
    if (prev === v) return;
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      if (cs?.sim.kind !== 'segment-display') continue;
      const dev = this.segDev(part)!;
      if (dev instanceof TM1637Device) {
        const clkG = this.model.gpiosOnNet(part.id, 'CLK')[0];
        const dioG = this.model.gpiosOnNet(part.id, 'DIO')[0];
        if (g !== clkG && g !== dioG) continue;
        const clk = this.outLevel.get(clkG) ?? 0;
        const dio = this.outLevel.get(dioG) ?? 0;
        if (g === clkG) dev.update(v, dio, clk, dio);
        else dev.update(clk, v, clk, dio);
      } else {
        const load = cs.pins.find((p) => p.fn === 'spi.cs')?.name;
        if (load && v && this.model.gpiosOnNet(part.id, load).includes(g)) dev.latch();
      }
    }
  }

  /** 74HC595 / 74HC165 shift registers, driven by the program's pin changes. */
  private shiftRegs = new Map<string, { sr: number[]; out: number[]; prevClk: number; prevLatch: number }>();
  private shiftPinChange(g: number, v: number) {
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      const sh = cs?.sim.kind === 'shift-register' ? cs.sim.shift : undefined;
      if (!sh || !this.model.modulePowered(part.id)) continue;
      const on = (pin?: string) => (pin ? this.model.gpiosOnNet(part.id, pin)[0] : undefined);
      const level = (pin?: string) => {
        const gg = on(pin);
        return gg === undefined ? 0 : gg === g ? v : (this.outLevel.get(gg) ?? 0);
      };
      const n = (sh.outputs ?? sh.inputs ?? []).length;
      const st = this.shiftRegs.get(part.id) ?? { sr: new Array(n).fill(0), out: new Array(n).fill(0), prevClk: 0, prevLatch: 0 };
      this.shiftRegs.set(part.id, st);
      const clk = level(sh.clock);
      if (sh.type === '595') {
        const latch = level(sh.latch);
        // Rising SRCLK shifts the data bit in; rising RCLK copies the shift register to the outputs (Q0 = newest… QH oldest).
        if (clk && !st.prevClk) st.sr = [level(sh.data), ...st.sr.slice(0, n - 1)];
        if (latch && !st.prevLatch) st.out = [...st.sr];
        st.prevLatch = latch;
      } else {
        const load = level(sh.load);
        // inputs[] are A…H; H comes out first.
        const vals = () => [...(sh.inputs ?? [])].reverse().map((p) => ((this.model.states.get(part.id) as any)?.[p] > 0 ? 1 : 0));
        // SH/LD low loads the inputs (H first out); each rising CLK shifts the next one onto QH.
        if (!load) st.sr = vals();
        else if (clk && !st.prevClk) st.sr = [...st.sr.slice(1), 0];
        const so = on(sh.serialOut);
        if (so !== undefined) this.model.setModuleOutput(part.id, 'shout', st.sr[0] ? this.model.moduleSupply(part.id) : 0);
      }
      st.prevClk = clk;
    }
  }

  /** HX711-style bridge ADCs: clock edges on PD_SCK shift the 24-bit reading out on DOUT. */
  private hx = new Map<string, { bit: number; raw: number; readyAt: number }>();
  private hxParts() {
    return this.project.parts.flatMap((part) => {
      const cs = customSpec(part.type);
      return cs?.sim.kind === 'hx711' && cs.sim.clockPin && cs.sim.outputPin ? [{ part, cs }] : [];
    });
  }
  private hxDrive(partId: string, high: boolean) {
    const vcc = this.model.moduleSupply(partId);
    this.model.setModuleOutput(partId, 'hxout', high ? vcc : 0);
  }
  /** Ready again once the next conversion is done (DOUT low). */
  private hxUpdate() {
    for (const { part } of this.hxParts()) {
      const st = this.hx.get(part.id) ?? { bit: 0, raw: 0, readyAt: 0 };
      this.hx.set(part.id, st);
      if (st.bit < 0 && this.timeUs >= st.readyAt) st.bit = 0;
      if (st.bit === 0) this.hxDrive(part.id, !this.model.modulePowered(part.id));
    }
  }
  private hxClock(g: number) {
    for (const { part, cs } of this.hxParts()) {
      if (!this.model.gpiosOnNet(part.id, cs.sim.clockPin!).includes(g)) continue;
      const st = this.hx.get(part.id) ?? { bit: 0, raw: 0, readyAt: 0 };
      this.hx.set(part.id, st);
      if (st.bit < 0) continue; // still converting
      if (st.bit === 0) {
        const value = (this.model.states.get(part.id) as any)?.value ?? 0;
        let raw = Math.round(value * (cs.sim.countsPerUnit ?? 1) + (cs.sim.offsetCounts ?? 0));
        raw = Math.max(-0x800000, Math.min(0x7fffff, raw));
        st.raw = raw < 0 ? raw + 0x1000000 : raw;
      }
      st.bit++;
      if (st.bit <= 24) this.hxDrive(part.id, ((st.raw >> (24 - st.bit)) & 1) === 1);
      else {
        // 25th pulse: the read is over; DOUT stays high until the next conversion (80 samples/s).
        this.hxDrive(part.id, true);
        st.bit = -1;
        st.readyAt = this.timeUs + 12500;
      }
    }
  }

  pinWrite(g: number, v: number) {
    this.tick();
    if (v && !(this.outLevel.get(g) ?? 0)) this.hxClock(g);
    this.segPinChange(g, v);
    this.shiftPinChange(g, v);
    if (v !== (this.outLevel.get(g) ?? 1)) this.spiDeselect(g);
    if (this.board?.id === 'pico' && g === 25) {
      this.outLevel.set(25, v);
      return;
    }
    const prev = this.outLevel.get(g) ?? 0;
    this.outLevel.set(g, v);
    const mode = this.model.pinModes.get(g);
    if (mode?.kind === 'out' || mode?.kind === 'pwm') this.model.setPinMode(g, { kind: 'out', level: v });
    // Track trigger pulses (HC-SR04)
    const tr = this.trig.get(g) ?? { rise: -1, pulse: 0, at: -1 };
    if (v && !prev) tr.rise = this.timeUs;
    if (!v && prev && tr.rise >= 0) {
      tr.pulse = this.timeUs - tr.rise;
      tr.at = this.timeUs;
    }
    this.trig.set(g, tr);
    if (!v) for (const { dev, part } of this.epapers) if (this.model.gpiosOnNet(part.id, 'RST').includes(g)) dev.reset();
    this.updateActuators(g);
  }
  readPin(g: number): number {
    if (this.board?.id === 'pico' && g === 25) return this.outLevel.get(25) ?? 0;
    const mode = this.model.pinModes.get(g);
    if (mode?.kind === 'out') return mode.level;
    return this.model.readDigital(g);
  }
  pinRead(g: number): number {
    this.tick();
    this.hxUpdate();
    const v = this.readPin(g);
    const volts = this.model.gpioVoltage(g);
    if (volts > 3.7) this.warn(`overv${g}`, 'error', `GPIO${g} sees ${volts.toFixed(1)} V — more than the 3.3 V it can take. Use a voltage divider or level shifter.`);
    return v;
  }
  adcInit(g: number): number {
    this.tick();
    const bp = this.board?.pins.find((p) => p.gpio === g);
    if (!bp?.caps?.includes('adc')) return -1;
    this.model.setPinMode(g, { kind: 'analog' });
    return 0;
  }
  /** Waveform outputs (microphones, heartbeat sensors) follow simulated time at every sample. */
  private updateWaves() {
    const t = this.timeUs / 1e6;
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      const w = cs?.sim.wave;
      if (!w || cs!.sim.kind !== 'analog-sensor') continue;
      const st = this.model.states.get(part.id) as any;
      const vcc = this.model.moduleSupply(part.id);
      if (vcc < (cs!.vmin ?? 2.7) * 0.85) continue;
      const f = w.freqControl ? (st?.[w.freqControl] ?? 0) * (w.freqScale ?? 1) : w.freqHz ?? 0;
      const amp = ((st?.[w.ampControl] ?? 0) * w.voltsPerUnit) / 2;
      const ph = (f * t) % 1;
      const shape = w.shape === 'pulse' ? (ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : 0) * 2 - 1 : Math.sin(2 * Math.PI * ph);
      this.model.setModuleOutput(part.id, 'out', Math.max(0, Math.min(vcc, w.centerV + amp * shape)));
    }
  }
  adcRead(g: number, atten: number): number {
    this.tick();
    this.updateWaves();
    const v = this.model.gpioVoltage(g);
    const full = this.board?.id === 'esp32' ? [1.1, 1.5, 2.2, 3.3][atten] ?? 3.3 : 3.3;
    if (v > 3.6) this.warn(`overv${g}`, 'error', `GPIO${g} (ADC) sees ${v.toFixed(1)} V — above 3.3 V. Use a divider.`);
    const noise = (Math.random() - 0.5) * 60;
    return Math.max(0, Math.min(65535, Math.round((v / full) * 65535 + noise)));
  }
  pwmSet(g: number, freq: number, duty: number) {
    this.tick();
    if (!this.gpioValid(g)) return;
    if (duty < 0) {
      this.pwm.delete(g);
      this.model.setPinMode(g, { kind: 'unused' });
    } else {
      this.pwm.set(g, { freq, duty });
      this.model.setPinMode(g, { kind: 'pwm', duty, freq });
    }
    this.updateActuators(g);
  }

  /** Servos, buzzers and relays react to pin changes immediately. */
  private updateActuators(g: number) {
    for (const part of this.project.parts) {
      if (part.type === 'servo' && this.model.gpiosReachable(part.id, 'PWM').includes(g)) {
        const p = this.pwm.get(g);
        if (!this.model.modulePowered(part.id)) {
          this.warn(`servo-power-${part.id}`, 'warning', `${part.ref ?? part.id}: the servo has no power — connect V+ to 5 V and GND to ground.`, [part.id]);
          continue;
        }
        if (p && p.duty > 0) {
          if (p.freq < 40 || p.freq > 60) {
            this.warn(`servo-freq-${part.id}`, 'warning', `${part.ref ?? part.id}: servos expect a 50 Hz PWM signal, got ${p.freq} Hz.`, [part.id]);
            continue;
          }
          const pulseUs = (p.duty / 65535) * (1e6 / p.freq);
          this.servos.set(part.id, Math.max(0, Math.min(180, ((pulseUs - 500) / 2000) * 180)));
        }
      }
      const scs = customSpec(part.type);
      if (scs?.sim.kind === 'servo' && scs.sim.inputPin && scs.sim.servo && this.model.gpiosReachable(part.id, scs.sim.inputPin).includes(g)) {
        const p = this.pwm.get(g);
        if (!this.model.modulePowered(part.id)) {
          this.warn(`servo-power-${part.id}`, 'warning', `${part.ref ?? part.id}: the servo has no power — connect its + wire and GND.`, [part.id]);
          continue;
        }
        const sv = scs.sim.servo;
        if (sv.continuous && !(p && p.duty > 0)) this.servoSpeeds.set(part.id, 0); // no pulses: it stops
        if (p && p.duty > 0) {
          if (p.freq < 40 || p.freq > 400) {
            this.warn(`servo-freq-${part.id}`, 'warning', `${part.ref ?? part.id}: this servo expects 50 Hz pulses, got ${p.freq} Hz.`, [part.id]);
            continue;
          }
          const pulseUs = (p.duty / 65535) * (1e6 / p.freq);
          const c = sv.continuous;
          if (c) {
            const off = pulseUs - c.stopUs;
            const frac = Math.abs(off) <= c.deadbandUs / 2 ? 0 : Math.min(1, off < 0 ? -off / (c.stopUs - sv.minUs) : off / (sv.maxUs - c.stopUs));
            const cw = off < 0 ? c.below === 'cw' : c.below === 'ccw';
            this.servoSpeeds.set(part.id, cw ? frac : -frac);
          } else this.servos.set(part.id, Math.max(0, Math.min(sv.degrees, ((pulseUs - sv.minUs) / (sv.maxUs - sv.minUs)) * sv.degrees)));
        }
      }
      if (part.type === 'buzzer' && this.model.gpiosReachable(part.id, '+').includes(g)) {
        const p = this.pwm.get(g);
        this.tones.set(part.id, p && p.duty > 0 && p.duty < 65535 ? p.freq : 0);
      }
    }
  }

  pulseIn(g: number, level: number, timeoutUs: number): number {
    this.tick();
    for (const part of this.project.parts) {
      if (part.type !== 'hcsr04') continue;
      if (!this.model.gpiosReachable(part.id, 'ECHO').includes(g)) continue;
      const trigGpios = this.model.gpiosReachable(part.id, 'TRIG');
      const recent = trigGpios.some((tg) => {
        const tr = this.trig.get(tg);
        return tr && tr.pulse >= 5 && this.timeUs - tr.at < 50_000;
      });
      if (!recent) {
        this.warn(`hc-trig-${part.id}`, 'warning', `${part.ref}: no 10 µs trigger pulse seen on its TRIG pin before reading ECHO.`, [part.id]);
        continue;
      }
      const vcc = this.model.moduleSupply(part.id);
      if (vcc < 4.5) {
        this.warn(`hc-power-${part.id}`, 'warning', `${part.ref}: the HC-SR04 needs 5 V but gets ${vcc.toFixed(1)} V — it won't measure reliably. Connect VCC to 5 V (VIN/VBUS).`, [part.id]);
        this.sleepUs(Math.min(timeoutUs, 30000));
        return -2;
      }
      // Electrically check that the echo actually reaches the pin as a logic high.
      this.model.setModuleOutput(part.id, 'echo', vcc);
      const ok = this.model.readDigital(g) === level;
      const v = this.model.gpioVoltage(g);
      this.model.setModuleOutput(part.id, 'echo', 0);
      if (v > 3.7) this.warn(`overv${g}`, 'error', `GPIO${g} sees ${v.toFixed(1)} V from the HC-SR04 echo — that's above 3.3 V! Use a 1 kΩ/2 kΩ divider.`, [part.id]);
      if (!ok) {
        this.warn(`hc-echo-${part.id}`, 'warning', `${part.ref}: the ECHO signal only reaches ${v.toFixed(2)} V at GPIO${g}, too low to read as HIGH.`, [part.id]);
        return -2;
      }
      const st = this.model.states.get(part.id)!;
      const d = Math.max(2, Math.min(400, st.distance));
      const dur = Math.round(d * 58 + (Math.random() - 0.5) * 20);
      this.sleepUs(450 + dur);
      return dur;
    }
    this.sleepUs(timeoutUs);
    return -2;
  }

  dhtRead(g: number): number[] {
    this.tick();
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      const data = part.type === 'dht22' ? 'DATA' : cs?.sim.kind === 'dht-sensor' ? cs.sim.outputPin : undefined;
      if (!data) continue;
      if (!this.model.gpiosOnNet(part.id, data).includes(g)) continue;
      if (!this.model.modulePowered(part.id)) {
        this.warn(`dht-power-${part.id}`, 'warning', `${part.ref}: the ${cs?.mpn ?? 'DHT22'} isn't powered — check VCC and GND.`, [part.id]);
        break;
      }
      this.sleepUs(5000);
      const st = this.model.states.get(part.id)! as any;
      return cs ? [0, st.value, st.humidity] : [0, st.temperature, st.humidity];
    }
    this.warn(`dht-missing-${g}`, 'warning', `Your code reads a DHT sensor on GPIO${g}, but no powered DHT22 DATA pin is wired to GPIO${g}.`);
    this.sleepUs(5000);
    return [-ETIMEDOUT, 0, 0];
  }

  /** 1-Wire thermometers (datasheet parts of kind onewire-temp) whose DQ line is on this GPIO. */
  private owDevices(g: number) {
    const out: { part: PartInstance; rom: string }[] = [];
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      if (cs?.sim.kind !== 'onewire-temp' || !cs.sim.outputPin) continue;
      if (!this.model.gpiosOnNet(part.id, cs.sim.outputPin).includes(g)) continue;
      if (!this.model.modulePowered(part.id)) {
        this.warn(`ow-power-${part.id}`, 'warning', `${part.ref}: the ${cs.mpn} isn't powered — check its power and GND wires.`, [part.id]);
        continue;
      }
      // A stable 64-bit ROM code: family, 6 serial bytes from the part id, Maxim CRC-8.
      let h = 2166136261;
      for (const ch of part.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
      const rom = [cs.sim.family ?? 0x28, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff, (h >>> 24) & 0xff, 0, 0];
      let crc = 0;
      for (let b of rom) for (let i = 0; i < 8; i++, b >>= 1) crc = (crc ^ b) & 1 ? (crc >> 1) ^ 0x8c : crc >> 1;
      out.push({ part, rom: [...rom, crc].map((x) => x.toString(16).padStart(2, '0')).join('') });
    }
    return out;
  }

  owScan(g: number): string[] {
    this.tick();
    this.sleepUs(3000);
    const devs = this.owDevices(g);
    if (!devs.length) this.warn(`ow-missing-${g}`, 'warning', `Your code scans a 1-Wire bus on GPIO${g}, but no powered 1-Wire sensor's data pin is wired to GPIO${g}.`);
    return devs.map((d) => d.rom);
  }

  owTemp(g: number, rom: string): number | null {
    this.tick();
    this.sleepUs(5000);
    const d = this.owDevices(g).find((x) => x.rom === rom.toLowerCase());
    if (!d) return null;
    // DS18B20 default 12-bit resolution: 0.0625 °C steps.
    return Math.round(((this.model.states.get(d.part.id) as any)?.value ?? 25) * 16) / 16;
  }

  neopixelWrite(g: number, hex: string) {
    this.tick();
    const bytes = hexToBytes(hex);
    this.sleepUs(bytes.length * 1.25 * 8 + 50);
    let found = false;
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      const din = part.type === 'neopixel-ring' ? 'DIN' : cs?.sim.kind === 'addressable-led' ? cs.sim.inputPin : undefined;
      if (!din) continue;
      if (!this.model.gpiosReachable(part.id, din, 1000).includes(g)) continue;
      found = true;
      if (!this.model.modulePowered(part.id)) {
        this.warn(`np-power-${part.id}`, 'warning', `${part.ref}: the LEDs aren't powered — connect their 5 V and GND.`, [part.id]);
        continue;
      }
      this.pixels.set(part.id, bytes);
    }
    if (!found) this.warn(`np-missing-${g}`, 'warning', `NeoPixel data was sent on GPIO${g}, but no NeoPixel DIN is connected there.`);
  }

  // ------------------------------------------------------------------ I2C
  i2cDefault(id: number): number[] {
    const b = this.board;
    if (!b) return [22, 21];
    const pin = (n: string) => b.pins.find((p) => p.name === n)?.gpio ?? -1;
    if (b.id === 'pico') return id === 1 ? [7, 6] : [9, 8];
    return [pin(b.i2c.scl), pin(b.i2c.sda)];
  }
  i2cOpen(sda: number, scl: number): number {
    this.tick();
    this.buses.push({ sda, scl });
    return this.buses.length - 1;
  }
  /** A part's I2C pin names: datasheet parts use whatever their board prints, marked by fn. */
  private i2cPins(part: PartInstance): [string, string] {
    const cs = customSpec(part.type);
    return [cs?.pins.find((p) => p.fn === 'i2c.sda')?.name ?? 'SDA', cs?.pins.find((p) => p.fn === 'i2c.scl')?.name ?? 'SCL'];
  }
  private devicesOn(bus: number) {
    const b = this.buses[bus];
    if (!b) return [];
    const via = ['level-shifter'];
    const shifterOk = () => this.project.parts.filter((p) => p.type === 'level-shifter').every((p) => this.model.modulePowered(p.id));
    return this.devices.filter(({ part }) => {
      const [SDA, SCL] = this.i2cPins(part);
      const sda = this.model.gpiosReachable(part.id, SDA, 0, via);
      const scl = this.model.gpiosReachable(part.id, SCL, 0, via);
      const direct = this.model.gpiosOnNet(part.id, SDA).includes(b.sda);
      return sda.includes(b.sda) && scl.includes(b.scl) && this.model.modulePowered(part.id) && (direct || shifterOk());
    });
  }
  private diagnoseI2c(bus: number, addr: number) {
    const b = this.buses[bus];
    const cand = this.devices.filter(({ dev }) => dev.addr === addr);
    const hex = `0x${addr.toString(16).padStart(2, '0')}`;
    let why = `Nothing answered at I2C address ${hex} on SDA=GPIO${b.sda}, SCL=GPIO${b.scl}.`;
    for (const { part } of cand) {
      const [SDA, SCL] = this.i2cPins(part);
      const sdaG = this.model.gpiosOnNet(part.id, SDA);
      const sclG = this.model.gpiosOnNet(part.id, SCL);
      const name = part.ref ?? part.id;
      if (!this.model.modulePowered(part.id)) why += ` ${name} (${partDef(part.type).name}) has no power — check its VCC/GND wires.`;
      else if (sdaG.includes(b.scl) && sclG.includes(b.sda)) why += ` ${name}'s SDA and SCL wires are swapped.`;
      else if (!sdaG.length || !sclG.length) why += ` ${name}'s SDA/SCL pins aren't wired to the board.`;
      else why += ` ${name} is wired to SDA=GPIO${sdaG[0]}, SCL=GPIO${sclG[0]} — the code uses different pins.`;
    }
    if (!cand.length) why += ' No part with that address is in the design.';
    this.warn(`i2c-${bus}-${addr}`, 'error', why, cand.map((c) => c.part.id));
  }
  i2cWrite(bus: number, addr: number, hex: string): number {
    this.tick();
    const bytes = hexToBytes(hex);
    this.sleepUs((bytes.length + 1) * 22.5);
    const d = this.devicesOn(bus).find(({ dev }) => dev.addr === addr);
    if (!d) {
      this.diagnoseI2c(bus, addr);
      return -ENODEV;
    }
    d.dev.write(bytes);
    if (this.i2cLog.length < 400) this.i2cLog.push(`W ${addr.toString(16)} ${bytes.length}B`);
    return bytes.length;
  }
  i2cRead(bus: number, addr: number, n: number): string {
    this.tick();
    this.sleepUs((n + 1) * 22.5);
    const d = this.devicesOn(bus).find(({ dev }) => dev.addr === addr);
    if (!d) {
      this.diagnoseI2c(bus, addr);
      return `-${ENODEV}`;
    }
    return bytesToHex(d.dev.read(n));
  }
  i2cScan(bus: number): number[] {
    this.tick();
    this.sleepUs(2000);
    return this.devicesOn(bus).map(({ dev }) => dev.addr).filter((a) => a >= 0); // SPI-only displays have no address
  }

  // ------------------------------------------------------------------ MCP3008 (Raspberry Pi)
  mcp3008Read(ch: number): number {
    this.tick();
    const part = this.project.parts.find((p) => p.type === 'mcp3008');
    if (!part) return -1;
    const need: [string, number[]][] = [['CLK', [11]], ['DOUT', [9]], ['DIN', [10]], ['CS', [8, 7]]];
    for (const [pin, gpios] of need) {
      const on = this.model.gpiosOnNet(part.id, pin);
      if (!on.some((g) => gpios.includes(g))) {
        this.warn(`mcp-${pin}`, 'error', `${part.ref}: ${pin} must connect to GPIO${gpios.join(' or GPIO')} (SPI0) but is ${on.length ? `on GPIO${on[0]}` : 'not connected'}.`, [part.id]);
        return -1;
      }
    }
    if (!this.model.modulePowered(part.id)) {
      this.warn('mcp-power', 'error', `${part.ref}: the MCP3008 has no power on VDD.`, [part.id]);
      return -1;
    }
    this.sleepUs(30);
    const vref = this.model.pinVoltage(part.id, 'VREF') || 3.3;
    const v = this.model.pinVoltage(part.id, `CH${ch}`);
    return Math.max(0, Math.min(1023, Math.round((v / vref) * 1023)));
  }

  // ------------------------------------------------------------------ SPI
  spiDefault(id: number): number[] {
    const b = this.board;
    if (b?.id === 'esp32') return id === 1 ? [14, 13, 12] : [18, 23, 19];
    if (b?.id === 'pico') return id === 1 ? [10, 11, 12] : [18, 19, 16];
    return [11, 10, 9];
  }
  spiOpen(sck: number, mosi: number, miso: number): number {
    this.tick();
    this.spiBuses.push({ sck, mosi, miso });
    return this.spiBuses.length - 1;
  }
  spiWrite(bus: number, hex: string) {
    this.tick();
    const bytes = hexToBytes(hex);
    this.timeUs += bytes.length * 2; // ~4 MHz
    const b = this.spiBuses[bus];
    if (!b) return;
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      if (cs?.sim.kind !== 'tft-display') continue;
      const pin = (fn: string) => cs.pins.find((p) => p.fn === fn)?.name;
      const on = (fn: string) => (pin(fn) ? this.model.gpiosOnNet(part.id, pin(fn)!) : []);
      if (!on('spi.sck').includes(b.sck) || !on('spi.mosi').includes(b.mosi)) continue;
      const csg = on('spi.cs')[0];
      if (csg !== undefined && (this.outLevel.get(csg) ?? 1) !== 0) continue;
      if (!this.model.modulePowered(part.id)) continue;
      const dev = this.tftDev(part, cs);
      const dcg = on('tft.dc')[0];
      if (dcg !== undefined && (this.outLevel.get(dcg) ?? 1) === 0) for (const c of bytes) dev.command(c);
      else dev.data(bytes);
    }
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      if (cs?.sim.kind !== 'oled-display' || cs.sim.bus !== 'spi') continue;
      const pin = (fn: string) => cs.pins.find((p) => p.fn === fn)?.name;
      const on = (fn: string) => (pin(fn) ? this.model.gpiosOnNet(part.id, pin(fn)!) : []);
      if (!on('spi.sck').includes(b.sck) || !on('spi.mosi').includes(b.mosi)) continue;
      const csg = on('spi.cs')[0];
      if (csg !== undefined && (this.outLevel.get(csg) ?? 1) !== 0) continue;
      const res = on('tft.reset')[0];
      if (res !== undefined && (this.outLevel.get(res) ?? 1) === 0) continue; // held in reset
      if (!this.model.modulePowered(part.id)) continue;
      const dev = this.devices.find((x) => x.part.id === part.id)?.dev;
      const dcg = on('tft.dc')[0];
      if (dev instanceof SSD1306Device) dev.spi(dcg !== undefined && (this.outLevel.get(dcg) ?? 1) !== 0, bytes);
    }
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      if (cs?.sim.kind !== 'segment-display' || cs.sim.protocol !== 'max7219') continue;
      const pin = (fn: string) => cs.pins.find((p) => p.fn === fn)?.name ?? '';
      const on = (fn: string) => this.model.gpiosOnNet(part.id, pin(fn));
      if (!on('spi.sck').includes(b.sck) || !on('spi.mosi').includes(b.mosi)) continue;
      const load = on('spi.cs')[0];
      if (load === undefined || (this.outLevel.get(load) ?? 1) !== 0) continue;
      (this.segDev(part) as MAX7219Device).clockIn(bytes);
    }
    for (const { dev, part } of this.epapers) {
      const on = (pin: string) => this.model.gpiosOnNet(part.id, pin);
      if (!on('CLK').includes(b.sck) || !on('DIN').includes(b.mosi)) {
        this.warn(`epd-spi-${part.id}`, 'error', `${part.ref}: CLK/DIN must connect to the SPI pins the code uses (GPIO${b.sck} clock, GPIO${b.mosi} data).`, [part.id]);
        continue;
      }
      const cs = on('CS')[0];
      if (cs === undefined) {
        this.warn(`epd-cs-${part.id}`, 'error', `${part.ref}: the CS pin isn't connected to the board.`, [part.id]);
        continue;
      }
      if ((this.outLevel.get(cs) ?? 1) !== 0) continue; // not selected
      if (!this.model.modulePowered(part.id)) {
        this.warn(`epd-power-${part.id}`, 'warning', `${part.ref}: the e-paper display has no power — connect VCC and GND.`, [part.id]);
        continue;
      }
      const dc = on('DC')[0];
      dev.write(bytes, dc === undefined ? 0 : this.outLevel.get(dc) ?? 0);
    }
  }

  // ------------------------------------------------------------------ UART (datasheet serial modules)
  private uarts: { id: number; tx: number; rx: number; baud: number; rxbuf: number[]; written: number[]; last: Map<string, number> }[] = [];
  /** Pico UART pin mux (TX, RX) per UART; ESP32 routes UARTs to any pin. */
  static PICO_UART: Record<number, { tx: number[]; rx: number[] }> = { 0: { tx: [0, 12, 16, 28], rx: [1, 13, 17, 29] }, 1: { tx: [4, 8, 20, 24], rx: [5, 9, 21, 25] } };
  uartOpen(id: number, tx: number, rx: number, baud: number): number {
    this.tick();
    const b = this.board?.id;
    const dflt: Record<number, [number, number]> = b === 'pico' ? { 0: [0, 1], 1: [4, 5] } : { 0: [1, 3], 1: [10, 9], 2: [17, 16] };
    const [dtx, drx] = dflt[id] ?? [-1, -1];
    const t = tx >= 0 ? tx : dtx;
    const r = rx >= 0 ? rx : drx;
    if (b === 'pico') {
      const mux = SimEngine.PICO_UART[id];
      if (!mux || (tx >= 0 && !mux.tx.includes(t)) || (rx >= 0 && !mux.rx.includes(r))) return -1;
    }
    this.uarts.push({ id, tx: t, rx: r, baud, rxbuf: [], written: [], last: new Map() });
    return this.uarts.length - 1;
  }
  /** Serial modules whose TX reaches this UART's RX pin (they talk to us) / whose RX hears our TX. */
  private uartParts(u: { tx: number; rx: number; baud: number }) {
    return this.project.parts.flatMap((part) => {
      const cs = customSpec(part.type);
      if (cs?.sim.kind !== 'uart-device' || !this.model.modulePowered(part.id)) return [];
      const pin = (fn: string) => cs.pins.find((p) => p.fn === fn)?.name;
      const talks = !!pin('uart.tx') && this.model.gpiosOnNet(part.id, pin('uart.tx')!).includes(u.rx);
      const hears = !!pin('uart.rx') && this.model.gpiosOnNet(part.id, pin('uart.rx')!).includes(u.tx);
      if (!talks && !hears) return [];
      if (cs.sim.uartBaud && cs.sim.uartBaud !== u.baud) {
        this.warn(`uart-baud-${part.id}`, 'warning', `${part.ref}: the ${cs.mpn} talks at ${cs.sim.uartBaud} baud, but the UART is set to ${u.baud}. The bytes come out as garbage.`, [part.id]);
        return [];
      }
      return [{ part, cs, talks, hears }];
    });
  }
  private uartPump(u: (typeof this.uarts)[number]) {
    const t = this.timeUs / 1000;
    for (const { part, cs, talks } of this.uartParts(u)) {
      const st = cs.sim.uartStream;
      if (!talks || !st) continue;
      if (st.when && !((this.model.states.get(part.id) as any)?.[st.when] > 0)) {
        u.last.delete(part.id); // the first frame comes soon after the tag arrives
        continue;
      }
      const last = u.last.get(part.id) ?? -st.everyMs / 2;
      const n = Math.floor((t - last) / st.everyMs);
      if (n < 1) continue;
      u.last.set(part.id, last + n * st.everyMs);
      const value = (k: string) => (this.model.states.get(part.id) as any)?.[k] ?? 0;
      const one = st.nmea ? [...new TextEncoder().encode(nmeaSentences(value, t))] : packResponse(st.bytes ?? [], value);
      u.rxbuf.push(...one);
      if (u.rxbuf.length > 4096) u.rxbuf.splice(0, u.rxbuf.length - 4096);
    }
  }
  private uartAt(h: number) {
    const u = this.uarts[h];
    if (u) this.uartPump(u);
    return u;
  }
  uartAny(h: number): number {
    this.tick();
    return this.uartAt(h)?.rxbuf.length ?? 0;
  }
  uartRead(h: number, n: number): string {
    this.tick();
    const u = this.uartAt(h);
    if (!u || !u.rxbuf.length) return '';
    const got = u.rxbuf.splice(0, n < 0 ? u.rxbuf.length : n);
    this.timeUs += (got.length * 10 * 1e6) / (u.baud || 9600);
    return bytesToHex(got);
  }
  uartReadline(h: number): string {
    this.tick();
    const u = this.uartAt(h);
    const nl = u ? u.rxbuf.indexOf(10) : -1;
    if (!u || nl < 0) return '';
    return this.uartRead(h, nl + 1);
  }
  uartWrite(h: number, hex: string) {
    this.tick();
    const u = this.uartAt(h);
    if (!u) return;
    const bytes = hexToBytes(hex);
    this.timeUs += (bytes.length * 10 * 1e6) / (u.baud || 9600);
    u.written.push(...bytes);
    for (const { part, cs, hears } of this.uartParts(u)) {
      if (!hears) continue;
      const value = (k: string) => (this.model.states.get(part.id) as any)?.[k] ?? 0;
      for (const r of cs.sim.uartReplies ?? []) {
        const m = r.match.split(' ').map((x) => parseInt(x, 16));
        const at = u.written.findIndex((_, i) => m.every((x, j) => u.written[i + j] === x));
        if (at < 0) continue;
        u.written.splice(0, at + m.length);
        u.rxbuf.push(...packResponse(r.bytes, value));
      }
    }
    if (u.written.length > 64) u.written.splice(0, u.written.length - 64);
  }

  /** Full-duplex transfer: e-paper still gets the bytes; a selected datasheet SPI chip answers on MISO. */
  private spiTx = new Map<string, { written: number[]; reply: number[] | null; start: number }>();
  spiXfer(bus: number, hex: string): string {
    this.spiWrite(bus, hex);
    const out = hexToBytes(hex).map(() => 0xff);
    const b = this.spiBuses[bus];
    if (!b) return bytesToHex(out);
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      if (cs?.sim.kind !== 'spi-device') continue;
      const pin = (fn: string) => cs.pins.find((p) => p.fn === fn)?.name;
      const on = (fn: string) => (pin(fn) ? this.model.gpiosOnNet(part.id, pin(fn)!) : []);
      if (!on('spi.sck').includes(b.sck) || !on('spi.miso').includes(b.miso)) continue;
      const csg = on('spi.cs')[0];
      if (csg === undefined || (this.outLevel.get(csg) ?? 1) !== 0) continue; // not selected
      if (!this.model.modulePowered(part.id)) continue;
      const tx = this.spiTx.get(part.id) ?? { written: [], reply: null, start: 0 };
      this.spiTx.set(part.id, tx);
      const value = (k: string) => (this.model.states.get(part.id) as any)?.[k] ?? 0;
      hexToBytes(hex).forEach((w, i) => {
        const pos = tx.written.length;
        tx.written.push(w);
        if (!tx.reply) {
          const hit = (cs.sim.spiReplies ?? []).find((r) => {
            const m = r.match ? r.match.split(' ').map((h) => parseInt(h, 16)) : [];
            return m.length <= tx.written.length && m.every((x, j) => x === tx.written[j]);
          });
          if (hit) {
            const m = hit.match ? hit.match.split(' ').length : 0;
            tx.reply = packResponse(hit.bytes, value);
            tx.start = hit.at ?? m;
          }
        }
        if (tx.reply && pos >= tx.start) out[i] = tx.reply[pos - tx.start] ?? 0;
      });
    }
    return bytesToHex(out);
  }
  /** CS rising ends an SPI transaction for chips selected by that pin. */
  private spiDeselect(g: number) {
    for (const part of this.project.parts) {
      const cs = customSpec(part.type);
      const csPin = cs?.sim.kind === 'spi-device' ? cs.pins.find((p) => p.fn === 'spi.cs')?.name : undefined;
      if (csPin && this.model.gpiosOnNet(part.id, csPin).includes(g)) this.spiTx.delete(part.id);
    }
  }

  // ------------------------------------------------------------------ Wi-Fi, HTTP, time
  private wifiAvailable() {
    if (this.board?.id === 'pico' || !this.boardPartId()) return false;
    return (this.model.states.get(this.boardPartId()!)?.wifi ?? 1) > 0;
  }
  private boardPartId() {
    return this.model.boardPartId;
  }
  wifiConnect(ssid: string) {
    this.tick();
    this.wifi = { status: 1, readyAt: this.timeUs + 1_500_000, ssid };
  }
  wifiStatus(): number {
    this.tick();
    if (this.board?.id === 'rpi4') return this.wifiAvailable() ? 1010 : 201;
    if (this.wifi.status === 1 && this.timeUs >= this.wifi.readyAt) this.wifi.status = this.wifiAvailable() ? 1010 : 201;
    if (this.wifi.status === 1010 && !this.wifiAvailable()) this.wifi.status = 201;
    return this.wifi.status;
  }
  private online() {
    return this.board?.id === 'rpi4' ? this.wifiAvailable() : this.wifiStatus() === 1010;
  }
  http(method: string, url: string, body: string): [number, string] {
    this.tick();
    if (!this.online()) {
      this.warn('http-offline', 'warning', 'The program tried to use the internet before Wi-Fi was connected (or the board\'s Wi-Fi switch is off).');
      this.sleepUs(200_000);
      return [-118, ''];
    }
    this.sleepUs(350_000); // typical HTTPS round trip
    let res = this.host.httpRequest?.(method, url, body);
    if (!res || res.status < 0) {
      res = sampleResponse(url);
      if (this.host.httpRequest) this.warn('http-sample', 'info', `Couldn't reach ${new URL(url).host} from the simulator, so sample data was used instead.`);
    }
    if (this.httpLog.length < 200) this.httpLog.push(`${method} ${url} → ${res.status}`);
    this.serial(`[sim] ${method} ${url.length > 90 ? url.slice(0, 87) + '…' : url} → ${res.status}`);
    return [res.status, res.text];
  }
  ntpSync(): number {
    this.tick();
    if (!this.online()) return -1;
    this.sleepUs(80_000);
    const now = (this.host.nowEpochMs?.() ?? Date.UTC(2026, 9, 20, 10, 30)) / 1000;
    this.epochBase = now - this.timeUs / 1e6;
    return 0;
  }
  epoch(): number {
    this.tick();
    return this.epochBase + this.timeUs / 1e6;
  }

  // ------------------------------------------------------------------ frames
  maybeFrame(force = false) {
    if (!this.realtime() && !force) return;
    const now = this.host.wallNowMs();
    if (!force && now - this.lastFrameWall < (this.opts.frameMs ?? 33)) return;
    this.lastFrameWall = now;
    this.host.emit(this.frame());
  }

  /** Resolve the electrical state and build what the UI needs to draw. */
  frame(): SimFrame {
    const m = this.model;
    m.solve();
    const parts: Record<string, PartVisual> = {};
    const brightness = (ma: number) => Math.min(1, Math.sqrt(Math.max(0, ma) / 20));
    const pwmScale = (partId: string, pins: string[]) => {
      for (const pin of pins) {
        for (const g of m.gpiosReachable(partId, pin)) {
          const p = this.pwm.get(g);
          if (p && p.freq >= 60) return p.duty / 65535;
        }
      }
      return 1;
    };
    for (const part of this.project.parts) {
      const v: PartVisual = {};
      switch (part.type) {
        case 'led': {
          const ma = m.ledCurrentMa(part.id);
          v.ma = ma * pwmScale(part.id, ['A', 'C']);
          v.led = brightness(ma) * pwmScale(part.id, ['A', 'C']);
          if (ma > 30) this.warn(`led-oc-${part.id}`, 'error', `${part.ref}: ${ma.toFixed(0)} mA through the LED — too much! It needs a series resistor (220–330 Ω).`, [part.id]);
          break;
        }
        case 'rgb-led': {
          const ch = (c: string) => brightness(m.ledCurrentMa(part.id, c)) * pwmScale(part.id, [c]);
          v.rgb = [ch('R'), ch('G'), ch('B')];
          break;
        }
        case 'ssd1306':
        case 'lcd1602': {
          const d = this.devices.find((x) => x.part.id === part.id)?.dev;
          v.powered = m.modulePowered(part.id);
          if (d instanceof SSD1306Device) {
            v.oled = v.powered ? d.visibleRam() : new Array(1024).fill(0);
            v.oledOn = v.powered && d.on;
          }
          if (d instanceof Lcd1602Device) v.lcd = { chars: v.powered ? Array.from(d.characters()) : new Array(32).fill(32), backlight: !!v.powered && d.backlight };
          break;
        }
        case 'epaper29': {
          const e = this.epapers.find((x) => x.part.id === part.id)?.dev;
          v.powered = m.modulePowered(part.id);
          if (e) v.epaper = { ram: Array.from(e.shown), refreshing: e.busy() && e.refreshes > 0, refreshes: e.refreshes };
          break;
        }
        case 'neopixel-ring':
          v.pixels = this.pixels.get(part.id) ?? [];
          v.powered = m.modulePowered(part.id);
          break;
        case 'servo':
          v.angle = this.servos.get(part.id) ?? 90;
          break;
        case 'dc-motor': {
          const volts = Math.abs(m.pinVoltage(part.id, '+') - m.pinVoltage(part.id, '-'));
          v.spin = Math.min(1, Math.max(0, (volts - 1) / 4));
          break;
        }
        case 'buzzer':
          v.tone = this.tones.get(part.id) ?? 0;
          break;
        case 'relay': {
          const on = m.modulePowered(part.id) && m.pinVoltage(part.id, 'IN') - m.pinVoltage(part.id, 'GND') > 1.5;
          if (on !== this.relays.get(part.id)) {
            this.relays.set(part.id, on);
            m.setRelay(part.id, on);
          }
          v.relay = on;
          break;
        }
        default: {
          if (partDef(part.type).vmin !== undefined && partDef(part.type).category !== 'board') v.powered = m.modulePowered(part.id);
          const cs = customSpec(part.type);
          if (cs?.sim.kind === 'i2c-device' && (cs.sim.outputBits?.length || cs.sim.pwmChannels)) {
            const d = this.devices.find((x) => x.part.id === part.id && x.dev instanceof GenericI2CDevice && x.dev.addr === cs.i2cAddress)?.dev;
            if (d instanceof GenericI2CDevice) {
              v.powered = m.modulePowered(part.id);
              const pc = cs.sim.pwmChannels;
              v.inputs = Object.fromEntries([
                ...(cs.sim.outputBits ?? []).map((o) => [o.name, !!v.powered && d.bit(Number(o.reg), o.bit)] as const),
                ...(pc ? Array.from({ length: pc.count }, (_, ch) => [`CH${ch}`, !!v.powered && d.pwmDuty(Number(pc.base), ch) > 0] as const) : []),
              ]);
              v.active = Object.values(v.inputs).some(Boolean);
            }
          }
          if (cs?.sim.kind === 'shift-register' && cs.sim.shift?.type === '595') {
            v.powered = m.modulePowered(part.id);
            const st = this.shiftRegs.get(part.id);
            // outputs[] are QA…QH; the newest bit shifted in is QA.
            const outs = cs.sim.shift.outputs ?? [];
            v.inputs = Object.fromEntries(outs.map((p, i) => [p, !!v.powered && !!st?.out[i]]));
            v.active = Object.values(v.inputs).some(Boolean);
          }
          if (cs?.sim.kind === 'servo') {
            v.powered = m.modulePowered(part.id);
            if (cs.sim.servo?.continuous) {
              const sp = v.powered ? (this.servoSpeeds.get(part.id) ?? 0) : 0;
              v.spin = Math.abs(sp);
              if (sp) v.dir = sp > 0 ? 'cw' : 'ccw';
            } else v.angle = this.servos.get(part.id) ?? (cs.sim.servo?.degrees ?? 180) / 2;
          }
          if (cs?.sim.kind === 'tft-display') {
            v.powered = m.modulePowered(part.id);
            const t = this.tfts.get(part.id);
            if (t && v.powered) {
              if (t.ocrAt !== t.dev.writes) {
                t.ocrAt = t.dev.writes;
                t.lines = ocr(t.dev.width, t.dev.height, (x, y) => x >= 0 && y >= 0 && x < t.dev.width && y < t.dev.height && t.dev.lit(x, y));
              }
              const step = Math.max(1, Math.ceil(Math.max(t.dev.width, t.dev.height) / 64));
              v.tft = { w: Math.ceil(t.dev.width / step), h: Math.ceil(t.dev.height / step), thumb: t.dev.thumb(step), on: t.dev.on };
              v.pixels = t.dev.on ? v.tft.thumb : [];
              v.textLines = t.dev.on ? t.lines : [];
            } else v.pixels = [];
          }
          if (cs?.sim.kind === 'addressable-led') {
            v.powered = m.modulePowered(part.id);
            v.pixels = v.powered ? (this.pixels.get(part.id) ?? []).slice(0, (cs.sim.count ?? 1) * 3) : [];
          }
          if (cs?.sim.kind === 'segment-display' && cs.sim.protocol === 'ht16k33') {
            v.powered = m.modulePowered(part.id);
            const d = this.devices.find((x) => x.part.id === part.id && x.dev instanceof HT16K33Device)?.dev as HT16K33Device | undefined;
            v.segOn = !!v.powered && !!d?.on;
            if (cs.sim.matrix) {
              // Adafruit 8×8 backpack wiring: row y is RAM byte 2y, column x is bit (x + 7) % 8.
              const lit = (x: number, y: number) => !!v.segOn && !!d && ((d.ram[2 * y] >> ((x + 7) % 8)) & 1) === 1;
              v.pixels = v.powered ? Array.from({ length: 64 }, (_, i) => (lit(i % 8, i >> 3) ? 255 : 0)).flatMap((x) => [x, 0, 0]) : [];
              v.textLines = v.segOn ? ocr(8, 8, (x, y) => x >= 0 && y >= 0 && x < 8 && y < 8 && lit(x, y)) : [];
            } else if (cs.sim.segments === 14) v.segText = v.segOn && d ? alphaText((cs.sim.digitMap ?? []).map((i) => (d.ram[i] ?? 0) | ((d.ram[i + 1] ?? 0) << 8))) : '';
            else v.segText = v.segOn && d ? segText((cs.sim.digitMap ?? []).map((i) => d.ram[i] ?? 0)) : '';
          } else if (cs?.sim.kind === 'segment-display') {
            v.powered = m.modulePowered(part.id);
            const d = this.segDev(part)!;
            if (d instanceof TM1637Device) {
              v.segOn = !!v.powered && d.on;
              const order = cs.sim.digitMap ?? Array.from({ length: cs.sim.digits ?? 4 }, (_, i) => i);
              v.segText = v.segOn ? segText(order.map((i) => d.segs[i] ?? 0)) : '';
            } else if (cs.sim.matrix) {
              v.segOn = !!v.powered && !d.shutdown;
              const px = v.powered ? d.matrix() : [];
              const w = 8 * d.count;
              v.pixels = px.flatMap((x) => [x, 0, 0]);
              v.textLines = v.segOn ? ocr(w, 8, (x, y) => x >= 0 && y >= 0 && x < w && y < 8 && px[y * w + x] > 0) : [];
            } else {
              v.segOn = !!v.powered && !d.shutdown;
              v.segText = v.segOn ? segText(d.segments().slice(-(cs.sim.digits ?? 8))) : '';
            }
          }
          if (cs?.sim.kind === 'char-lcd') {
            const d = this.devices.find((x) => x.part.id === part.id)?.dev;
            v.powered = m.modulePowered(part.id);
            if (d instanceof Lcd1602Device) v.lcd = { chars: v.powered ? Array.from(d.characters()) : new Array(d.cols * d.rows).fill(32), backlight: !!v.powered && d.backlight, cols: d.cols };
          }
          if (cs?.sim.kind === 'oled-display') {
            const d = this.devices.find((x) => x.part.id === part.id)?.dev;
            v.powered = m.modulePowered(part.id);
            if (d instanceof SSD1306Device) {
              v.oled = v.powered ? d.visibleRam() : new Array(1024).fill(0);
              v.oledOn = v.powered && d.on;
            }
          }
          if (cs?.sim.kind === 'actuator' && (cs.sim.inputPin || cs.sim.inputPins?.length)) {
            const gnd = cs.pins.find((p) => p.role === 'gnd')?.name;
            // Some modules (e.g. KY-012 buzzers) have no supply pin: the signal itself powers them.
            const supplied = cs.pins.some((p) => p.role === 'power') ? !!v.powered : true;
            const lv = (pin: string) => m.pinVoltage(part.id, pin) - (gnd ? m.pinVoltage(part.id, gnd) : 0);
            const high = (pin: string) => supplied && (cs.sim.inputsActiveLow ? lv(pin) < 1.5 : lv(pin) > 1.5);
            const pins = [...new Set([...(cs.sim.inputPin ? [cs.sim.inputPin] : []), ...(cs.sim.inputPins ?? [])])];
            v.inputs = Object.fromEntries(pins.map((p) => [p, high(p)]));
            v.active = pins.some(high);
          }
        }
      }
      parts[part.id] = v;
    }
    const pins: SimFrame['pins'] = {};
    for (const [g, mode] of m.pinModes) {
      if (mode.kind === 'unused') continue;
      const ma = m.gpioCurrentMa(g);
      const max = this.board?.maxPinMa ?? 20;
      if (Math.abs(ma) > max) this.warn(`pin-oc-${g}`, 'error', `GPIO${g} is supplying ${Math.abs(ma).toFixed(0)} mA — the ${this.board?.short} pin limit is about ${max} mA. Add a resistor or use a transistor.`);
      pins[g] = { mode: mode.kind, level: mode.kind === 'out' ? mode.level : this.readPin(g), duty: mode.kind === 'pwm' ? mode.duty : undefined, freq: mode.kind === 'pwm' ? mode.freq : undefined, v: m.gpioVoltage(g), ma };
    }
    if (this.board?.id === 'pico' && this.outLevel.has(25)) pins[25] = { mode: 'out', level: this.outLevel.get(25)!, v: 0, ma: 0 };
    const f: SimFrame = {
      t: this.timeUs / 1000,
      status: this.status,
      parts,
      pins,
      serial: this.serialNew,
      warnings: this.warningsNew,
      error: this.error,
      nets: m.netVoltages(),
      i2c: this.i2cLog.length ? this.i2cLog.splice(0) : undefined,
    };
    if (this.scope.length) f.scope = this.scope.splice(0);
    this.serialNew = [];
    this.warningsNew = [];
    return f;
  }

  // ------------------------------------------------------------------ JS module exposed to Python
  hwModule() {
    return {
      ticks_us: () => {
        this.tick();
        return Math.floor(this.timeUs);
      },
      sleep_us: (us: number) => this.sleepUs(us),
      board: () => this.board?.id ?? 'none',
      pin_by_name: (n: string) => (n === 'LED' ? (this.board?.id === 'pico' ? 25 : 2) : this.board?.pins.find((p) => p.name === n)?.gpio ?? -1),
      pin_init: (g: number, mode: number, pull: number, value: number) => this.pinInit(g, mode, pull, value),
      pin_write: (g: number, v: number) => this.pinWrite(g, v),
      pin_read: (g: number) => this.pinRead(g),
      adc_init: (g: number) => this.adcInit(g),
      adc_read: (g: number, a: number) => this.adcRead(g, a),
      pwm: (g: number, f: number, d: number) => this.pwmSet(g, f, d),
      irq_watch: (g: number) => {
        this.irqWatch.set(g, this.readPin(g));
      },
      irq_events: () => {
        this.tick();
        if (!this.irqQueue.length) return null;
        return this.irqQueue.splice(0);
      },
      pulse_in: (g: number, l: number, t: number) => this.pulseIn(g, l, t),
      dht_read: (g: number) => this.dhtRead(g),
      ow_scan: (g: number) => this.owScan(g),
      ow_temp: (g: number, rom: string) => this.owTemp(g, rom),
      neopixel_write: (g: number, hex: string) => this.neopixelWrite(g, hex),
      i2c_default: (id: number) => this.i2cDefault(id),
      i2c_open: (sda: number, scl: number) => this.i2cOpen(sda, scl),
      i2c_write: (b: number, a: number, hex: string) => this.i2cWrite(b, a, hex),
      i2c_read: (b: number, a: number, n: number) => this.i2cRead(b, a, n),
      i2c_scan: (b: number) => this.i2cScan(b),
      mcp3008_read: (ch: number) => this.mcp3008Read(ch),
      spi_default: (id: number) => this.spiDefault(id),
      spi_open: (sck: number, mosi: number, miso: number) => this.spiOpen(sck, mosi, miso),
      spi_write: (b: number, hex: string) => this.spiWrite(b, hex),
      spi_xfer: (b: number, hex: string) => this.spiXfer(b, hex),
      uart_open: (id: number, tx: number, rx: number, baud: number) => this.uartOpen(id, tx, rx, baud),
      uart_any: (h: number) => this.uartAny(h),
      uart_read: (h: number, n: number) => this.uartRead(h, n),
      uart_readline: (h: number) => this.uartReadline(h),
      uart_write: (h: number, hex: string) => this.uartWrite(h, hex),
      wifi_connect: (ssid: string) => this.wifiConnect(ssid),
      wifi_status: () => this.wifiStatus(),
      wifi_disconnect: () => {
        this.wifi.status = 0;
      },
      wifi_available: () => this.wifiAvailable(),
      http: (method: string, url: string, body: string) => this.http(method, url, body),
      ntp_sync: () => this.ntpSync(),
      epoch: () => this.epoch(),
    };
  }

  // ------------------------------------------------------------------ running
  async run(loader: MicroPythonLoader): Promise<void> {
    this.wallStart = this.host.wallNowMs();
    this.simStart = 0;
    if (this.project.board === 'none') return this.runDiscrete();
    const isPi = this.project.board === 'rpi4';
    let stdoutBuf = '';
    const mp = await loader({
      stdout: (s) => {
        for (const line of s.split('\n')) this.serial(line);
        stdoutBuf += s;
      },
      stderr: (s) => this.serial(s),
    });
    mp.registerJsModule('_hw', this.hwModule());
    try {
      mp.FS.mkdir('/lib');
    } catch {}
    try {
      mp.FS.mkdir('/project');
    } catch {}
    const lib: Record<string, string> = isPi
      ? { '_simtime.py': SIMTIME_PY + PITIME_EXTRA_PY, 'machine.py': MACHINE_PY, 'gpiozero.py': GPIOZERO_PY, 'smbus2.py': SMBUS2_PY, 'board.py': BOARD_PY, 'adafruit_dht.py': ADAFRUIT_DHT_PY, 'neopixel.py': NEOPIXEL_PI_PY, 'requests.py': REQUESTS_PY, 'signal.py': SIGNAL_PY }
      : { 'esp32.py': ESP32_PY, '_simtime.py': SIMTIME_PY, 'machine.py': MACHINE_PY, 'dht.py': DHT_PY, 'onewire.py': ONEWIRE_PY, 'ds18x20.py': DS18X20_PY, 'neopixel.py': NEOPIXEL_MP_PY, 'network.py': NETWORK_PY, 'urequests.py': REQUESTS_PY, 'requests.py': REQUESTS_PY, 'ntptime.py': NTPTIME_PY };
    for (const [name, src] of Object.entries(lib)) mp.FS.writeFile(`/lib/${name}`, src);
    // Only the program's own Python files go onto the board (not e.g. the arduino/ C++ version).
    for (const [name, src] of Object.entries(this.project.files)) if (/^[\w.-]+\.py$/.test(name)) mp.FS.writeFile(`/project/${name}`, src);
    this.status = 'running';
    this.maybeFrame(true);
    try {
      mp.runPython(bootstrapPy(isPi ? 'pi' : 'mp'));
      const main = this.project.files['main.py'] ?? '';
      // exec main.py as a file so tracebacks name it
      mp.runPython(`__file__ = "/project/main.py"\nexec(compile(open("/project/main.py").read(), "main.py", "exec"), {"__name__": "__main__"})`);
      this.status = 'finished';
      if (main.trim()) this.serial('[program finished]');
    } catch (e: any) {
      if (e instanceof SimStop || String(e?.message ?? e).includes('SIM_STOP')) {
        this.status = 'stopped';
      } else {
        this.status = 'error';
        this.error = explainError(String(e?.message ?? e), this.project);
      }
    }
    this.maybeFrame(true);
  }

  /** Battery-powered discrete circuits: transient simulation of the whole circuit. */
  runDiscrete() {
    const c = this.model.circuit;
    this.status = 'running';
    this.model.solve();
    c.initCaps(true);
    // Fast enough to resolve the quickest RC in the circuit (audio-rate 555s need small steps).
    const rcs: number[] = [];
    for (const p of this.project.parts) if (p.type === 'capacitor' || p.type === 'electrolytic') for (const r of this.project.parts) if (r.type === 'resistor') rcs.push(Number(r.props.ohms) * Number(p.props.farads));
    const tau = rcs.length ? Math.min(...rcs.filter((x) => x > 2e-5)) : 1;
    const dt = Math.min(2e-4, Math.max(1e-5, tau / 40));
    const probeNets = this.model.nets.filter((n) => n.pins.length > 1).slice(0, 8);
    let lastScope = -1;
    // Tone detection: watch 555 outputs that drive a buzzer.
    const tonePairs = this.project.parts
      .filter((p) => p.type === 'ne555')
      .flatMap((u) => this.project.parts.filter((b) => b.type === 'buzzer' && this.model.netOf.get(`${b.id}:+`) === this.model.netOf.get(`${u.id}:OUT`)).map((b) => ({ u, b })));
    const edges: number[] = [];
    let lastHigh = false;
    try {
      for (;;) {
        this.checkStop();
        this.pollInputs();
        if (this.model.dirty) this.model.dirty = false;
        c.step(dt);
        this.timeUs += dt * 1e6;
        for (const { u, b } of tonePairs) {
          const vout = this.model.pinVoltage(u.id, 'OUT') - this.model.pinVoltage(u.id, 'GND');
          const high = vout > 3;
          if (high && !lastHigh) {
            edges.push(this.timeUs);
            if (edges.length > 8) edges.shift();
          }
          lastHigh = high;
          const recent = edges.length >= 3 && this.timeUs - edges[edges.length - 1] < 50_000;
          const f = recent ? ((edges.length - 1) * 1e6) / (edges[edges.length - 1] - edges[0]) : 0;
          // Only audible pitches count as a tone; slow blinking just clicks.
          this.tones.set(b.id, f >= 20 ? Math.round(f) : 0);
        }
        if (this.timeUs - lastScope >= (tonePairs.length ? Math.max(dt * 1e6, 40) : 5000)) {
          lastScope = this.timeUs;
          const v: Record<string, number> = {};
          for (const n of probeNets) v[n.id] = n === this.model.groundNet ? 0 : c.voltage(n.id);
          this.scope.push({ t: this.timeUs / 1000, v });
          if (this.scope.length > 2000) this.scope.splice(0, 1000);
        }
        if (this.realtime()) {
          const wallTarget = this.wallStart + this.timeUs / 1000 / this.speed;
          const wait = wallTarget - this.host.wallNowMs();
          if (wait > 2) this.host.waitUs(wait * 1000);
          this.maybeFrame();
        }
      }
    } catch (e) {
      if (!(e instanceof SimStop)) {
        this.status = 'error';
        this.error = { message: String((e as any)?.message ?? e), raw: String(e) };
      } else this.status = 'stopped';
    }
    this.maybeFrame(true);
  }
}

export function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}
export function bytesToHex(b: number[]): string {
  let s = '';
  for (const x of b) s += (x & 255).toString(16).padStart(2, '0');
  return s;
}

const HINTS: [RegExp, string][] = [
  [/ENODEV|Errno 19|Errno 121|not responding/, 'An I2C device did not answer. Check that SDA and SCL go to the right pins (and are not swapped), and that the module has power (VCC + GND).'],
  [/ETIMEDOUT|Errno 116/, 'A sensor did not answer in time. Check its data wire goes to the pin your code uses, and that it has power.'],
  [/ImportError: no module named '(\w+)'/, 'A Python module is missing. Driver files (like ssd1306.py) must be copied to the board next to main.py.'],
  [/IndentationError|unexpected indent|unindent/, 'Python uses indentation to group code. Make sure blocks line up with 4 spaces.'],
  [/SyntaxError/, 'Python could not understand this line — look for a missing colon, bracket or quote.'],
  [/NameError: name '(\w+)'/, 'You used a name that was never defined. Check the spelling, or that it was created earlier in the program.'],
  [/invalid pin|ValueError: Pin/, 'That pin number does not exist on this board, or it cannot do that job (e.g. input-only pins cannot be outputs).'],
  [/has no ADC/, 'Only some pins can read analog voltages. On the ESP32 use GPIO32–39; on the Pico use GP26–28.'],
  [/TypeError/, 'A value had the wrong type, e.g. adding text to a number. Check the values on that line.'],
  [/ZeroDivisionError/, 'Something was divided by zero — often a sensor returned 0. Guard the division with an if.'],
  [/MemoryError/, 'The board ran out of memory. Avoid building very large lists or strings in a loop.'],
];

export function explainError(raw: string, project?: Project): NonNullable<SimFrame['error']> {
  const lines = raw.trim().split('\n');
  const last = lines[lines.length - 1] ?? raw;
  let line: number | undefined;
  let file: string | undefined;
  for (const l of lines) {
    const m = /File "([^"]+)", line (\d+)/.exec(l);
    if (m && !m[1].startsWith('/lib/') && m[1] !== '<stdin>') {
      file = m[1].replace('/project/', '');
      line = Number(m[2]);
    }
  }
  const hint = HINTS.find(([re]) => re.test(raw))?.[1];
  let message = last.replace(/^\w+Error: /, (s) => s);
  if (/OSError: (19|\[Errno 19\])/.test(raw)) message = 'OSError: [Errno 19] ENODEV — no I2C device answered';
  void project;
  // Hide the simulator's own frames (bootstrap exec and hardware shims) from the traceback.
  const clean = lines.filter((l) => !/File "(<stdin>|\/lib\/)/.test(l)).join('\n');
  return { message, line, file, hint, raw: clean.trim() };
}

export { pinKey };

/** Built-in sample responses so internet projects work offline and in tests. */
export function sampleResponse(url: string): { status: number; text: string } {
  if (/open-meteo\.com/.test(url)) {
    const daily = { time: ['2026-10-20', '2026-10-21', '2026-10-22'], temperature_2m_max: [17.4, 15.1, 19.8], temperature_2m_min: [9.2, 8.7, 11.3], weather_code: [3, 61, 1], precipitation_probability_max: [20, 80, 5] };
    const hourly = { time: Array.from({ length: 24 }, (_, h) => `2026-10-20T${String(h).padStart(2, '0')}:00`), temperature_2m: Array.from({ length: 24 }, (_, h) => +(12 + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI)).toFixed(1)) };
    return {
      status: 200,
      text: JSON.stringify({
        latitude: 40.71,
        longitude: -74.01,
        timezone: 'America/New_York',
        utc_offset_seconds: -14400,
        current: { time: '2026-10-20T10:30', temperature_2m: 14.6, relative_humidity_2m: 62, apparent_temperature: 13.1, weather_code: 3, wind_speed_10m: 11.2, is_day: 1 },
        daily,
        hourly,
      }),
    };
  }
  if (/worldtimeapi|timeapi/.test(url)) return { status: 200, text: JSON.stringify({ datetime: '2026-10-20T10:30:00-04:00', unixtime: 1792506600, utc_offset: '-04:00' }) };
  return { status: 404, text: 'Not found (the simulator only has sample data for api.open-meteo.com)' };
}

/** GGA + RMC sentences for a simulated GPS fix (controls lat, lon, optional speed [knots] and alt [m]). */
export function nmeaSentences(value: (k: string) => number, tMs: number): string {
  const secs = 12 * 3600 + Math.floor(tMs / 1000);
  const hh = String(Math.floor(secs / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(secs / 60) % 60).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const time = `${hh}${mm}${ss}.00`;
  const dm = (deg: number, w: number) => {
    const a = Math.abs(deg);
    const d = Math.floor(a);
    return `${String(d).padStart(w, '0')}${((a - d) * 60).toFixed(5).padStart(8, '0')}`;
  };
  const lat = value('lat');
  const lon = value('lon');
  const la = `${dm(lat, 2)},${lat < 0 ? 'S' : 'N'}`;
  const lo = `${dm(lon, 3)},${lon < 0 ? 'W' : 'E'}`;
  const cs = (body: string) => `$${body}*${[...body].reduce((x, c) => x ^ c.charCodeAt(0), 0).toString(16).toUpperCase().padStart(2, '0')}\r\n`;
  return cs(`GPGGA,${time},${la},${lo},1,08,0.9,${value('alt').toFixed(1)},M,0.0,M,,`) + cs(`GPRMC,${time},A,${la},${lo},${value('speed').toFixed(2)},0.00,201026,,,A`);
}
