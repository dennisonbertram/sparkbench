// Signal levels of datasheet parts: an output that can rise above the board's 3.3 V (a 5 V module's push-pull or
// analog output, a UART TX, a pull-up to its own supply) is caught, and a divider on the pin brings it down.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Project } from '../../src/core/types';
import { testProject, pinNumbers } from '../../src/core/partcheck';
import { withoutCustomPart } from '../../src/core/autowire';
import { ElectricalModel } from '../../src/core/circuit';
import { runChecks } from '../../src/core/checks';
import { planBreadboard } from '../../src/core/bbplace';
import { buildBom } from '../../src/core/bom';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';

const base = (over: Partial<CustomPartSpec> & { sim: CustomPartSpec['sim'] }, pins: CustomPartSpec['pins']): CustomPartSpec => ({
  type: `custom-lvl-${Math.abs([...JSON.stringify([over, pins])].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`,
  name: 'Level test',
  mpn: 'LVL',
  category: 'sensor',
  description: 't',
  eli5: 't',
  refPrefix: 'U',
  interface: 'digital-in',
  pins: [{ name: 'VCC', role: 'power', required: true }, { name: 'GND', role: 'gnd', required: true }, ...pins],
  vmin: 4.5,
  vmax: 5.5,
  currentMa: 10,
  priceUsd: 1,
  supplierQuery: 'x',
  ...over,
});
const digital = (extra: object = {}, sim: object = {}) => base({ sim: { kind: 'digital-sensor', outputPin: 'OUT', ...sim } as any }, [{ name: 'OUT', role: 'io', required: true, ...extra }]);
const findings = (p: Project) => runChecks(p).filter((c) => /^(overvoltage|i2c-pullup-5v)/.test(c.id));
const gpioOf = (p: Project) => pinNumbers(p).OUT;

