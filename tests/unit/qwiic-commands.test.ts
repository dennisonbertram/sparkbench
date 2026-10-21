// Command-driven I2C firmware (SparkFun Qwiic relay boards) and event FIFOs (Qwiic Keypad), checked against the
// behaviour of the vendors' ATtiny firmware.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GenericI2CDevice } from '../../src/sim/devices';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';

const fixture = (f: string): CustomPartSpec => JSON.parse(readFileSync(`tests/fixtures/parts/${f}`, 'utf8'));
const device = (spec: CustomPartSpec, value: (k: string) => number = () => 0, nowMs = () => 0) =>
  new GenericI2CDevice('u', spec.i2cAddress!, spec.sim.registers ?? {}, [], value, [], { commands: spec.sim.commands, writable: spec.sim.writable, eventFifo: spec.sim.eventFifo, nowMs });

describe('Qwiic Quad Relay firmware commands', () => {
  const quad = fixture('qwiic-quad-relay.json');
  it('toggles a relay per command byte and reads 0x0F / 0x00 status', () => {
    const d = device(quad);
    d.write([0x02]);
    d.write([0x06]);
    expect(d.read(1)).toEqual([0x0f]);
    d.write([0x02]);
    d.write([0x06]);
    expect(d.read(1)).toEqual([0x00]);
  });
  it('cascades status reads to relay 4, then serves from relay 1 (COMMAND = 0x05)', () => {
    const d = device(quad);
    d.write([0x01, 0x03]); // several commands in one write, as receiveEvent loops over them
    d.write([0x06]);
    expect(d.read(4)).toEqual([0x00, 0x0f, 0x00, 0xff]);
    expect(d.read(4)).toEqual([0x0f, 0x00, 0x0f, 0x00]);
  });
  it('returns 0xFF after a command with nothing to report', () => {
    const d = device(quad);
    d.write([0x01]);
    expect(d.read(2)).toEqual([0xff, 0xff]);
  });
  it('all on / all off / toggle all', () => {
    const d = device(quad);
    d.write([0x01, 0x0c]);
    d.write([0x05]);
    expect(d.read(4)).toEqual([0x00, 0x0f, 0x0f, 0x0f]);
    d.write([0x0a, 0x05]);
    expect(d.read(4)).toEqual([0, 0, 0, 0]);
    expect(d.bit(0x07, 0)).toBe(false);
    d.write([0x0b]);
    expect(d.bit(0x07, 0)).toBe(true);
  });
});

describe('Qwiic Dual SSR slow-PWM values', () => {
  const dual = fixture('qwiic-dual-ssr.json');
  it('stores the data byte and reads it back; a bare PWM command keeps the value', () => {
    const d = device(dual);
    d.write([0x11, 90]);
    d.write([0x11]);
    expect(d.read(1)).toEqual([90]);
    d.write([0x10]);
    expect(d.read(3)).toEqual([0, 90, 0]);
  });
});

describe('Qwiic Keypad event FIFO', () => {
  const kp = fixture('qwiic-keypad.json');
  const run = () => {
    let key = 0;
    let t = 0;
    const d = device(kp, (k) => (k === 'key' ? key : 0), () => t);
    const press = (k: number, at: number) => {
      t = at;
      key = k;
      d.controlChanged('key', k);
      key = 0;
      d.controlChanged('key', 0);
    };
    const pop = () => {
      d.write([0x06, 0x01]);
      d.write([0x03]);
      return d.read(3);
    };
    return { d, press, pop, setT: (v: number) => (t = v) };
  };
  it('pops events oldest first with ms since the press; 0 when empty', () => {
    const k = run();
    k.press(1, 100); // '1'
    k.press(10, 200); // '*'
    k.setT(1500);
    expect(k.pop()).toEqual([49, (1400 >> 8) & 0xff, 1400 & 0xff]);
    expect(k.pop()).toEqual([42, (1300 >> 8) & 0xff, 1300 & 0xff]);
    expect(k.pop()).toEqual([0, 0, 0]);
  });
  it('only pops when asked: reads without UPDATE_FIFO keep the last event', () => {
    const k = run();
    k.press(5, 0);
    expect(k.pop()[0]).toBe(53);
    k.press(6, 0);
    k.d.write([0x03]);
    expect(k.d.read(1)).toEqual([53]);
  });
  it('holds 14 events (15-slot ring) and drops the oldest when full', () => {
    const k = run();
    for (let i = 0; i < 16; i++) k.press((i % 9) + 1, i);
    const got: number[] = [];
    for (let i = 0; i < 16; i++) got.push(k.pop()[0]);
    expect(got.filter(Boolean)).toHaveLength(14);
    expect(got[0]).toBe(49 + 2); // presses 0 and 1 were overwritten
  });
  it('protection map: only UPDATE_FIFO bit 0 and the address register can be written', () => {
    const k = run();
    k.d.write([0x00, 0x12, 0x34]);
    k.d.write([0x00]);
    expect(k.d.read(3)).toEqual([0x4b, 1, 0]);
    k.d.write([0x06, 0xfe]);
    k.d.write([0x06]);
    expect(k.d.read(1)).toEqual([0]);
  });
});

describe('validation', () => {
  it('fixtures are valid and bad shapes are rejected', () => {
    for (const f of ['qwiic-quad-relay.json', 'qwiic-dual-ssr.json', 'qwiic-keypad.json']) expect(validateSpec(fixture(f))).toEqual([]);
    const bad = fixture('qwiic-quad-relay.json');
    bad.sim.commands = [{ code: 1, actions: [{ reg: '0x05', op: 'set', value: 'data' }] }, { code: 1 }];
    bad.sim.pointerless = true;
    const errs = validateSpec(bad).join(' | ');
    expect(errs).toMatch(/unique byte/);
    expect(errs).toMatch(/'data' on a set for a command with data/);
    expect(errs).toMatch(/no register pointer/);
    const kp = fixture('qwiic-keypad.json');
    kp.sim.eventFifo!.sources = [{ control: 'nope', code: 1 }];
    expect(validateSpec(kp).join(' ')).toMatch(/not a control/);
  });
});
