// Arduino Nicla Vision / Nicla Voice board definitions. Every expected value here is quoted with its
// source in docs/boards/nicla.md (datasheets, full pinouts, ArduinoCore-mbed variants, MicroPython pins.csv).
import { describe, it, expect } from 'vitest';
import { BOARDS, boardPin, fwPin } from '../../src/core/boards';
import { parseIntent, planFromPrompt } from '../../src/core/planner';
import { runChecks } from '../../src/core/checks';
import { simulate } from '../../src/sim/node-runner';

const vision = BOARDS['nicla-vision'];
const voice = BOARDS['nicla-voice'];

describe.each([vision, voice])('$name pin table', (b) => {
  it('has unique pin names, gpio numbers and header pads', () => {
    const names = b.pins.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    const gpios = b.pins.filter((p) => p.gpio !== undefined).map((p) => p.gpio);
    expect(new Set(gpios).size).toBe(gpios.length);
    const pads = b.pins.map((p) => p.header);
    expect(new Set(pads).size).toBe(pads.length);
  });
  it('has J1 pads 1–8 and J2 pads 1–9 (17 header positions)', () => {
    const pads = b.pins.map((p) => p.header!).sort();
    expect(pads).toEqual([...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `J1-${n}`), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `J2-${n}`)].sort());
  });
  it('shares the J2 power pads: GND J2-6, VDDIO_EXT J2-7 (3.3 V), NC J2-8, VIN J2-9 (input)', () => {
    expect(boardPin(b, 'GND')).toMatchObject({ header: 'J2-6', role: 'gnd' });
    expect(boardPin(b, 'VDDIO_EXT')).toMatchObject({ header: 'J2-7', role: 'power', voltage: 3.3 });
    expect(boardPin(b, b.pins.find((p) => p.header === 'J2-8')!.name)?.role).toBe('other');
    expect(boardPin(b, 'VIN')).toMatchObject({ header: 'J2-9', role: 'power' });
    expect(b.supply5vInput).toBe(true);
  });
  it('has I2C on J2-1 (SDA) / J2-2 (SCL) and SPI on J1-3..J1-6, all existing pins', () => {
    expect(boardPin(b, b.i2c.sda)?.header).toBe('J2-1');
    expect(boardPin(b, b.i2c.scl)?.header).toBe('J2-2');
    expect([b.spi!.cs, b.spi!.mosi, b.spi!.miso, b.spi!.sck].map((n) => boardPin(b, n)?.header)).toEqual(['J1-3', 'J1-4', 'J1-5', 'J1-6']);
    for (const n of [b.supply3v3, b.supply5v, b.gnd]) expect(boardPin(b, n)).toBeDefined();
  });
  it('is 3.3 V logic with low-power pins and a 12-bit ADC', () => {
    expect(b.logicV).toBe(3.3);
    expect(b.maxPinMa).toBeLessThan(2);
    expect(b.adcBits).toBe(12);
    for (const p of b.pins.filter((x) => x.caps?.includes('adc'))) expect(p.caution).toMatch(/1\.8 V/);
  });
});

describe('Nicla Vision MCU mapping (variant.cpp / full pinout)', () => {
  const stm = (pin: string) => (pin.charCodeAt(1) - 65) * 16 + Number(pin.slice(2));
  it.each([
    ['D0', 'PG12', 'J1-1'], ['A2', 'PF3', 'J1-2'], ['CS', 'PE11', 'J1-3'], ['COPI', 'PE14', 'J1-4'], ['CIPO', 'PE13', 'J1-5'], ['SCLK', 'PE12', 'J1-6'], ['A1', 'PF13', 'J1-7'], ['A0', 'PC4', 'J1-8'],
    ['SDA', 'PB9', 'J2-1'], ['SCL', 'PB8', 'J2-2'], ['D1', 'PA9', 'J2-3'], ['D2', 'PA10', 'J2-4'], ['D3', 'PG1', 'J2-5'],
  ])('%s is %s on %s', (name, mcu, pad) => {
    const p = boardPin(vision, name)!;
    expect(p.header).toBe(pad);
    expect(p.gpio).toBe(stm(mcu));
    expect(p.alt).toContain(mcu);
  });
  it('only claims PWM where the user manual lists a TIMx_CHy (not PG12, PG1 or the CH3N-only PE12)', () => {
    const pwm = vision.pins.filter((p) => p.caps?.includes('pwm')).map((p) => p.name).sort();
    expect(pwm).toEqual(['CIPO', 'COPI', 'CS', 'D1', 'D2', 'SCL', 'SDA']);
  });
  it('names pins the way the OpenMV MicroPython firmware does', () => {
    expect(fwPin(vision, boardPin(vision, 'D0')!.gpio!)).toBe('"D0"');
    expect(fwPin(vision, boardPin(vision, 'SCLK')!.gpio!)).toBe('"PE12"');
    expect(vision.i2c.id).toBe(1);
    expect(vision.spi!.id).toBe(4);
  });
});

