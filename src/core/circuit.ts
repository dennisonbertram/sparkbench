// Builds an electrical model (for the MNA solver) from a project, and exposes the
// operations the simulator needs: drive/read GPIOs, LED brightness, module power, etc.
import type { Project, PartInstance, Net } from './types';
import { buildNets, pinKey, boardPart } from './netlist';
import { partDef } from './parts';
import { customSpec } from './customParts';
import { boardFor, type BoardDef } from './boards';
import { Circuit, Resistor, VSource, Diode, NPN, Timer555, Switch, Capacitor, LED_PARAMS, type Element } from './mna';

export type PinMode = { kind: 'out'; level: number } | { kind: 'in'; pull: 'up' | 'down' | 'none' } | { kind: 'pwm'; duty: number; freq: number } | { kind: 'analog' } | { kind: 'unused' };

export interface PartState {
  [key: string]: number;
}

/** Module load / supply nominal currents in mA when powered. */
const MODULE_LOAD_MA: Record<string, number> = {
  ssd1306: 20,
  lcd1602: 30,
  dht22: 1.5,
  mpu6050: 4,
  hcsr04: 15,
  pir: 0.1,
  soil: 5,
  'neopixel-ring': 20,
  servo: 10,
  relay: 70,
  mcp3008: 0.5,
  epaper29: 8,
};
/** Modules with on-board I2C pull-ups (4.7 kΩ to their VCC). */
const I2C_PULLUPS = new Set(['ssd1306', 'lcd1602', 'mpu6050']);

class GpioDriver extends VSource {
  constructor(name: string, node: number, gnd: number) {
    super(name, node, gnd, 0, 1e9);
  }
}

export function ldrOhms(lux: number): number {
  return Math.min(1e6, Math.max(100, 10000 * Math.pow(Math.max(lux, 0.01) / 10, -0.7)));
}
export function ntcOhms(tempC: number): number {
  const B = 3950;
  return 10000 * Math.exp(B * (1 / (tempC + 273.15) - 1 / 298.15));
}

export class ElectricalModel {
  circuit = new Circuit();
  nets: Net[];
  netOf: Map<string, Net>;
  board?: BoardDef;
  boardPartId?: string;
  groundNet?: Net;
  pinModes = new Map<number, PinMode>(); // gpio -> mode
  private gpioDrivers = new Map<number, GpioDriver>();
  private gpioNode = new Map<number, number>();
  private partEls = new Map<string, Record<string, Element>>();
  states = new Map<string, PartState>();
  dirty = true;
  hasDynamics = false;
  supplies: { name: string; src: VSource; volts: number }[] = [];

  constructor(public project: Project) {
    const { nets, netOf } = buildNets(project);
    this.nets = nets;
    this.netOf = netOf;
    this.board = boardFor(project.board);
    const bp = boardPart(project);
    this.boardPartId = bp?.id;
    this.groundNet = this.findGround();
    this.build();
  }

  private findGround(): Net | undefined {
    if (this.board && this.boardPartId) {
      const n = this.netOf.get(pinKey({ part: this.boardPartId, pin: this.board.gnd }));
      if (n) return n;
    }
    const bat = this.project.parts.find((p) => p.type === 'battery-9v');
    if (bat) return this.netOf.get(pinKey({ part: bat.id, pin: '-' }));
    for (const net of this.nets) {
      for (const r of net.pins) {
        const part = this.project.parts.find((p) => p.id === r.part);
        if (part && partDef(part.type).pins.find((x) => x.name === r.pin)?.role === 'gnd' && net.pins.length > 1) return net;
      }
    }
    return undefined;
  }

  nodeOf(part: string, pin: string): number {
    const net = this.netOf.get(pinKey({ part, pin }));
    if (!net) return this.circuit.node(`float_${part}_${pin}`);
    if (net === this.groundNet) return -1;
    return this.circuit.node(net.id);
  }

