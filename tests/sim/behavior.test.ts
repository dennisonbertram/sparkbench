// Each example project must do what its gallery card promises, in simulation.
import { describe, it, expect } from 'vitest';
import { buildExample } from '../../src/core/examples';
import { simulate, type ScriptedInput } from '../../src/sim/node-runner';
import type { Project } from '../../src/core/types';

const idOf = (p: Project, type: string, n = 0) => p.parts.filter((x) => x.type === type)[n].id;
const at = (snaps: { atMs: number; frame: any }[], ms: number) => snaps.find((s) => s.atMs === ms)!.frame;

async function run(id: string, untilMs: number, inputs: (p: Project) => ScriptedInput[], frames: number[]) {
  const p = buildExample(id);
  const r = await simulate(p, { untilMs, inputs: inputs(p), onFrameAt: frames });
  expect(r.engine.error).toBeUndefined();
  return { p, ...r };
}

describe('example behaviour', () => {
  it('traffic light cycles red → green → amber', async () => {
    const { p, snapshots } = await run('pico-traffic-light', 10500, () => [], [1000, 4500, 6000, 9500]);
    const leds = p.parts.filter((x) => x.type === 'led');
    const lit = (ms: number) => leds.filter((l) => (at(snapshots, ms).parts[l.id].led ?? 0) > 0.2).map((l) => l.props.color);
    expect(lit(1000)).toEqual(['red']);
    expect(lit(4500)).toEqual(['yellow']);
    expect(lit(6000)).toEqual(['green']);
    expect(lit(9500)).toEqual(['yellow']);
  });

  it('parking sensor beeps when close and lights the LED under 20 cm', async () => {
    const { p, snapshots, engine } = await run(
      'esp32-parking-sensor',
      4000,
      (p) => [{ atMs: 1500, part: idOf(p, 'hcsr04'), key: 'distance', value: 12 }],
      [1000, 3000],
    );
    const led = idOf(p, 'led');
    expect(at(snapshots, 1000).parts[led].led ?? 0).toBeLessThan(0.05);
    expect(at(snapshots, 3000).parts[led].led).toBeGreaterThan(0.2);
    expect(engine.serialAll.join('\n')).toMatch(/Dist\s+1[12]\.\d cm/);
  });

  it('servo follows the knob', async () => {
    const { p, snapshots } = await run('pico-servo-dial', 3000, (p) => [{ atMs: 1000, part: idOf(p, 'potentiometer'), key: 'position', value: 100 }, { atMs: 2000, part: idOf(p, 'potentiometer'), key: 'position', value: 0 }], [900, 1900, 2900]);
    const s = idOf(p, 'servo');
    expect(at(snapshots, 900).parts[s].angle).toBeCloseTo(90, -1);
    expect(at(snapshots, 1900).parts[s].angle).toBeGreaterThan(170);
    expect(at(snapshots, 2900).parts[s].angle).toBeLessThan(10);
  });

  it('plant waterer switches the pump relay with hysteresis and shows soil % on the LCD', async () => {
    const { p, snapshots } = await run('rpi-plant-waterer', 5000, (p) => [{ atMs: 1000, part: idOf(p, 'soil'), key: 'moisture', value: 10 }, { atMs: 2500, part: idOf(p, 'soil'), key: 'moisture', value: 45 }, { atMs: 3500, part: idOf(p, 'soil'), key: 'moisture', value: 80 }], [900, 2000, 3000, 4500]);
    const r = idOf(p, 'relay');
    expect(at(snapshots, 900).parts[r].relay).toBe(false);
    expect(at(snapshots, 2000).parts[r].relay).toBe(true);
    expect(at(snapshots, 3000).parts[r].relay).toBe(true); // between 30 and 60 %: keeps watering
    expect(at(snapshots, 4500).parts[r].relay).toBe(false);
    const lcd = at(snapshots, 4500).parts[idOf(p, 'lcd1602')].lcd;
    expect(String.fromCharCode(...lcd.chars)).toMatch(/Soil\s+80 %/);
  });

  it('motion alarm sounds on motion and can be disarmed with the button', async () => {
    const { p, snapshots } = await run(
      'esp32-motion-alarm',
      6000,
      (p) => [
        { atMs: 1000, part: idOf(p, 'pir'), key: 'motion', value: 1 },
        { atMs: 1300, part: idOf(p, 'pir'), key: 'motion', value: 0 },
        { atMs: 4000, part: idOf(p, 'pushbutton'), key: 'pressed', value: 1 },
        { atMs: 4200, part: idOf(p, 'pushbutton'), key: 'pressed', value: 0 },
        { atMs: 4800, part: idOf(p, 'pir'), key: 'motion', value: 1 },
      ],
      [900, 1500, 5500],
    );
    const bz = idOf(p, 'buzzer');
    const led = idOf(p, 'led');
    expect(at(snapshots, 900).parts[bz].tone).toBe(0);
    expect(at(snapshots, 1500).parts[bz].tone).toBeGreaterThan(1000);
    expect(at(snapshots, 1500).parts[led].led).toBeGreaterThan(0.2);
    expect(at(snapshots, 5500).parts[bz].tone).toBe(0); // disarmed
  });

  it('night light gets brighter as it gets darker', async () => {
    const { p, snapshots } = await run('pico-night-light', 3000, (p) => [{ atMs: 1000, part: idOf(p, 'ldr'), key: 'lux', value: 0.5 }], [900, 2500]);
    const led = idOf(p, 'led');
    expect(at(snapshots, 900).parts[led].led ?? 0).toBeLessThan(0.05);
    expect(at(snapshots, 2500).parts[led].led).toBeGreaterThan(0.3);
  });

  it('NeoPixel thermometer goes from blue to red', async () => {
    const { p, snapshots } = await run('esp32-neopixel-thermo', 7000, (p) => [{ atMs: 500, part: idOf(p, 'dht22'), key: 'temperature', value: 15 }, { atMs: 3500, part: idOf(p, 'dht22'), key: 'temperature', value: 35 }], [3000, 6500]);
    const ring = idOf(p, 'neopixel-ring');
    const [r1, , b1] = at(snapshots, 3000).parts[ring].pixels;
    const [r2, , b2] = at(snapshots, 6500).parts[ring].pixels;
    expect(b1).toBeGreaterThan(r1);
    expect(r2).toBeGreaterThan(b2);
  });

  it('thermostat turns the fan relay on above 28 °C and draws on the OLED', async () => {
    const { p, snapshots } = await run('rpi-thermostat', 6000, (p) => [{ atMs: 2500, part: idOf(p, 'dht22'), key: 'temperature', value: 31 }], [2000, 5500]);
    const r = idOf(p, 'relay');
    expect(at(snapshots, 2000).parts[r].relay).toBe(false);
    expect(at(snapshots, 5500).parts[r].relay).toBe(true);
    const oled = at(snapshots, 5500).parts[idOf(p, 'ssd1306')];
    expect(oled.oledOn).toBe(true);
    expect(oled.oled.some((b: number) => b)).toBe(true);
  });

  it('mood lamp colour follows the knob', async () => {
    const { p, snapshots } = await run('pico-mood-lamp', 3000, (p) => [{ atMs: 500, part: idOf(p, 'potentiometer'), key: 'position', value: 0 }, { atMs: 1500, part: idOf(p, 'potentiometer'), key: 'position', value: 100 }], [1400, 2800]);
    const rgb = idOf(p, 'rgb-led');
    const a = at(snapshots, 1400).parts[rgb].rgb;
    const b = at(snapshots, 2800).parts[rgb].rgb;
    expect(a[2]).toBeGreaterThan(a[0]); // blue-ish at 0 %
    expect(b[0]).toBeGreaterThan(b[2]); // red-ish at 100 %
  });

  it('555 blinker blinks the LED by itself', async () => {
    const p = buildExample('555-blinker');
    const frames = Array.from({ length: 30 }, (_, i) => 100 + i * 100);
    const { snapshots } = await simulate(p, { untilMs: 3200, onFrameAt: frames });
    const led = idOf(p, 'led');
    const states = snapshots.map((s) => (s.frame.parts[led].led ?? 0) > 0.2);
    const toggles = states.slice(1).filter((s, i) => s !== states[i]).length;
    expect(toggles).toBeGreaterThanOrEqual(5); // ~1.4 Hz over 3 s → ~8 edges
  });

  it('transistor switch lights the LED only while the button is held', async () => {
    const p = buildExample('transistor-switch');
    const sw = idOf(p, 'pushbutton');
    const { snapshots } = await simulate(p, { untilMs: 2000, inputs: [{ atMs: 800, part: sw, key: 'pressed', value: 1 }, { atMs: 1400, part: sw, key: 'pressed', value: 0 }], onFrameAt: [500, 1200, 1800] });
    const led = idOf(p, 'led');
    expect(at(snapshots, 500).parts[led].led ?? 0).toBeLessThan(0.05);
    expect(at(snapshots, 1200).parts[led].led).toBeGreaterThan(0.5);
    expect(at(snapshots, 1800).parts[led].led ?? 0).toBeLessThan(0.05);
  });

  it('flagship: button A flips to the bubble-level page', async () => {
    const { p, engine } = await run('esp32-weather-imu', 3000, (p) => [{ atMs: 1000, part: idOf(p, 'pushbutton', 0), key: 'pressed', value: 1 }, { atMs: 1200, part: idOf(p, 'pushbutton', 0), key: 'pressed', value: 0 }], []);
    const oled = (engine as any).devices.find((d: any) => d.part.type === 'ssd1306').dev;
    const art = oled.ascii();
    // the bubble-level page draws a 60×48 rectangle: a long horizontal edge in the middle columns
    expect(art.split('\n').some((r: string) => /#{25,}/.test(r.slice(15, 50)))).toBe(true);
    void p;
  });
});
