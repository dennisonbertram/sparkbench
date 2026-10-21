// Builds an electrical model (for the MNA solver) from a project, and exposes the
// operations the simulator needs: drive/read GPIOs, LED brightness, module power, etc.
import type { Project, PartInstance, Net } from './types';
import { buildNets, pinKey, boardPart } from './netlist';
import { partDef } from './parts';
import { customSpec } from './customParts';
import { boardFor, type BoardDef } from './boards';
import { Circuit, Resistor, VSource, Diode, NPN, Timer555, Switch, Capacitor, ShuntRef, LED_PARAMS, type Element } from './mna';

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

type Spec = NonNullable<ReturnType<typeof customSpec>>;
/** A control's range: the main "value" slider uses sim.min/max, the others their own min/max. */
function controlRange(cs: Spec, key: string): [number, number] {
  if (key === 'value') return [cs.sim.min ?? 0, cs.sim.max ?? 100];
  const c = cs.sim.controls?.find((x) => x.key === key);
  return c ? [c.min, c.max] : [0, 1];
}
/** Linear map of a control over its range onto a…b. */
function controlLerp(cs: Spec, key: string, st: Record<string, number>, a: number, b: number): number {
  const [lo, hi] = controlRange(cs, key);
  const f = hi === lo ? 0 : Math.max(0, Math.min(1, ((st[key] ?? lo) - lo) / (hi - lo)));
  return a + f * (b - a);
}
/** A resistive sensor element's resistance for the current control value (see CustomSim.resistive). */
export function sensorOhms(cs: Spec, r: NonNullable<Spec['sim']['resistive']>[number], st: Record<string, number>): number {
  const key = r.control ?? 'value';
  const x = st[key] ?? controlRange(cs, key)[0];
  let ohms: number;
  if (r.curve === 'linear') ohms = controlLerp(cs, key, st, r.rAtMin!, r.rAtMax!);
  else if (r.curve === 'log') ohms = Math.exp(controlLerp(cs, key, st, Math.log(r.rAtMin!), Math.log(r.rAtMax!)));
  else if (r.curve === 'ntc') ohms = r.r0! * Math.exp(r.beta! * (1 / (x + 273.15) - 1 / ((r.t0 ?? 25) + 273.15)));
  else ohms = r.rRef! * Math.pow(Math.max(x, r.ref! * 1e-6) / r.ref!, r.exponent!);
  return Math.max(0.1, Math.min(1e10, ohms));
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
      case 'dc-supply':
        els.v = c.add(new VSource(id, n('+'), n('-'), Number(part.props.volts ?? 12), 0.05));
        this.supplies.push({ name: part.id, src: els.v as VSource, volts: Number(part.props.volts ?? 12) });
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
        // Self-powered analog sources (passive dividers, piezo discs) drive their output with no supply pin.
        if (kp?.sim.kind === 'analog-sensor' && kp.sim.selfPowered && kp.sim.outputPin) {
          const gp = kp.pins.find((p) => p.role === 'gnd')?.name;
          els.out = c.add(new VSource(`${id}.out`, n(kp.sim.outputPin), gp ? n(gp) : 0, 0, 1000));
        }
        // Resistive sensors and shunt references are passive: they need no supply pin of their own.
        if (kp?.sim.kind === 'resistive-sensor') {
          const gp = kp.pins.find((p) => p.role === 'gnd')?.name;
          const lo = (to?: string) => (to ? n(to) : gp ? n(gp) : -1);
          (kp.sim.resistive ?? []).forEach((r, i) => (els[`res:${i}`] = c.add(new Resistor(`${id}.r${i}`, n(r.pin), lo(r.to), 10000))));
          if (kp.sim.shunt) els.shunt = c.add(new ShuntRef(`${id}.shunt`, n(kp.sim.shunt.pin), lo(kp.sim.shunt.to), kp.sim.shunt.vAtMin, kp.sim.shunt.rz ?? 1));
        }
        // A passive pulse contact (reed switch): closes to GND at the pulse rate, no supply of its own.
        if (kp?.sim.kind === 'pulse-sensor' && kp.sim.selfPowered && kp.sim.outputPin) {
          const gp = kp.pins.find((p) => p.role === 'gnd')?.name;
          els.out = c.add(new Switch(`${id}.out`, n(kp.sim.outputPin), gp ? n(gp) : -1, false));
        }
        if (kp?.sim.kind === 'keypad-matrix')
          (kp.sim.rowPins ?? []).forEach((r, ri) => (kp.sim.colPins ?? []).forEach((col, ci) => (els[`key:${ri}:${ci}`] = c.add(new Switch(`${id}.k${ri}.${ci}`, n(r), n(col), false)))));
        // Modules: model their supply draw as a resistor, plus signal-pin behaviour.
        // The logic supply; a part powered only from a separate supply (a motor driver's VM) draws from that.
        const power = def.pins.filter((p) => p.role === 'power' && p.name !== 'VREF');
        const logic = power.find((p) => !p.supply) ?? power[0];
        const vccPin = logic?.name;
        const gndPin = def.pins.find((p) => p.role === 'gnd')?.name;
        if (vccPin && gndPin && def.category !== 'board') {
          const vnom = logic.supply ? logic.supply.vmin : def.vmin && def.vmin > 4 ? 5 : 3.3;
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
          if (cs?.sim.kind === 'digital-sensor' && cs.sim.outputPin) els.out = cs.sim.openDrain ? c.add(new Switch(`${id}.out`, n(cs.sim.outputPin), g, false)) : c.add(new VSource(`${id}.out`, n(cs.sim.outputPin), g, 0, 200));
          if (cs?.sim.kind === 'ir-receiver' && cs.sim.outputPin) els.out = c.add(new VSource(`${id}.out`, n(cs.sim.outputPin), g, 0, 200));
          // Pulse outputs: push-pull, or open collector (pulls low only; the high comes from a pull-up).
          if (cs?.sim.kind === 'pulse-sensor' && cs.sim.outputPin) els.out = cs.sim.pulse?.openDrain ? c.add(new Switch(`${id}.out`, n(cs.sim.outputPin), g, false)) : c.add(new VSource(`${id}.out`, n(cs.sim.outputPin), g, 0, 200));
          if (cs?.sim.kind === 'ultrasonic' && cs.sim.outputPin && cs.sim.echo) {
            els.out = c.add(new VSource(`${id}.echo`, n(cs.sim.outputPin), g, 0, 200));
            els.trig = c.add(new Resistor(`${id}.trig`, n(cs.sim.echo.trigPin), g, 10000));
          }
          if (cs?.sim.kind === 'actuator') for (const pin of new Set([...(cs.sim.inputPin ? [cs.sim.inputPin] : []), ...(cs.sim.inputPins ?? [])])) els[`in:${pin}`] = c.add(new Resistor(`${id}.in.${pin}`, n(pin), cs.sim.inputsActiveLow ? n(vccPin) : g, cs.sim.inputsActiveLow ? 1000 : 10000));
          for (const d of cs?.sim.digitalOutputs ?? []) els[`dout:${d.pin}`] = c.add(new VSource(`${id}.dout.${d.pin}`, n(d.pin), g, 0, 200));
          for (const pin of cs?.sim.dac?.pins ?? []) els[`dac:${pin}`] = c.add(new VSource(`${id}.dac.${pin}`, n(pin), g, 0, 1));
          // MAX98357A SD_MODE: the chip's 100 kΩ pull-down, and the pull-up some breakouts fit to the supply.
          if (cs?.sim.kind === 'i2s-amp' && cs.sim.i2sAmp?.sdPin) {
            els.sdpd = c.add(new Resistor(`${id}.sdpd`, n(cs.sim.i2sAmp.sdPin), g, 100000));
            if (cs.sim.i2sAmp.sdPullUpOhms) els.sdpu = c.add(new Resistor(`${id}.sdpu`, n(cs.sim.i2sAmp.sdPin), n(vccPin), cs.sim.i2sAmp.sdPullUpOhms));
          }
          if (cs?.sim.kind === 'segment-display' && cs.sim.protocol === 'tm1638') els.tmdio = c.add(new Switch(`${id}.tmdio`, n('DIO'), g, false));
          // Serial lines the module drives (a UART TX idles high; SPI MISO is high-impedance until selected) and the
          // pull-ups a breakout carries to its own supply.
          for (const p of cs?.pins ?? []) {
            if (p.fn === 'uart.tx') els[`tx:${p.name}`] = c.add(new VSource(`${id}.tx.${p.name}`, n(p.name), g, 0, 200));
            if (p.fn === 'spi.miso') els[`miso:${p.name}`] = c.add(new VSource(`${id}.miso.${p.name}`, n(p.name), g, 0, 1e9));
            if (p.boardPullUp) els[`bpu:${p.name}`] = c.add(new Resistor(`${id}.bpu.${p.name}`, n(vccPin), n(p.name), p.boardPullUp));
          }
          if (cs?.sim.kind === 'shift-register' && cs.sim.shift?.type === '165' && cs.sim.shift.serialOut) els.shout = c.add(new VSource(`${id}.shout`, n(cs.sim.shift.serialOut), g, 0, 200));
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
          for (const d of cs.sim.digitalOutputs) (els[`dout:${d.pin}`] as VSource).volts = on && (st[d.control] > 0) === (d.activeHigh ?? true) ? Math.min(vcc0, cs.pins.find((p) => p.name === d.pin)?.levelV ?? vcc0) : 0;
        }
        for (const p of cs.pins) {
          const miso = els[`miso:${p.name}`] as VSource | undefined;
          if (miso) {
            miso.volts = 0;
            miso.rs = 1e9; // high-impedance (the simulator answers SPI reads itself)
          }
          if (p.fn !== 'uart.tx' || !els[`tx:${p.name}`]) continue;
          const vcc0 = this.moduleSupply(partId);
          (els[`tx:${p.name}`] as VSource).volts = vcc0 >= (cs.vmin ?? 2.7) * 0.85 ? Math.min(vcc0, p.levelV ?? vcc0) : 0;
        }
        if (cs.sim.dac) {
          // DAC outputs: VDD × code/4096, or the internal 2.048 V reference × gain (never above VDD); off when powered down.
          const vdd = this.moduleSupply(partId);
          const on = vdd >= (cs.vmin ?? 2.7) * 0.85;
          for (const pin of cs.sim.dac.pins) {
            const k = (x: string) => Number(st[`dac:${pin}:${x}`] ?? 0);
            const f = k('code') / 4096;
            const v = k('vref') ? Math.min(vdd, 2.048 * (k('gain') || 1) * f) : vdd * f;
            (els[`dac:${pin}`] as VSource).volts = on && !k('pd') ? v : 0;
          }
        }
        if (cs.sim.kind === 'resistive-sensor') {
          (cs.sim.resistive ?? []).forEach((r, i) => ((els[`res:${i}`] as Resistor).ohms = sensorOhms(cs, r, st)));
          const sh = cs.sim.shunt;
          if (sh) (els.shunt as ShuntRef).vz = controlLerp(cs, sh.control ?? 'value', st, sh.vAtMin, sh.vAtMax);
          break;
        }
        if (!els.out) break;
        const s = cs.sim;
        const vcc = s.selfPowered ? Infinity : this.moduleSupply(partId);
        const powered = s.selfPowered || vcc >= (cs.vmin ?? 2.7) * 0.85;
        if (s.kind === 'analog-sensor' && !s.wave) {
          const lo = s.min ?? 0;
          const hi = s.max ?? 100;
          const f = hi === lo ? 0 : (st.value - lo) / (hi - lo);
          const v = (s.vAtMin ?? 0) + f * ((s.vAtMax ?? vcc) - (s.vAtMin ?? 0));
          const out = els.out as VSource;
          out.volts = powered ? Math.max(0, Math.min(vcc, v)) : 0;
          out.rs = s.rl ? Math.max(1, s.rl * (1 - Math.min(1, Math.max(0, out.volts / (vcc || 1))))) : (s.outputOhms ?? 1000);
          for (const o of s.analogOutputs ?? []) {
            const c = s.controls?.find((x) => x.key === o.control);
            const f2 = c && c.max !== c.min ? ((st[o.control] ?? c.default ?? c.min) - c.min) / (c.max - c.min) : 0;
            (els[`out:${o.pin}`] as VSource).volts = powered ? Math.max(0, Math.min(vcc, o.vAtMin + f2 * (o.vAtMax - o.vAtMin))) : 0;
          }
        } else if (s.kind === 'digital-sensor') {
          const high = (st.active > 0) === (s.activeHigh ?? true);
          if (s.openDrain) (els.out as Switch).set(powered && !high);
          else (els.out as VSource).volts = powered && high ? Math.min(vcc, cs.pins.find((p) => p.name === s.outputPin)?.levelV ?? vcc) : 0;
        } else if (s.kind === 'pulse-sensor') {
          // The simulator steps pulseLevel through the square wave; an open-collector output only pulls low.
          const high = !powered || st.pulseLevel > 0;
          if (s.pulse?.openDrain) (els.out as Switch).set(!high);
          else {
            const out = els.out as VSource;
            out.volts = powered && high ? vcc : 0;
            out.rs = st.pulseHiZ ? 1e9 : 200; // output disabled (OE): high impedance
          }
        } else if (s.kind === 'ultrasonic') {
          (els.out as VSource).volts = powered && st.echoLevel > 0 ? vcc : 0;
        } else if (s.kind === 'ir-receiver') {
          // Demodulated output: idles high, low during each burst of the remote's carrier (the simulator sets irLevel).
          (els.out as VSource).volts = powered && st.irLevel !== 0 ? vcc : 0;
        }
        break;
      }
      case 'soil': {
        const vcc = this.moduleSupply(partId);
        (els.out as VSource).volts = vcc > 2.5 ? Math.max(0, 2.8 - 1.6 * (st.moisture / 100)) * Math.min(1, vcc / 3.3) : 0;
        break;
      }
    }
    if (this.worstCase.has(partId)) this.applyWorstCase(partId, els);
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

  /** Parts whose outputs are held at the highest level they can reach (for the signal-level check). */
  private worstCase = new Set<string>();
  /** Run fn with every output of these datasheet parts at its highest level: analog outputs at the top of their range,
   * digital and serial outputs high, open-collector outputs released, SPI MISO driven. */
  withOutputsHigh<T>(partIds: string[], fn: () => T): T {
    for (const id of partIds) this.worstCase.add(id);
    for (const id of partIds) this.applyState(id);
    this.dirty = true;
    try {
      return fn();
    } finally {
      for (const id of partIds) this.worstCase.delete(id);
      for (const id of partIds) this.applyState(id);
      this.dirty = true;
    }
  }
  private applyWorstCase(partId: string, els: Record<string, Element>) {
    const cs = customSpec(this.project.parts.find((p) => p.id === partId)?.type ?? '');
    if (!cs) return;
    const s = cs.sim;
    const vcc = this.moduleSupply(partId);
    const powered = s.selfPowered || vcc >= (cs.vmin ?? 2.7) * 0.85;
    const clamp = (v: number) => (s.selfPowered ? Math.max(0, v) : Math.max(0, Math.min(vcc, v)));
    for (const [key, el] of Object.entries(els)) {
      if (el instanceof Switch && key === 'out') el.set(false); // open collector released: the pull-up wins
      if (!(el instanceof VSource)) continue;
      const pin = key.includes(':') ? key.slice(key.indexOf(':') + 1) : undefined;
      const level = pin ? (cs.pins.find((p) => p.name === pin)?.levelV ?? vcc) : vcc;
      if (key === 'out' && s.kind === 'analog-sensor') el.volts = powered ? clamp(Math.max(s.vAtMin ?? 0, s.vAtMax ?? vcc)) : 0;
      else if (key.startsWith('out:')) {
        const o = s.analogOutputs?.find((x) => x.pin === pin);
        el.volts = powered && o ? clamp(Math.max(o.vAtMin, o.vAtMax)) : 0;
      } else if (key === 'out' || key === 'shout' || key === 'hxout' || key.startsWith('dout:') || key.startsWith('dac:') || key.startsWith('tx:')) {
        const lv = key === 'out' && s.outputPin ? (cs.pins.find((p) => p.name === s.outputPin)?.levelV ?? vcc) : level;
        el.volts = powered ? Math.min(vcc, lv) : 0;
      } else if (key.startsWith('miso:')) {
        el.volts = powered ? Math.min(vcc, level) : 0;
        el.rs = 200;
      }
    }
  }
  /** Drive a module output pin (echo, etc.). */
  setModuleOutput(partId: string, el: string, volts: number) {
    const e = this.partEls.get(partId)?.[el] as VSource | undefined;
    if (e && e.volts !== volts) {
      e.volts = volts;
      this.dirty = true;
    }
  }

  /** Open-drain outputs driven by a simulated chip (e.g. a TM1638 sending key data on DIO): closed pulls the pin to GND. */
  setModuleSwitch(partId: string, el: string, closed: boolean) {
    const e = this.partEls.get(partId)?.[el] as Switch | undefined;
    if (e && e.closed !== closed) {
      e.set(closed);
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
  /** Supply voltage seen by a module (VCC − GND): its logic supply, or (with no logic pin) its external supply. */
  moduleSupply(partId: string, pin?: string): number {
    const part = this.project.parts.find((p) => p.id === partId);
    if (!part) return 0;
    const def = partDef(part.type);
    const power = def.pins.filter((p) => p.role === 'power');
    const vccPin = pin ?? (power.find((p) => !p.supply) ?? power[0])?.name;
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
    if (customSpec(part.type)?.sim.selfPowered) return true;
    this.solve();
    // Pins fed from a separate supply (a motor driver's VMOT) must be within their own range too;
    // below it the chip's under-voltage lockout keeps it off.
    const ext = def.pins.filter((p) => p.role === 'power' && p.supply);
    if (ext.some((p) => this.moduleSupply(partId, p.name) < p.supply!.vmin * 0.95)) return false;
    if (ext.length && ext.length === def.pins.filter((p) => p.role === 'power').length) return true;
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
    const direct = this.netGpios(net);
    if (direct.length) return direct;
    // A 5 V output that reaches its pin through a resistor divider (top resistor to the pin, bottom to GND) is still
    // that pin's signal.
    const out: number[] = [];
    for (const r of net.pins) {
      const res = this.project.parts.find((p) => p.id === r.part && p.type === 'resistor');
      if (!res) continue;
      const other = this.netOf.get(pinKey({ part: res.id, pin: r.pin === '1' ? '2' : '1' }));
      if (!other || other === net || other === this.groundNet) continue;
      const toGround = other.pins.some((q) => {
        if (q.part === res.id) return false;
        const rb = this.project.parts.find((p) => p.id === q.part && p.type === 'resistor');
        return !!rb && this.netOf.get(pinKey({ part: rb.id, pin: q.pin === '1' ? '2' : '1' })) === this.groundNet;
      });
      if (toGround) out.push(...this.netGpios(other));
    }
    return out;
  }
  private netGpios(net: Net): number[] {
    const out: number[] = [];
    for (const r of net.pins) {
      if (r.part !== this.boardPartId) continue;
      const bp = this.board!.pins.find((p) => p.name === r.pin);
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