  private build() {
    const c = this.circuit;
    const gnd = -1;
    if (this.board && this.boardPartId) {
      const bid = this.boardPartId;
      const supplies: [string, number][] = [[this.board.supply3v3, 3.3], [this.board.supply5v, 5.0]];
      for (const [pin, volts] of supplies) {
        const node = this.nodeOf(bid, pin);
        const src = c.add(new VSource(`supply_${pin}`, node, gnd, volts, 0.05));
        this.supplies.push({ name: pin, src, volts });
      }
      for (const bpin of this.board.pins) {
        if (bpin.gpio === undefined) continue;
        const node = this.nodeOf(bid, bpin.name);
        this.gpioNode.set(bpin.gpio, node);
        const drv = c.add(new GpioDriver(`gpio${bpin.gpio}`, node, gnd));
        this.gpioDrivers.set(bpin.gpio, drv);
        this.pinModes.set(bpin.gpio, { kind: 'unused' });
      }
    }
    for (const part of this.project.parts) this.buildPart(part);
  }

  private buildPart(part: PartInstance) {
    const c = this.circuit;
    const n = (pin: string) => this.nodeOf(part.id, pin);
    const els: Record<string, Element> = {};
    const st: PartState = {};
    const def = partDef(part.type);
    for (const ctl of def.controls ?? []) st[ctl.key] = ctl.default;
    this.states.set(part.id, st);
    const id = part.id;
    switch (part.type) {
      case 'resistor':
        els.r = c.add(new Resistor(id, n('1'), n('2'), Number(part.props.ohms ?? 220)));
        break;
      case 'led': {
        const pr = LED_PARAMS[part.props.color ?? 'red'] ?? LED_PARAMS.red;
        els.d = c.add(new Diode(id, n('A'), n('C'), pr.is, pr.n));
        break;
      }
      case 'rgb-led':
        for (const ch of ['R', 'G', 'B'] as const) {
          const pr = LED_PARAMS[ch === 'R' ? 'red' : ch === 'G' ? 'green' : 'blue'];
          els[ch] = c.add(new Diode(`${id}.${ch}`, n(ch), n('COM'), pr.is, pr.n));
        }
        break;
      case 'diode':
        els.d = c.add(new Diode(id, n('A'), n('K'), 2.52e-9, 1.75));
        break;
      case 'pushbutton':
        els.sw = c.add(new Switch(id, n('1'), n('2'), false));
        break;
      case 'slide-switch':
        els.a = c.add(new Switch(`${id}.a`, n('2'), n('1'), true));
        els.b = c.add(new Switch(`${id}.b`, n('2'), n('3'), false));
        break;
      case 'potentiometer': {
        const R = Number(part.props.ohms ?? 10000);
        els.top = c.add(new Resistor(`${id}.top`, n('VCC'), n('SIG'), R / 2));
        els.bot = c.add(new Resistor(`${id}.bot`, n('SIG'), n('GND'), R / 2));
        break;
      }
      case 'ldr':
        els.r = c.add(new Resistor(id, n('1'), n('2'), ldrOhms(st.lux)));
        break;
      case 'ntc':
        els.r = c.add(new Resistor(id, n('1'), n('2'), ntcOhms(st.temperature)));
        break;
      case 'capacitor':
      case 'electrolytic': {
        const [a, b] = part.type === 'capacitor' ? ['1', '2'] : ['+', '-'];
        els.c = c.add(new Capacitor(id, n(a), n(b), Number(part.props.farads ?? 1e-6)));
        this.hasDynamics = true;
        break;
      }
      case 'npn':
        els.q = c.add(new NPN(id, n('C'), n('B'), n('E')));
        break;
      case 'ne555':
        els.u = c.add(new Timer555(id, ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC'].map(n)));
        this.hasDynamics = true;
        break;
      case 'battery-9v':
        els.v = c.add(new VSource(id, n('+'), n('-'), Number(part.props.volts ?? 9), 1));
        this.supplies.push({ name: part.id, src: els.v as VSource, volts: Number(part.props.volts ?? 9) });
        break;
      case 'buzzer':
        els.r = c.add(new Resistor(id, n('+'), n('-'), 10000));
        break;
      case 'dc-motor':
        els.r = c.add(new Resistor(id, n('+'), n('-'), 27));
        break;
      default: {
        // Passive key matrices (no supply): each key joins its row and column.
        const kp = customSpec(part.type);
        if (kp?.sim.kind === 'keypad-matrix')
          (kp.sim.rowPins ?? []).forEach((r, ri) => (kp.sim.colPins ?? []).forEach((col, ci) => (els[`key:${ri}:${ci}`] = c.add(new Switch(`${id}.k${ri}.${ci}`, n(r), n(col), false)))));
        // Modules: model their supply draw as a resistor, plus signal-pin behaviour.
        const vccPin = def.pins.find((p) => p.role === 'power' && p.name !== 'VREF')?.name;
        const gndPin = def.pins.find((p) => p.role === 'gnd')?.name;
        if (vccPin && gndPin && def.category !== 'board') {
          const vnom = def.vmin && def.vmin > 4 ? 5 : 3.3;
          const ma = MODULE_LOAD_MA[part.type] ?? 5;
          els.load = c.add(new Resistor(`${id}.load`, n(vccPin), n(gndPin), vnom / (ma / 1000)));
          if (I2C_PULLUPS.has(part.type)) {
            els.pu_sda = c.add(new Resistor(`${id}.pu_sda`, n(vccPin), n('SDA'), 4700));
            els.pu_scl = c.add(new Resistor(`${id}.pu_scl`, n(vccPin), n('SCL'), 4700));
          }
          const g = n(gndPin);
          if (part.type === 'pir') els.out = c.add(new VSource(`${id}.out`, n('OUT'), g, 0, 200));
          if (part.type === 'hcsr04') {
            els.echo = c.add(new VSource(`${id}.echo`, n('ECHO'), g, 0, 200));
            els.trig = c.add(new Resistor(`${id}.trig`, n('TRIG'), g, 10000));
          }
          if (part.type === 'soil') els.out = c.add(new VSource(`${id}.out`, n('AOUT'), g, 0, 10000));
          if (part.type === 'dht22') els.pu = c.add(new Resistor(`${id}.pu`, n(vccPin), n('DATA'), 10000));
          if (part.type === 'relay') {
            els.in = c.add(new Resistor(`${id}.in`, n('IN'), g, 3300));
            els.no = c.add(new Switch(`${id}.no`, n('COM'), n('NO'), false));
            els.nc = c.add(new Switch(`${id}.nc`, n('COM'), n('NC'), true));
          }
          const cs = customSpec(part.type);
          if (cs?.sim.kind === 'analog-sensor' && cs.sim.outputPin) els.out = c.add(new VSource(`${id}.out`, n(cs.sim.outputPin), g, 0, 1000));
          for (const o of cs?.sim.kind === 'analog-sensor' ? (cs.sim.analogOutputs ?? []) : []) els[`out:${o.pin}`] = c.add(new VSource(`${id}.out.${o.pin}`, n(o.pin), g, 0, 1000));
          if (cs?.sim.kind === 'digital-sensor' && cs.sim.outputPin) els.out = c.add(new VSource(`${id}.out`, n(cs.sim.outputPin), g, 0, 200));
          if (cs?.sim.kind === 'actuator') for (const pin of new Set([...(cs.sim.inputPin ? [cs.sim.inputPin] : []), ...(cs.sim.inputPins ?? [])])) els[`in:${pin}`] = c.add(new Resistor(`${id}.in.${pin}`, n(pin), g, 10000));
          for (const d of cs?.sim.digitalOutputs ?? []) els[`dout:${d.pin}`] = c.add(new VSource(`${id}.dout.${d.pin}`, n(d.pin), g, 0, 200));
          if (cs?.sim.kind === 'hx711' && cs.sim.outputPin && cs.sim.clockPin) {
            els.hxout = c.add(new VSource(`${id}.hxout`, n(cs.sim.outputPin), g, 0, 200));
            els.hxclk = c.add(new Resistor(`${id}.hxclk`, n(cs.sim.clockPin), g, 50000));
          }
          if (part.type === 'epaper29') els.busy = c.add(new VSource(`${id}.busy`, n('BUSY'), g, 0, 200));
          if (part.type === 'level-shifter') {
            // Each channel has a 10 kΩ pull-up on both sides; the MOSFET only conducts when a side is pulled low.
            els.pl1 = c.add(new Resistor(`${id}.pl1`, n('LV'), n('LV1'), 10000));
            els.pl2 = c.add(new Resistor(`${id}.pl2`, n('LV'), n('LV2'), 10000));
            els.ph1 = c.add(new Resistor(`${id}.ph1`, n('HV'), n('HV1'), 10000));
            els.ph2 = c.add(new Resistor(`${id}.ph2`, n('HV'), n('HV2'), 10000));
          }
          if (part.type === 'servo') els.sig = c.add(new Resistor(`${id}.sig`, n('PWM'), g, 20000));
          if (part.type === 'mcp3008') {
            // VREF draws a tiny current; analog inputs are high impedance.
            els.vref = c.add(new Resistor(`${id}.vref`, n('VREF'), n('AGND'), 100000));
          }
        }
      }
    }
    this.partEls.set(id, els);
  }

  // ------------------------------------------------------------------ state updates
  setPartState(partId: string, key: string, value: number) {
    const st = this.states.get(partId);
    if (!st || st[key] === value) return;
    st[key] = value;
    this.applyState(partId);
    this.dirty = true;
  }

  private applyState(partId: string) {
    const part = this.project.parts.find((p) => p.id === partId);
    const els = this.partEls.get(partId);
    const st = this.states.get(partId);
    if (!part || !els || !st) return;
    switch (part.type) {
      case 'pushbutton':
        (els.sw as Switch).set(st.pressed > 0);
        break;
      case 'slide-switch':
        (els.a as Switch).set(!(st.position > 0));
        (els.b as Switch).set(st.position > 0);
        break;
      case 'potentiometer': {
        const R = Number(part.props.ohms ?? 10000);
        const pos = Math.min(1, Math.max(0, st.position / 100));
        (els.top as Resistor).ohms = Math.max(1, R * (1 - pos));
        (els.bot as Resistor).ohms = Math.max(1, R * pos);
        break;
      }
      case 'ldr':
        (els.r as Resistor).ohms = ldrOhms(st.lux);
        break;
      case 'ntc':
        (els.r as Resistor).ohms = ntcOhms(st.temperature);
        break;
      case 'pir':
        (els.out as VSource).volts = st.motion > 0 ? 3.3 : 0;
        break;
      default: {
        // Datasheet-defined sensors: map the slider / toggle to an output voltage.
        const cs = customSpec(part.type);
        if (!cs) break;
        if (cs.sim.kind === 'keypad-matrix') {
          const ncol = cs.sim.colPins?.length ?? 1;
          const k = Math.round(st.value ?? 0) - 1;
          (cs.sim.rowPins ?? []).forEach((_, ri) => (cs.sim.colPins ?? []).forEach((__, ci) => (els[`key:${ri}:${ci}`] as Switch).set(k === ri * ncol + ci)));
          break;
        }
        if (cs.sim.digitalOutputs?.length) {
          const vcc0 = this.moduleSupply(partId);
          const on = vcc0 >= (cs.vmin ?? 2.7) * 0.85;
          for (const d of cs.sim.digitalOutputs) (els[`dout:${d.pin}`] as VSource).volts = on && (st[d.control] > 0) === (d.activeHigh ?? true) ? vcc0 : 0;
        }
        if (!els.out) break;
        const vcc = this.moduleSupply(partId);
        const powered = vcc >= (cs.vmin ?? 2.7) * 0.85;
        const s = cs.sim;
        if (s.kind === 'analog-sensor') {
          const lo = s.min ?? 0;
          const hi = s.max ?? 100;
          const f = hi === lo ? 0 : (st.value - lo) / (hi - lo);
          const v = (s.vAtMin ?? 0) + f * ((s.vAtMax ?? vcc) - (s.vAtMin ?? 0));
          (els.out as VSource).volts = powered ? Math.max(0, Math.min(vcc, v)) : 0;
          for (const o of s.analogOutputs ?? []) {
            const c = s.controls?.find((x) => x.key === o.control);
            const f2 = c && c.max !== c.min ? ((st[o.control] ?? c.default ?? c.min) - c.min) / (c.max - c.min) : 0;
            (els[`out:${o.pin}`] as VSource).volts = powered ? Math.max(0, Math.min(vcc, o.vAtMin + f2 * (o.vAtMax - o.vAtMin))) : 0;
          }
        } else if (s.kind === 'digital-sensor') {
          const high = (st.active > 0) === (s.activeHigh ?? true);
          (els.out as VSource).volts = powered && high ? vcc : 0;
        }
        break;
      }
      case 'soil': {
        const vcc = this.moduleSupply(partId);
        (els.out as VSource).volts = vcc > 2.5 ? Math.max(0, 2.8 - 1.6 * (st.moisture / 100)) * Math.min(1, vcc / 3.3) : 0;
        break;
      }
    }
  }

  setPinMode(gpio: number, mode: PinMode) {
    const drv = this.gpioDrivers.get(gpio);
    if (!drv) return;
    this.pinModes.set(gpio, mode);
    const vdd = this.board?.logicV ?? 3.3;
    switch (mode.kind) {
      case 'out':
        drv.volts = mode.level ? vdd : 0;
        drv.rs = 30;
        break;
      case 'pwm':
        drv.volts = mode.duty > 0 ? vdd : 0;
        drv.rs = 30;
        break;
      case 'in':
        drv.volts = mode.pull === 'up' ? vdd : 0;
        drv.rs = mode.pull === 'none' ? 1e9 : 45000;
        break;
      default:
        drv.volts = 0;
        drv.rs = 1e9;
    }
    this.dirty = true;
  }

  /** Drive a module output pin (echo, etc.). */
  setModuleOutput(partId: string, el: string, volts: number) {
    const e = this.partEls.get(partId)?.[el] as VSource | undefined;
    if (e && e.volts !== volts) {
      e.volts = volts;
      this.dirty = true;
    }
  }

  setRelay(partId: string, on: boolean) {
    const els = this.partEls.get(partId);
    if (!els) return;
    (els.no as Switch).set(on);
    (els.nc as Switch).set(!on);
    this.dirty = true;
  }

  solve() {
    if (!this.dirty) return;
    // Two passes so module outputs that depend on supply voltage settle.
    this.circuit.dc();
    for (const part of this.project.parts) if (part.type === 'soil' || customSpec(part.type)) this.applyState(part.id);
    this.circuit.dc();
    this.dirty = false;
  }

  // ------------------------------------------------------------------ reads
  nodeVoltage(node: number): number {
    this.solve();
    return node < 0 ? 0 : this.circuit.x[node] ?? 0;
  }
  pinVoltage(partId: string, pin: string): number {
    return this.nodeVoltage(this.nodeOf(partId, pin));
  }
  gpioVoltage(gpio: number): number {
    const node = this.gpioNode.get(gpio);
    return node === undefined ? 0 : this.nodeVoltage(node);
  }
  readDigital(gpio: number): number {
    const vdd = this.board?.logicV ?? 3.3;
    return this.gpioVoltage(gpio) > vdd / 2 ? 1 : 0;
  }
  /** Current flowing out of a GPIO pin (mA, positive = sourcing). */
  gpioCurrentMa(gpio: number): number {
    this.solve();
    const d = this.gpioDrivers.get(gpio);
    if (!d || d.rs > 1e6) return 0;
    return d.current(this.circuit.x) * 1000;
  }
  supplyCurrentMa(): { name: string; ma: number; volts: number }[] {
    this.solve();
    return this.supplies.map((s) => ({ name: s.name, volts: s.volts, ma: s.src.current(this.circuit.x) * 1000 }));
  }
  /** Supply voltage seen by a module (VCC − GND). */
  moduleSupply(partId: string): number {
    const part = this.project.parts.find((p) => p.id === partId);
    if (!part) return 0;
    const def = partDef(part.type);
    const vccPin = def.pins.find((p) => p.role === 'power')?.name;
    const gndPin = def.pins.find((p) => p.role === 'gnd')?.name;
    if (!vccPin || !gndPin) return 0;
    if (this.dirty) {
      // avoid recursion through applyState → moduleSupply → solve → applyState
      this.circuit.dc();
    }
    const x = this.circuit.x;
    const vn = this.nodeOf(partId, vccPin);
    const gn = this.nodeOf(partId, gndPin);
    return (vn < 0 ? 0 : x[vn] ?? 0) - (gn < 0 ? 0 : x[gn] ?? 0);
  }
  modulePowered(partId: string): boolean {
    const part = this.project.parts.find((p) => p.id === partId);
    if (!part) return false;
    const def = partDef(part.type);
    this.solve();
    const v = this.moduleSupply(partId);
    return v >= (def.vmin ?? 2.7) * 0.85;
  }
  /** LED current in mA (each colour channel for RGB). */
  ledCurrentMa(partId: string, ch = 'd'): number {
    this.solve();
    const el = this.partEls.get(partId)?.[ch] as Diode | undefined;
    return el ? Math.max(0, el.current(this.circuit.x) * 1000) : 0;
  }
  elementCurrentMa(partId: string, el: string): number {
    this.solve();
    const e = this.partEls.get(partId)?.[el];
    return e?.current ? e.current(this.circuit.x) * 1000 : 0;
  }
  netVoltages(): Record<string, number> {
    this.solve();
    const out: Record<string, number> = {};
    for (const net of this.nets) {
      if (net.pins.length < 2) continue;
      out[net.id] = net === this.groundNet ? 0 : this.circuit.voltage(net.id);
    }
    return out;
  }
  partElements(partId: string) {
    return this.partEls.get(partId) ?? {};
  }

  // ------------------------------------------------------------------ topology helpers
  /** GPIO numbers on the same net as a part pin. */
  gpiosOnNet(partId: string, pin: string): number[] {
    const net = this.netOf.get(pinKey({ part: partId, pin }));
    if (!net || !this.board || !this.boardPartId) return [];
    const out: number[] = [];
    for (const r of net.pins) {
      if (r.part !== this.boardPartId) continue;
      const bp = this.board.pins.find((p) => p.name === r.pin);
      if (bp?.gpio !== undefined) out.push(bp.gpio);
    }
    return out;
  }
  /**
   * GPIOs reachable from a part pin directly or through series resistors (≤ maxOhms),
   * e.g. a NeoPixel data line through a 330 Ω resistor or an LED through its resistor.
   */
  gpiosReachable(partId: string, pin: string, maxOhms = 2200, viaParts: string[] = ['resistor']): number[] {
    const seen = new Set<string>();
    const out = new Set<number>();
    const queue: Net[] = [];
    const start = this.netOf.get(pinKey({ part: partId, pin }));
    if (!start) return [];
    queue.push(start);
    seen.add(start.id);
    while (queue.length) {
      const net = queue.shift()!;
      for (const r of net.pins) {
        if (r.part === this.boardPartId && this.board) {
          const bp = this.board.pins.find((p) => p.name === r.pin);
          if (bp?.gpio !== undefined) out.add(bp.gpio);
          continue;
        }
        if (r.part === partId) continue;
        const part = this.project.parts.find((p) => p.id === r.part);
        if (!part || !viaParts.includes(part.type)) continue;
        if (part.type === 'resistor' && Number(part.props.ohms) > maxOhms) continue;
        const def = partDef(part.type);
        // A level shifter passes a signal only between matching channels (LV1 ↔ HV1).
        const shifterMate = part.type === 'level-shifter' ? r.pin.replace(/^LV/, 'X').replace(/^HV/, 'LV').replace(/^X/, 'HV') : undefined;
        for (const other of def.pins) {
          if (other.name === r.pin) continue;
          if (shifterMate !== undefined && other.name !== shifterMate) continue;
          const on = this.netOf.get(pinKey({ part: part.id, pin: other.name }));
          if (on && !seen.has(on.id) && on !== this.groundNet) {
            seen.add(on.id);
            queue.push(on);
          }
        }
      }
    }
    return [...out];
  }
}
