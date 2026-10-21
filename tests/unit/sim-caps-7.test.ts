// Pulse-frequency outputs (flow meters), trigger/echo rangefinders, resistive sensors and shunt references
// (load / bias resistors), and SMBus packet error checking (LC709203F).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GenericI2CDevice, crc8Smbus } from '../../src/sim/devices';
import { sensorOhms } from '../../src/core/circuit';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';
import { testProject } from '../../src/core/partcheck';
import { withoutCustomPart } from '../../src/core/autowire';
import { simulate } from '../../src/sim/node-runner';

const fixture = (f: string): CustomPartSpec => JSON.parse(readFileSync(`tests/fixtures/parts/${f}`, 'utf8'));
const run = async (f: string, code: string, untilMs: number, inputs: { atMs: number; key: string; value: number }[] = [], edit?: (p: any) => void) => {
  const { project } = testProject(fixture(f), 'esp32');
  project.files = { 'main.py': code };
  edit?.(project);
  const r = await simulate(project, { untilMs, inputs: inputs.map((i) => ({ ...i, part: 'dut' })) });
  return { out: r.engine.serialAll.join('\n'), warnings: r.engine.allWarnings.map((w) => w.text).join('\n'), error: r.engine.error?.raw ?? '', project };
};
const pin = (project: any, name: string) => {
  const w = project.wires.find((x: any) => x.a.part === 'dut' && x.a.pin === name);
  return Number(/(\d+)$/.exec(w.b.pin)?.[1] ?? NaN);
};

describe('SMBus packet error checking (LC709203F)', () => {
  it('matches the datasheet example: 16 09 17 C2 0E → 86', () => {
    expect(crc8Smbus([0x16, 0x09, 0x17, 0xc2, 0x0e])).toBe(0x86);
  });
  it('sends words low byte first with a PEC, and ignores writes whose PEC is wrong', () => {
    const d = new GenericI2CDevice('u', 0x0b, { '0x09': 0x0ec2 }, [], () => 0, [], { regWidth: 16, wordOrder: 'lsb', pec: true });
    d.write([0x09]);
    expect(d.read(3)).toEqual([0xc2, 0x0e, 0x86]);
    d.write([0x09, 0x34, 0x12, 0x00]); // bad PEC
    d.write([0x09]);
    expect(d.read(2)).toEqual([0xc2, 0x0e]);
    d.write([0x09, 0x34, 0x12, crc8Smbus([0x16, 0x09, 0x34, 0x12])]);
    d.write([0x09]);
    expect(d.read(3).slice(0, 2)).toEqual([0x34, 0x12]);
  });
});

describe('resistive sensor curves', () => {
  const spec = fixture('ldr-divider.json');
  it('ntc follows the beta equation, power follows the log-log line', () => {
    const ntc = { pin: '2', curve: 'ntc' as const, r0: 10000, beta: 3950 };
    expect(sensorOhms(spec, ntc, { value: 25 })).toBeCloseTo(10000, 3);
    expect(sensorOhms(spec, ntc, { value: 0 })).toBeCloseTo(10000 * Math.exp(3950 * (1 / 273.15 - 1 / 298.15)), 3);
    const r = spec.sim.resistive![0];
    expect(sensorOhms(spec, r, { value: 10 })).toBeCloseTo(10000, 3);
    expect(sensorOhms(spec, r, { value: 1000 })).toBeCloseTo(10000 * 100 ** -0.7, 3);
    const log = { pin: '2', curve: 'log' as const, rAtMin: 100, rAtMax: 1e6 };
    expect(sensorOhms(spec, log, { value: (1 + 10000) / 2 })).toBeCloseTo(1e4, 0);
  });
});

describe('load and bias resistors', () => {
  it('adds the load resistor to the rail the pin asks for, and removes it with the part', () => {
    const { project } = testProject(fixture('yfs201.json'), 'esp32');
    const r = project.parts.find((p) => p.id === 'dut_rl1')!;
    expect(r.props.ohms).toBe(10000);
    expect(project.wires.some((w) => w.a.part === r.id && w.b.pin === '3V3')).toBe(true);
    const gone = withoutCustomPart(project, 'custom-yfs201-test');
    expect(gone.parts.some((p) => p.id === 'dut_rl1')).toBe(false);
  });
  it('LM335: holds 10 mV/K with enough bias, and warns when the bias current is too small', async () => {
    const code = "from machine import ADC, Pin\nimport time\nadc = ADC(Pin({V}))\nadc.atten(ADC.ATTN_11DB)\ntime.sleep_ms(50)\nprint('mV=%d' % round(adc.read_u16() * 3300 / 65535))\n";
    const fill = (p: any) => (p.files['main.py'] = code.replace('{V}', String(pin(p, 'V+'))));
    const ok = await run('lm335.json', '', 500, [{ atMs: 0, key: 'value', value: 25 }], fill);
    expect(Math.abs(Number(/mV=(\d+)/.exec(ok.out)![1]) - 2982)).toBeLessThan(6);
    expect(ok.warnings).not.toMatch(/µA flows/);
    const weak = await run('lm335.json', '', 500, [{ atMs: 0, key: 'value', value: 25 }], (p) => {
      fill(p);
      p.parts.find((x: any) => x.id === 'dut_rl1').props.ohms = 1_000_000;
    });
    expect(weak.warnings).toMatch(/needs at least 400 µA/);
  });
});