describe('Nicla Voice MCU mapping (NICLA variant.cpp / full pinout)', () => {
  it.each([
    ['LPIO0', 24, '5', 'J1-1'], ['CS', 29, '6', 'J1-3'], ['COPI', 27, '8', 'J1-4'], ['CIPO', 28, '7', 'J1-5'], ['SCLK', 11, '9', 'J1-6'], ['ADC2', 30, 'A1', 'J1-7'], ['ADC1', 2, 'A0', 'J1-8'],
    ['SDA', 22, '4', 'J2-1'], ['SCL', 23, '3', 'J2-2'], ['LPIO1', 20, '2', 'J2-3'], ['LPIO2', 9, '1', 'J2-4'], ['LPIO3', 10, '0', 'J2-5'],
  ])('%s is P0_%s, Arduino pin %s, on %s', (name, p0, arduino, pad) => {
    expect(boardPin(voice, name)).toMatchObject({ gpio: p0, fw: arduino, header: pad });
  });
  it('J1-2 is not connected', () => expect(voice.pins.find((p) => p.header === 'J1-2')?.role).toBe('other'));
  it('is programmed as an Arduino sketch', () => expect(voice.language).toBe('arduino'));
});

describe('planning on Nicla boards', () => {
  it('detects the boards by name', () => {
    expect(parseIntent('Arduino Nicla Vision with an LED').board).toBe('nicla-vision');
    expect(parseIntent('nicla voice with a button').board).toBe('nicla-voice');
  });
  it('drives LEDs through an NPN transistor and powers them from VDDIO_EXT', () => {
    const p = planFromPrompt('Nicla Vision with an LED and a button');
    expect(p.parts.some((x) => x.type === 'npn')).toBe(true);
    expect(p.wires.some((w) => [w.a, w.b].some((r) => r.pin === 'VDDIO_EXT'))).toBe(true);
    expect(p.wires.some((w) => [w.a, w.b].some((r) => r.pin === 'VIN'))).toBe(false);
    expect(runChecks(p).filter((c) => c.severity === 'error')).toEqual([]);
  });
  it('refuses parts that need 5 V or that the header cannot drive safely', () => {
    expect(() => planFromPrompt('Nicla Vision with a servo')).toThrow(/5 V/);
    expect(() => planFromPrompt('Nicla Vision with a potentiometer')).toThrow(/1\.8 V/);
    expect(() => planFromPrompt('Nicla Voice with an OLED')).toThrow(/Arduino sketch/);
  });
  it('writes MicroPython with OpenMV pin names for the Nicla Vision', () => {
    const p = planFromPrompt('Nicla Vision with an OLED, an LED and a button');
    const main = p.files['main.py'];
    expect(main).toMatch(/Pin\("D\d"/);
    expect(main).toContain('i2c = I2C(1, freq=400000)');
    expect(main).not.toMatch(/Pin\(\d+/);
  });
  it('writes an Arduino sketch (no Python) for the Nicla Voice', () => {
    const p = planFromPrompt('Nicla Voice with an LED, a button and a potentiometer');
    expect(Object.keys(p.files)).toEqual(['sketch.ino']);
    const ino = p.files['sketch.ino'];
    expect(ino).toContain('#include "Nicla_System.h"');
    expect(ino).toContain('nicla::begin();');
    expect(ino).toMatch(/const int KNOB_PIN = A0;/);
    expect(ino).toMatch(/void setup\(\)[\s\S]*void loop\(\)/);
  });
});

describe('simulating Nicla boards', () => {
  it('runs the Nicla Vision MicroPython program with its pin names', async () => {
    const p = planFromPrompt('Nicla Vision with an LED and a button');
    const { engine } = await simulate(p, { untilMs: 500 });
    expect(engine.error).toBeUndefined();
    expect(engine.serialAll.join('\n')).toContain('starting');
  }, 30000);
  it('does not pretend to run the Nicla Voice sketch', async () => {
    const p = planFromPrompt('Nicla Voice with an LED and a button');
    const { engine } = await simulate(p, { untilMs: 500 });
    expect(engine.error).toBeUndefined();
    expect(engine.serialAll.join('\n')).toMatch(/needs the firmware emulator \(coming\)/);
  }, 30000);
});
