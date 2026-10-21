// GPIO-selected pulse outputs (TCS3200 colour sensor), index-addressed command data (SparkFun Qwiic LED Stick).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';
import { testProject } from '../../src/core/partcheck';
import { simulate } from '../../src/sim/node-runner';
import { GenericI2CDevice, SSD1306Device } from '../../src/sim/devices';

const fixture = (f: string): CustomPartSpec => JSON.parse(readFileSync(`tests/fixtures/parts/${f}`, 'utf8'));
const pinOf = (project: any, name: string) => {
  const w = project.wires.find((x: any) => (x.a.part === 'dut' && x.a.pin === name) || (x.b.part === 'dut' && x.b.pin === name));
  const b = w.a.part === 'dut' ? w.b : w.a;
  return Number(/(\d+)$/.exec(b.pin)?.[1] ?? NaN);
};
const tcs = async (setup: string, inputs: { key: string; value: number }[], pull = '') => {
  const { project } = testProject(fixture('tcs3200.json'), 'esp32');
  const p = (n: string) => pinOf(project, n);
  project.files = {
    'main.py': `from machine import Pin
import time
s0 = Pin(${p('S0')}, Pin.OUT); s1 = Pin(${p('S1')}, Pin.OUT); s2 = Pin(${p('S2')}, Pin.OUT); s3 = Pin(${p('S3')}, Pin.OUT); oe = Pin(${p('OE')}, Pin.OUT)
out = Pin(${p('OUT')}, Pin.IN${pull})
n = 0
def cb(x):
    global n
    n += 1
out.irq(trigger=Pin.IRQ_RISING, handler=cb)
time.sleep_ms(300)
${setup}
time.sleep_ms(5)
n = 0
time.sleep_ms(100)
print('HZ=%d' % (n * 10))
`,
  };
  const r = await simulate(project, { untilMs: 800, inputs: inputs.map((i) => ({ atMs: 50, part: 'dut', ...i })) });
  return { out: r.engine.serialAll.join('\n'), warnings: r.engine.allWarnings.map((w) => w.text).join('\n') };
};

describe('GPIO-selected pulse output (TCS3200)', () => {
  it('S2/S3 pick the photodiode and S0/S1 the scaling (datasheet table)', async () => {
    const r = await tcs('s0.value(1); s1.value(0); s2.value(0); s3.value(1)', [{ key: 'blue', value: 50 }, { key: 'red', value: 400 }]);
    expect(r.out).toMatch(/HZ=(99|100|101)\d\d\b/); // blue 50 kHz-equivalent at 20% = 10 kHz
  }, 60000);
  it('powers down with S0 = S1 = L', async () => {
    const r = await tcs('s0.value(0); s1.value(0); s2.value(0); s3.value(0)', [{ key: 'red', value: 300 }]);
    expect(r.out).toContain('HZ=0');
  }, 60000);
  it('OE high releases OUT (high impedance), so the pin reads its pull', async () => {
    const r = await tcs('s0.value(0); s1.value(1); oe.value(1)', [{ key: 'red', value: 300 }], ', Pin.PULL_DOWN');
    expect(r.out).toContain('HZ=0');
  }, 60000);
  it('warns and holds the frequency at maxHz rather than skipping edges', async () => {
    const r = await tcs('s0.value(1); s1.value(1)', [{ key: 'red', value: 300 }]);
    expect(r.warnings).toMatch(/more than the 50000 Hz/);
  }, 60000);
  it('validates select groups', () => {
    const f = fixture('tcs3200.json');
    f.sim.pulse!.select!.channel!.controls = ['red', 'blue'];
    expect(validateSpec(f).join(' ')).toMatch(/needs 4 entries/);
  });
});

