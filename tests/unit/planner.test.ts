import { describe, it, expect } from 'vitest';
import { parseIntent, editSpec, planFromPrompt, buildProject } from '../../src/core/planner';
import { BOARDS } from '../../src/core/boards';
import { buildNets } from '../../src/core/netlist';
import { simulate } from '../../src/sim/node-runner';

const kinds = (p: string) => parseIntent(p).features.map((f) => f.kind).sort();

describe('intent parsing', () => {
  it.each([
    ['ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU', 'esp32', ['button', 'button', 'dht22', 'mpu6050', 'oled']],
    ['Raspberry Pi Pico traffic light', 'pico', ['led', 'led', 'led']],
    ['raspberry pi plant monitor with soil moisture, relay pump and lcd', 'rpi4', ['lcd', 'relay', 'soil']],
    ['esp32 thermostat with thermistor, relay fan and lcd', 'esp32', ['lcd', 'ntc', 'relay']],
    ['pico with 2 imus', 'pico', ['mpu6050']],
    ['pico with two servos', 'pico', ['servo', 'servo']],
    ['555 blinker', 'none', ['astable555']],
    ['an esp32 with 4 leds and a button', 'esp32', ['button', 'led', 'led', 'led', 'led']],
  ])('%s', (prompt, board, expected) => {
    expect(parseIntent(prompt).board).toBe(board);
    expect(kinds(prompt)).toEqual(expected);
  });
});

describe('conversational edits', () => {
  const base = parseIntent('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
  it('adds a buzzer', () => {
    const r = editSpec(base, 'add a buzzer');
    expect(r.changed).toBe(true);
    expect(r.spec.features.filter((f) => f.kind === 'buzzer')).toHaveLength(1);
  });
  it('switches board keeping features', () => {
    const r = editSpec(base, 'use a Raspberry Pi Pico instead');
    expect(r.spec.board).toBe('pico');
    expect(r.spec.features).toHaveLength(base.features.length);
  });
  it('removes a part', () => {
    const r = editSpec(base, 'remove the IMU');
    expect(r.spec.features.some((f) => f.kind === 'mpu6050')).toBe(false);
  });
  it('explains when it cannot understand', () => {
    const r = editSpec(base, 'make it prettier');
    expect(r.changed).toBe(false);
    expect(r.message).toMatch(/Try/);
  });
});

describe('pin allocation is valid for every board', () => {
  const prompts = ['ESP32 with an OLED, a DHT22, a PIR, a buzzer, a servo, 3 LEDs, 2 buttons and a potentiometer', 'pico with a light sensor, a knob, soil sensor, an rgb led and a buzzer', 'raspberry pi with a knob, a light sensor, a servo, 2 buttons and a neopixel ring'];
  for (const prompt of prompts) {
    it(prompt, async () => {
      const p = planFromPrompt(prompt);
      const board = BOARDS[p.board as 'esp32'];
      const { netOf } = buildNets(p);
      const used = new Set<string>();
      for (const f of p.features ?? []) {
        for (const [sig, pin] of Object.entries(f.pins)) {
          const bp = board.pins.find((x) => x.name === pin)!;
          expect(bp, `${f.label} ${sig}`).toBeTruthy();
          if (!['sda', 'scl'].includes(sig)) {
            expect(used.has(pin), `${pin} used twice`).toBe(false);
            used.add(pin);
          }
          if (['led', 'buzzer', 'servo', 'relay', 'neopixel', 'rgb'].includes(f.kind) || sig === 'trig') expect(bp.caps).toContain('out');
          if (['pot', 'ldr', 'soil', 'ntc'].includes(f.kind) && f.mcpChannel === undefined) expect(bp.caps).toContain('adc');
        }
      }
      expect(netOf.size).toBeGreaterThan(0);
      const { engine } = await simulate(p, { untilMs: 2000 });
      expect(engine.error).toBeUndefined();
    }, 30000);
  }
});

describe('rebuild keeps manual positions', () => {
  it('keeps the x/y of parts that still exist', () => {
    const p = planFromPrompt('esp32 with an oled and a button');
    p.parts = p.parts.map((x) => (x.type === 'ssd1306' ? { ...x, x: 999, y: 777 } : x));
    const next = buildProject(editSpec(p.spec!, 'add a buzzer').spec, { previous: p });
    const oled = next.parts.find((x) => x.type === 'ssd1306')!;
    expect([oled.x, oled.y]).toEqual([999, 777]);
  });
});