describe('pulse-frequency outputs', () => {
  it('edges arrive on time: the period between interrupts is 1 / (7.5 Hz × L/min)', async () => {
    const code = (g: number) => `from machine import Pin\nimport time\nts = []\ndef cb(p):\n    ts.append(time.ticks_us())\np = Pin(${g}, Pin.IN)\np.irq(trigger=Pin.IRQ_RISING, handler=cb)\ntime.sleep(1)\nd = [ts[i + 1] - ts[i] for i in range(len(ts) - 1)]\nprint('n=%d p=%d' % (len(ts), sum(d) // len(d)))\n`;
    const r = await run('yfs201.json', '', 1500, [{ atMs: 0, key: 'value', value: 4 }], (p) => (p.files['main.py'] = code(pin(p, 'OUT'))));
    const [, n, per] = /n=(\d+) p=(\d+)/.exec(r.out)!.map(Number);
    expect(Math.abs(n - 30)).toBeLessThanOrEqual(1);
    expect(Math.abs(per - 1e6 / 30)).toBeLessThan(40);
  });
  it('stays still with no flow', async () => {
    const code = (g: number) => `from machine import Pin\nimport time\nn = [0]\ndef cb(p):\n    n[0] += 1\np = Pin(${g}, Pin.IN)\np.irq(trigger=Pin.IRQ_RISING, handler=cb)\ntime.sleep(1)\nprint('n=%d' % n[0])\n`;
    const r = await run('yfs201.json', '', 1500, [{ atMs: 0, key: 'value', value: 0 }], (p) => (p.files['main.py'] = code(pin(p, 'OUT'))));
    expect(r.out).toContain('n=0');
  });
});

describe('trigger/echo rangefinders', () => {
  const poll = (t: number, e: number) =>
    `from machine import Pin\nimport time\ntrig = Pin(${t}, Pin.OUT, value=0)\necho = Pin(${e}, Pin.IN)\ndef ping(us=10):\n    trig.value(1)\n    time.sleep_us(us)\n    trig.value(0)\n    t0 = time.ticks_us()\n    while echo.value() == 0:\n        if time.ticks_diff(time.ticks_us(), t0) > 50000:\n            return -1\n    a = time.ticks_us()\n    while echo.value() == 1:\n        pass\n    return time.ticks_diff(time.ticks_us(), a)\nprint('A=%d' % round(ping() / 58.3))\ntime.sleep_ms(100)\nprint('B=%d' % ping(20))\n`;
  it('works by polling ECHO, and ignores a trigger that is too short', async () => {
    // (each simulated hardware call costs 15 µs, so "too short" is shown with a sensor that wants 100 µs)
    const r = await run('jsn-sr04t.json', '', 800, [{ atMs: 0, key: 'value', value: 200 }], (p) => {
      p.files['main.py'] = poll(pin(p, 'TRIG'), pin(p, 'ECHO')).replace('ping(us=10)', 'ping(us=150)');
      p.customParts[0].sim.echo.triggerUs = 100;
    });
    expect(Number(/A=(\d+)/.exec(r.out)![1])).toBeGreaterThanOrEqual(199);
    expect(Number(/A=(\d+)/.exec(r.out)![1])).toBeLessThanOrEqual(201);
    expect(r.out).toContain('B=-1');
    expect(r.warnings).toMatch(/needs at least 100 µs/);
  });
  it('clamps to the blind zone, and sends the timeout pulse past the range when the sensor has one', async () => {
    const spec = fixture('jsn-sr04t.json');
    expect(validateSpec(spec)).toEqual([]);
    const code = (t: number, e: number) => `from machine import Pin, time_pulse_us\nimport time\ntrig = Pin(${t}, Pin.OUT, value=0)\necho = Pin(${e}, Pin.IN)\ntrig.value(1)\ntime.sleep_us(10)\ntrig.value(0)\nprint('t=%d' % time_pulse_us(echo, 1, 100000))\n`;
    const far = await run('jsn-sr04t.json', '', 500, [{ atMs: 0, key: 'value', value: 590 }], (p) => {
      p.customParts[0].sim.echo.beyondUs = 60000;
      p.files['main.py'] = code(pin(p, 'TRIG'), pin(p, 'ECHO'));
    });
    expect(Number(/t=(\d+)/.exec(far.out)![1])).toBeCloseTo(60000, -2);
  });
});

describe('validation', () => {
  it('explains what is missing', () => {
    const p = fixture('yfs201.json');
    expect(validateSpec({ ...p, sim: { ...p.sim, pulse: { hzPerUnit: 0 } } }).join()).toMatch(/hzPerUnit/);
    const u = fixture('jsn-sr04t.json');
    expect(validateSpec({ ...u, sim: { ...u.sim, echo: { trigPin: 'X', minCm: 5, maxCm: 2 } } }).join()).toMatch(/trigPin|minCm/);
    const l = fixture('ldr-divider.json');
    expect(validateSpec({ ...l, sim: { ...l.sim, resistive: [{ pin: '2', curve: 'ntc' }] } }).join()).toMatch(/ntc needs r0 and beta/);
    expect(validateSpec({ ...l, pins: l.pins.map((x) => (x.name === '2' ? { ...x, load: { ohms: 1, to: '3v3' as const } } : x)) }).join()).toMatch(/load on 2/);
    const c = fixture('lc709203f.json');
    expect(validateSpec({ ...c, sim: { ...c.sim, regWidth: 8 } }).join()).toMatch(/wordOrder and pec/);
  });
});