describe('index-addressed command blocks (SparkFun Qwiic LED Stick firmware)', () => {
  const stick = () => {
    const f = fixture('qwiic-led-stick.json');
    expect(validateSpec(f)).toEqual([]);
    return new GenericI2CDevice('u', 0x23, f.sim.registers ?? {}, [], () => 0, [], { commands: f.sim.commands, blockPixels: f.sim.blockPixels });
  };
  const px = (d: GenericI2CDevice, i: number) => d.blockPixels().slice(i * 3, i * 3 + 3);
  it('0x71 writes one LED (index from 0) at full brightness; 0x76 scales it by brightness/31', () => {
    const d = stick();
    d.write([0x71, 2, 200, 100, 50]);
    expect(px(d, 2)).toEqual([200, 100, 50]);
    expect(px(d, 0)).toEqual([0, 0, 0]);
    d.write([0x76, 2, 0]);
    expect(px(d, 2)).toEqual([0, 0, 0]); // brightness 0: colour kept but dark
    d.write([0x76, 2, 31]);
    expect(px(d, 2)).toEqual([200, 100, 50]);
  });
  it('0x72 sets all LEDs up to the length; 0x78 clears them; 0x77 sets every brightness', () => {
    const d = stick();
    d.write([0x72, 10, 20, 30]);
    expect(d.blockPixels()).toEqual(Array.from({ length: 10 }, () => [10, 20, 30]).flat());
    d.write([0x77, 0]);
    expect(d.blockPixels().every((x) => x === 0)).toBe(true);
    d.write([0x77, 31, 0x78]);
    expect(d.blockPixels().every((x) => x === 0)).toBe(true);
  });
  it('0x73-0x75 write length values from an offset, capped by the LED length', () => {
    const d = stick();
    d.write([0x73, 3, 4, 1, 2, 3]);
    expect([px(d, 4)[0], px(d, 5)[0], px(d, 6)[0]]).toEqual([1, 2, 3]);
    d.write([0x70, 2]); // two LEDs
    d.write([0x75, 3, 0, 7, 8, 9]); // only 2 values taken; the 9 is then read as a (non-)command
    expect(d.blockPixels()).toEqual([0, 0, 7, 0, 0, 8]);
  });
  it('rejects out-of-range lengths and indexes, reading the rest of the write as commands', () => {
    const d = stick();
    d.write([0x70, 0]);
    d.write([0x70, 101]);
    expect(d.blockPixels().length).toBe(30); // still 10 LEDs
    d.write([0x71, 150, 0x72, 5, 5, 5]); // index 150 rejected; 0x72 then runs
    expect(px(d, 9)).toEqual([5, 5, 5]);
  });
});

describe('SH1107 OLED (128×128 RAM, 16 pages)', () => {
  const dev = (o: any = {}) => new SSD1306Device('u', { controller: 'sh1107', ...o });
  const cmd = (d: SSD1306Device, ...b: number[]) => d.write([0x00, ...b]);
  const lit = (d: SSD1306Device, x: number, y: number) => ((d.visibleRam()[(y >> 3) * 128 + x] >> (y & 7)) & 1) === 1;
  it('writes all 16 pages in page mode: B0–BF, 7-bit column, wrap 127 → 0 on the same page', () => {
    const d = dev();
    cmd(d, 0xaf, 0xbf, 0x0f, 0x17); // page 15, column 127
    d.write([0x40, 0x80, 0x01]);
    expect(lit(d, 127, 127)).toBe(true); // bit 7 of page 15
    expect(lit(d, 0, 120)).toBe(true); // wrapped to column 0, same page
  });
  it('20H/21H take no argument; vertical mode steps the page, then wraps 15 → 0', () => {
    const d = dev();
    cmd(d, 0x21, 0xb0, 0x05, 0x10); // vertical, page 0, column 5
    d.write([0x40, ...new Array(17).fill(0x01)]);
    for (let p = 0; p < 16; p++) expect(lit(d, 5, p * 8)).toBe(true);
    expect(lit(d, 6, 0)).toBe(false); // column unchanged
  });
  it('COM k shows RAM row (start line + k − offset) mod 128; only COM0…mux are on', () => {
    const d = dev({ rows: 64 });
    cmd(d, 0xb4, 0x00, 0x10); // page 4 = rows 32–39
    d.write([0x40, 0x01]); // RAM row 32, column 0
    expect(lit(d, 0, 32)).toBe(true);
    cmd(d, 0xd3, 0x60); // display offset 96 (Adafruit 128×64 FeatherWing style)
    expect(lit(d, 0, 0)).toBe(true); // COM0 now shows row (0 + 0 − 96) mod 128 = 32
    cmd(d, 0xd3, 0x00, 0xdc, 32);
    expect(lit(d, 0, 0)).toBe(true); // start line 32 at the top
    cmd(d, 0xdc, 0, 0xa8, 15);
    d.write([0x00, 0xb2, 0x00, 0x10, 0x40, 0xff]); // rows 16–23: past a 16-line mux
    expect(lit(d, 0, 16)).toBe(false);
  });
  it('a 64-wide window at column 32 hides a driver that forgets the offset', () => {
    const d = dev({ width: 64, colOffset: 32 });
    cmd(d, 0xb0, 0x00, 0x10);
    d.write([0x40, 0xff]); // column 0: off the glass
    expect(d.visibleRam().some((b) => b)).toBe(false);
    cmd(d, 0xb0, 0x00, 0x12); // column 32 = left edge
    d.write([0x40, 0xff]);
    expect(lit(d, 0, 0)).toBe(true);
  });
  it('validates rows', () => {
    const f = fixture('sh1107-128.json');
    expect(validateSpec(f)).toEqual([]);
    f.sim.controller = 'ssd1306';
    expect(validateSpec(f).join(' ')).toMatch(/128 needs controller sh1107/);
  });
});
