// Datasheet-defined parts: registry, auto-wiring, simulation and survival across re-plans.
import { describe, it, expect } from 'vitest';
import { registerCustomPart, type CustomPartSpec } from '../../src/core/customParts';
import { autoWirePart } from '../../src/core/autowire';
import { planFromPrompt, buildProject, editSpec } from '../../src/core/planner';
import { annotate, buildNets } from '../../src/core/netlist';
import { runChecks } from '../../src/core/checks';
import { exportKicadSchematic } from '../../src/core/kicad';
import { renderSchematicSvg } from '../../src/core/schematic';
import { buildBom } from '../../src/core/bom';
import { buildGuide } from '../../src/core/docs';
import { simulate } from '../../src/sim/node-runner';
import type { Project } from '../../src/core/types';

const TMP36: CustomPartSpec = {
  type: 'custom-tmp36', name: 'TMP36 analog temperature sensor', mpn: 'TMP36', category: 'sensor', description: 'Analog temperature sensor, 10 mV/°C.', eli5: 'A tiny thermometer.', refPrefix: 'U', interface: 'analog',
  pins: [{ name: '+Vs', role: 'power', required: true }, { name: 'VOUT', role: 'io', fn: 'adc', required: true }, { name: 'GND', role: 'gnd', required: true }],
  vmin: 2.7, vmax: 5.5, currentMa: 0.05, priceUsd: 1.5, supplierQuery: 'TMP36', sim: { kind: 'analog-sensor', outputPin: 'VOUT', quantity: 'Temperature', unit: '°C', min: -40, max: 125, default: 25, vAtMin: 0.1, vAtMax: 1.75 },
};
const TMP102: CustomPartSpec = {
  type: 'custom-tmp102', name: 'TMP102 digital temperature sensor', mpn: 'TMP102', category: 'sensor', description: 'I2C temperature sensor.', eli5: 'A thermometer on I2C.', refPrefix: 'U', interface: 'i2c',
  pins: [{ name: 'VCC', role: 'power', required: true }, { name: 'GND', role: 'gnd', required: true }, { name: 'SDA', role: 'io', fn: 'i2c.sda', required: true }, { name: 'SCL', role: 'io', fn: 'i2c.scl', required: true }, { name: 'ALERT', role: 'io', fn: 'irq', required: false }],
  vmin: 1.4, vmax: 3.6, currentMa: 0.01, i2cAddress: 0x48, priceUsd: 5, supplierQuery: 'TMP102 breakout',
  sim: { kind: 'i2c-device', quantity: 'Temperature', unit: '°C', min: -40, max: 125, default: 21.5, registers: { '0x01': 0x60 }, measure: { reg: '0x00', bytes: 2, scale: 0.0625, shift: 4, signed: true } },
};

function withPart(p: Project, spec: CustomPartSpec): Project {
  registerCustomPart(spec);
  const id = spec.type.replace(/[^a-z0-9]/g, '') + '1';
  const q = annotate({ ...p, customParts: [...(p.customParts ?? []), spec], parts: [...p.parts, { id, type: spec.type, props: {}, x: 900, y: 40 }] });
  return autoWirePart(q, id).project;
}

describe('datasheet-defined parts', () => {
  it('auto-wires an analog sensor to an ADC pin and simulates its voltage', async () => {
    let p = withPart(planFromPrompt('esp32 with an oled'), TMP36);
    const part = p.parts.find((x) => x.type === 'custom-tmp36')!;
    const adc = p.wires.find((w) => w.a.part === part.id && w.a.pin === 'VOUT')!.b.pin;
    expect(['D34', 'D35', 'VP', 'VN', 'D32', 'D33']).toContain(adc);
    expect(runChecks(p).filter((c) => c.severity === 'error')).toEqual([]);
    const gpio = { D34: 34, D35: 35, VP: 36, VN: 39, D32: 32, D33: 33 }[adc as 'D34'];
    p = { ...p, files: { ...p.files, 'main.py': `from machine import ADC, Pin\nimport time\na = ADC(Pin(${gpio}))\na.atten(ADC.ATTN_11DB)\nwhile True:\n    v = a.read_u16() / 65535 * 3.3\n    print("T=%.1f" % ((v - 0.5) * 100))\n    time.sleep_ms(200)\n` } };
    const { engine } = await simulate(p, { untilMs: 1500, inputs: [{ atMs: 500, part: part.id, key: 'value', value: 60 }] });
    expect(engine.error).toBeUndefined();
    const last = engine.serialAll.filter((l) => l.startsWith('T=')).pop()!;
    expect(Number(last.slice(2))).toBeGreaterThan(55);
    expect(Number(last.slice(2))).toBeLessThan(65);
  }, 30000);

  it('an I2C part answers at its address with the measured value', async () => {
    let p = withPart(planFromPrompt('esp32 with a button'), TMP102);
    p = { ...p, files: { ...p.files, 'main.py': `from machine import I2C, Pin\nimport time\ni2c = I2C(0, scl=Pin(22), sda=Pin(21))\nprint("scan", i2c.scan())\nwhile True:\n    d = i2c.readfrom_mem(0x48, 0, 2)\n    raw = ((d[0] << 8) | d[1]) >> 4\n    if raw & 0x800: raw -= 4096\n    print("T=%.2f" % (raw * 0.0625))\n    time.sleep_ms(200)\n` } };
    const part = p.parts.find((x) => x.type === 'custom-tmp102')!;
    const { engine } = await simulate(p, { untilMs: 1500, inputs: [{ atMs: 500, part: part.id, key: 'value', value: -10.5 }] });
    expect(engine.error).toBeUndefined();
    expect(engine.serialAll.join('\n')).toMatch(/scan \[72\]/);
    expect(engine.serialAll.filter((l) => l.startsWith('T=')).pop()).toBe('T=-10.50');
  }, 30000);

  it('flows into schematic, KiCad, BOM and guide, and survives a copilot edit', () => {
    const p = withPart(planFromPrompt('esp32 with an oled'), TMP102);
    expect(renderSchematicSvg(p)).toContain('TMP102');
    expect(exportKicadSchematic(p)).toContain('TMP102');
    expect(buildBom(p).some((l: any) => /TMP102/.test(l.name + l.mpn))).toBe(true);
    expect(buildGuide(p)).toContain('TMP102');
    const next = buildProject(editSpec(p.spec!, 'add a buzzer').spec, { previous: p });
    const kept = next.parts.find((x) => x.type === 'custom-tmp102');
    expect(kept).toBeTruthy();
    const { netOf } = buildNets(next);
    expect(netOf.get(`${kept!.id}:SDA`)!.pins.some((r) => r.pin === 'D21')).toBe(true);
    const buzzerPin = next.features!.find((f) => f.kind === 'buzzer')!.pins.pin;
    expect(p.wires.some((w) => w.b.pin === buzzerPin)).toBe(false); // didn't steal a pin the custom part uses
  });
});
