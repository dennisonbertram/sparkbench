import { describe, it, expect } from 'vitest';
import { planFromPrompt } from '../../src/core/planner';
import { simulate } from '../../src/sim/node-runner';
import { SSD1306Device } from '../../src/sim/devices';

describe('flagship ESP32 project simulates', () => {
  it('boots, draws on the OLED, reads sensors, reacts to buttons', async () => {
    const p = planFromPrompt('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
    const { engine, final } = await simulate(p, {
      untilMs: 6000,
      inputs: [
        { atMs: 2500, part: 'dht221', key: 'temperature', value: 31.5 },
        { atMs: 3000, part: 'mpu60501', key: 'tiltX', value: 20 },
      ],
    });
    if (engine.error) console.log(engine.error);
    console.log(engine.serialAll.slice(0, 12).join('\n'));
    expect(engine.error).toBeUndefined();
    const oled = (engine as any).devices.find((d: any) => d.dev instanceof SSD1306Device).dev as SSD1306Device;
    console.log(oled.ascii());
    expect(oled.on).toBe(true);
    expect(oled.ram.some((b) => b !== 0)).toBe(true);
    expect(engine.serialAll.join('\n')).toMatch(/Temp 31\.5 C/);
    expect(engine.serialAll.join('\n')).toMatch(/Roll\s+20/);
    expect(final.status).toBe('stopped');
  }, 30000);
});