describe('signal levels of datasheet parts', () => {
  it('flags a 5 V push-pull output wired straight to a GPIO', () => {
    const { project } = testProject(digital(), 'esp32');
    const model = new ElectricalModel(project);
    model.setPartState('dut', 'active', 1);
    expect(model.gpioVoltage(gpioOf(project))).toBeGreaterThan(4.9);
    const f = findings(project);
    expect(f.map((x) => x.severity)).toEqual(['error']);
    expect(f[0].detail).toMatch(/divider/);
  });

  it('accepts an output whose level the module fixes at 3.3 V', () => {
    expect(findings(testProject(digital({ levelV: 3.3 }), 'pico').project)).toEqual([]);
  });

  it('inserts a real 10k/20k divider, follows it for the signal and keeps the pin at 3.3 V', () => {
    const { project, notes } = testProject(digital({ divider: { top: 10000, bottom: 20000 } }), 'esp32');
    const res = project.parts.filter((p) => p.type === 'resistor');
    expect(res.map((r) => [r.id, r.props.ohms])).toEqual([['dut_dt1', 10000], ['dut_db1', 20000]]);
    expect(notes.join(' ')).toMatch(/10 kΩ \/ 20 kΩ divider on OUT/);
    expect(findings(project)).toEqual([]);
    const g = gpioOf(project);
    const model = new ElectricalModel(project);
    expect(model.gpiosOnNet('dut', 'OUT')).toEqual([g]);
    model.setPartState('dut', 'active', 1);
    expect(model.gpioVoltage(g)).toBeCloseTo(5 * 20 / 30, 1);
    expect(planBreadboard(project).problems).toEqual([]);
    expect(buildBom(project).some((l) => /10 ?k/i.test(JSON.stringify(l)))).toBe(true);
    const gone = withoutCustomPart(project, project.parts.find((p) => p.id === 'dut')!.type);
    expect(gone.parts.some((p) => /^dut_d[tb]\d$/.test(p.id))).toBe(false);
  });

  it('adds no divider when the part runs from 3.3 V', () => {
    const s = digital({ divider: { top: 10000, bottom: 20000 } });
    const { project } = testProject({ ...s, vmin: 3, vmax: 5.5 }, 'pico');
    expect(project.parts.some((p) => p.type === 'resistor')).toBe(false);
    expect(findings(project)).toEqual([]);
  });

  it('flags an analog output whose range passes 3.3 V, and its divider fixes it', () => {
    const analog = (pin: object) => base({ sim: { kind: 'analog-sensor', outputPin: 'AO', min: 0, max: 5, vAtMin: 0, vAtMax: 5 } as any }, [{ name: 'AO', role: 'io', fn: 'adc', required: true, ...pin }]);
    const f = findings(testProject(analog({}), 'esp32').project);
    expect(f.map((x) => x.severity)).toEqual(['error']);
    expect(f[0].detail).toMatch(/top of its range/);
    expect(findings(testProject(analog({ divider: { top: 10000, bottom: 20000 } }), 'esp32').project)).toEqual([]);
  });

  it('flags a 5 V UART TX on the board RX unless its level is 3.3 V', () => {
    const uart = (tx: object) => base({ interface: 'uart', sim: { kind: 'uart-device', uartBaud: 9600, uartReplies: [{ match: '01', bytes: [{ const: 2, bits: 8 }] }] } as any }, [{ name: 'TX', role: 'io', fn: 'uart.tx', required: true, ...tx }, { name: 'RX', role: 'io', fn: 'uart.rx', required: true }]);
    expect(findings(testProject(uart({}), 'pico').project).map((x) => x.severity)).toEqual(['error']);
    expect(findings(testProject(uart({ levelV: 3.3 }), 'pico').project)).toEqual([]);
  });

  it('warns once about a breakout that pulls its I2C lines up to 5 V', () => {
    const s = base({ interface: 'i2c', i2cAddress: 0x40, sim: { kind: 'i2c-device', registers: { '0x00': 1 } } as any }, [
      { name: 'SDA', role: 'io', fn: 'i2c.sda', required: true, boardPullUp: 4700 },
      { name: 'SCL', role: 'io', fn: 'i2c.scl', required: true, boardPullUp: 4700 },
    ]);
    const f = findings(testProject(s, 'esp32').project);
    expect(f.map((x) => [x.severity, x.title.replace(/\(.*?\)/, '')])).toEqual([['warning', 'Level test  pulls the I2C lines up to 5.0 V']]);
  });

  it('an open-collector output is only as high as its pull-up', () => {
    const { project } = testProject(digital({}, { openDrain: true, activeHigh: false }), 'esp32');
    expect(findings(project)).toEqual([]);
    const model = new ElectricalModel(project);
    const g = gpioOf(project);
    model.setPinMode(g, { kind: 'in', pull: 'up' });
    expect(model.gpioVoltage(g)).toBeGreaterThan(3);
    model.setPartState('dut', 'active', 1);
    expect(model.gpioVoltage(g)).toBeLessThan(0.3);
  });

  it('an MQ-style load-resistor output is loaded by its divider exactly as on the board', () => {
    const spec: CustomPartSpec = JSON.parse(readFileSync('tests/fixtures/parts/gas-5v-divider.json', 'utf8'));
    const { project } = testProject(spec, 'esp32');
    const model = new ElectricalModel(project);
    model.setPartState('dut', 'value', 2.5); // Rs = RL: Thevenin RL/2 into 30k
    const rl = 1000;
    const rs = rl;
    const rload = 30000;
    const vao = (5 * (rl * rload) / (rl + rload)) / (rs + (rl * rload) / (rl + rload));
    expect(model.gpioVoltage(pinNumbers(project).AO)).toBeCloseTo((vao * 20) / 30, 3);
  });

  it('validates the new pin fields', () => {
    const bad = digital({ divider: { top: 10000, bottom: 90000 }, levelV: -1, boardPullUp: 5 });
    const errs = validateSpec(bad).join(' ');
    expect(errs).toMatch(/divider on OUT should bring 5 V down/);
    expect(errs).toMatch(/levelV on OUT/);
    expect(errs).toMatch(/boardPullUp on OUT/);
    expect(validateSpec(digital({}, { openDrain: true }))).toEqual([]);
    expect(validateSpec({ ...digital(), sim: { kind: 'analog-sensor', outputPin: 'OUT', rl: 1000, openDrain: true } as any }).join(' ')).toMatch(/openDrain is for digital-sensor/);
  });
});
