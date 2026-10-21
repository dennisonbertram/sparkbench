// Addressable LED variants (SK6812 RGBW, APA102), TM1638 LED&KEY boards, the PCD8544 (Nokia 5110) LCD and I2S audio
// out to a MAX98357A amplifier.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { APA102Chain, PCD8544Device, TM1638Device, decodeLedStream } from '../../src/sim/devices';
import { analyse, openPort, shiftSamples, writeSamples } from '../../src/sim/i2s';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';
import { exampleFiles, pinNumbers, testProject } from '../../src/core/partcheck';
import { simulate } from '../../src/sim/node-runner';

const fixture = (f: string): CustomPartSpec => JSON.parse(readFileSync(`tests/fixtures/parts/${f}`, 'utf8'));
const run = async (f: string, untilMs: number, opts: { code?: (pins: Record<string, number>) => string; board?: 'esp32' | 'pico'; inputs?: { atMs: number; key: string; value: number }[]; spec?: (s: CustomPartSpec) => void } = {}) => {
  const spec = fixture(f);
  opts.spec?.(spec);
  const { project } = testProject(spec, opts.board ?? 'esp32');
  if (opts.code) project.files = { ...exampleFiles(spec, project), 'main.py': opts.code(pinNumbers(project)) };
  const r = await simulate(project, { untilMs, inputs: (opts.inputs ?? []).map((i) => ({ ...i, part: 'dut' })) });
  return { out: r.engine.serialAll.join('\n'), warnings: r.engine.allWarnings.map((w) => w.text).join('\n'), error: r.engine.error?.raw ?? '', dut: r.final.parts.dut, project };
};

describe('one-wire LED strips', () => {
  it('decodes the GRB wire order to RGB', () => {
    expect(decodeLedStream([10, 200, 30, 0, 0, 255], 'ws2812', 2)).toEqual([200, 10, 30, 0, 0, 255]);
  });
  it('takes 4 bytes per SK6812 RGBW LED and adds the white channel to all three', () => {
    expect(decodeLedStream([0, 100, 0, 50, 0, 0, 0, 0], 'sk6812-rgbw', 2)).toEqual([150, 50, 50, 0, 0, 0]);
  });
  it('lights an RGBW strip written with bpp=4 (white only)', async () => {
    const r = await run('sk6812-rgbw.json', 2500);
    expect(r.out).toContain('white (0, 0, 0, 80)');
    expect(r.dut.pixels?.slice(0, 6)).toEqual([80, 80, 80, 80, 80, 80]);
  });
  it('garbles the colours and warns when an RGBW strip is written with 3 bytes per pixel', async () => {
    const r = await run('sk6812-rgbw.json', 2000, { code: (p) => `from machine import Pin\nimport neopixel\nnp = neopixel.NeoPixel(Pin(${p.DIN}), 8)\nnp.fill((255, 0, 0))\nnp.write()\n` });
    expect(r.warnings).toMatch(/RGBW LEDs \(4 bytes each\)/);
    // Wire bytes 0,255,0 per pixel: LED 1 takes G0 R255 B0 W0 (red), LED 2 takes G255 R0 B0 W255 (white-green).
    expect(r.dut.pixels?.slice(0, 6)).toEqual([255, 0, 0, 255, 255, 255]);
  });
});

describe('APA102 / SK9822', () => {
  it('needs a start frame, then scales each LED by its 5-bit brightness', () => {
    const c = new APA102Chain(2);
    c.clockIn([0xe0 | 31, 0, 0, 255]); // no start frame yet: ignored
    expect(c.rgb).toEqual([0, 0, 0, 0, 0, 0]);
    c.clockIn([0, 0, 0, 0, 0xe0 | 31, 0, 0, 255, 0xe0 | 16, 255, 0, 0, 0xff, 0xff, 0xff, 0xff]);
    expect(c.rgb).toEqual([255, 0, 0, 0, 0, Math.round((255 * 16) / 31)]);
  });
  it('drops frames past the last LED, and a new start frame begins again at LED 1', () => {
    const c = new APA102Chain(1);
    c.clockIn([0, 0, 0, 0, 0xff, 1, 2, 3, 0xff, 9, 9, 9]);
    expect(c.rgb).toEqual([3, 2, 1]);
    c.clockIn([0, 0, 0, 0, 0xff, 0, 50, 0]);
    expect(c.rgb).toEqual([0, 50, 0]);
  });
  it('shows what the program clocked out over SPI', async () => {
    const r = await run('apa102.json', 2500);
    expect(r.out).toContain('sent');
    const k = 16 / 31;
    expect(r.dut.pixels?.slice(0, 3)).toEqual([Math.round(255 * k), 0, 0]);
    expect(r.dut.pixels?.slice(21, 24)).toEqual([0, 0, Math.round(255 * k)]);
  });
  it('rejects an APA102 strip without SPI pins', () => {
    const s = fixture('apa102.json');
    s.pins = s.pins.map((p) => ({ ...p, fn: undefined }));
    expect(validateSpec(s).join(' ')).toMatch(/APA102 strip needs pins with fn spi.sck/);
  });
});

describe('TM1638', () => {
  const clockByte = (d: TM1638Device, b: number) => {
    for (let i = 0; i < 8; i++) {
      d.clk(0, 1, 0);
      d.clk(1, 0, (b >> i) & 1);
    }
  };
  it('stores display data at the addressed RAM byte, auto-incrementing', () => {
    const d = new TM1638Device('u', () => [0, 0, 0, 0]);
    d.stb(0);
    clockByte(d, 0x40);
    d.stb(1);
    d.stb(0);
    clockByte(d, 0xc2);
    clockByte(d, 0x06);
    clockByte(d, 0x01);
    d.stb(1);
    d.stb(0);
    clockByte(d, 0x8f);
    d.stb(1);
    expect(d.ram.slice(0, 4)).toEqual([0, 0, 0x06, 0x01]);
    expect(d.on).toBe(true);
    expect(d.brightness).toBe(7);
  });
  it('clocks the key bytes out LSB first on falling edges after 0x42', () => {
    const d = new TM1638Device('u', () => [0x10, 0, 0, 0x01]);
    d.stb(0);
    clockByte(d, 0x42);
    const bits: number[] = [];
    for (let i = 0; i < 32; i++) {
      d.clk(0, 1, 1);
      bits.push(d.dioOut);
      d.clk(1, 0, 1);
    }
    d.stb(1);
    expect(bits.map((b, i) => (b ? i : -1)).filter((i) => i >= 0)).toEqual([4, 24]);
    expect(d.dioOut).toBe(1); // released when STB goes high
  });
  it('rejects a TM1638 board without STB/CLK/DIO pins', () => {
    const s = fixture('tm1638.json');
    s.pins = s.pins.filter((p) => p.name !== 'STB');
    expect(validateSpec(s).join(' ')).toMatch(/STB, CLK and DIO/);
  });
});

describe('PCD8544 (Nokia 5110)', () => {
  const init = (d: PCD8544Device, vop = 0x3f) => [0x21, 0x06, 0x14, 0x80 | vop, 0x20, 0x0c].forEach((c) => d.command(c));
  it('shows nothing until powered up with a contrast and normal mode', () => {
    const d = new PCD8544Device('u');
    d.data([0xff]);
    expect(d.on).toBe(false);
    init(d, 0);
    expect(d.on).toBe(false); // Vop 0: no contrast
    init(d);
    expect(d.on).toBe(true);
    expect(d.lit(0, 0)).toBe(true);
  });
  it('addresses columns and banks, horizontally and vertically', () => {
    const d = new PCD8544Device('u');
    init(d);
    d.command(0x80 | 83);
    d.command(0x40 | 2);
    d.data([0x01, 0x80]); // x 83 wraps to x 0 of the next bank
    expect(d.lit(83, 16)).toBe(true);
    expect(d.lit(0, 31)).toBe(true);
    d.command(0x22); // vertical addressing
    d.command(0x80 | 10);
    d.command(0x40 | 4);
    d.data([0x01, 0x01, 0x01]); // banks 4, 5, then wraps to bank 0 of column 11
    expect([d.lit(10, 32), d.lit(10, 40), d.lit(11, 0)]).toEqual([true, true, true]);
  });
  it('reset clears RAM and powers the panel down', async () => {
    const d = new PCD8544Device('u');
    init(d);
    d.data([0xff]);
    d.reset();
    expect(d.on).toBe(false);
    init(d);
    expect(d.lit(0, 0)).toBe(false);
  });
  it('reads the text a real MicroPython driver draws', async () => {
    const r = await run('pcd8544.json', 3500);
    expect((r.dut.textLines ?? []).join(' ')).toMatch(/Count/);
  });
  it('stays blank when the code never sets a contrast', async () => {
    const r = await run('pcd8544.json', 2500, {
      code: (p) =>
        `from machine import Pin, SPI\nimport framebuf, pcd8544, time\nclass Dim(pcd8544.PCD8544):\n    def init(self):\n        self.write_cmd(0x20)\n        self.write_cmd(0x0c)\n        self.clear()\nspi = SPI(1, baudrate=2000000, sck=Pin(${p.CLK}), mosi=Pin(${p.DIN}))\nlcd = Dim(spi, Pin(${p.CE}), Pin(${p.DC}), Pin(${p.RST}))\nbuf = bytearray(504)\nfb = framebuf.FrameBuffer(buf, 84, 48, framebuf.MONO_VLSB)\nfb.text('Hi', 0, 0, 1)\nlcd.data(buf)\n`,
    });
    expect(r.error).toBe('');
    expect(r.dut.textLines ?? []).toEqual([]);
  });
  it('rejects a PCD8544 that is not 84×48', () => {
    const s = fixture('pcd8544.json');
    s.sim.width = 128;
    expect(validateSpec(s).join(' ')).toMatch(/84×48/);
  });
});

describe('I2S audio out (MAX98357A)', () => {
  const tone = (hz: number, rate: number, n: number, amp = 8000) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = Math.round(amp * Math.sin((2 * Math.PI * hz * i) / rate)) & 0xffff;
      out.push(v & 0xff, v >> 8);
    }
    return out;
  };
  it('finds the pitch and level of what was written', () => {
    const p = openPort(0, 1, 2, 3, 16, false, 16000, 4000);
    writeSamples(p, tone(440, 16000, 1600), 0);
    const a = analyse(p, 'mix');
    expect(a.hz).toBeGreaterThan(430);
    expect(a.hz).toBeLessThan(450);
    expect(a.level).toBeCloseTo(8000 / 32768 / Math.SQRT2, 2);
  });
  it('blocks write() only once the ibuf is full', () => {
    const p = openPort(0, 1, 2, 3, 16, false, 8000, 1600); // 100 ms of buffer
    expect(writeSamples(p, tone(440, 8000, 400), 0).blockUs).toBe(0); // 50 ms queued
    expect(writeSamples(p, tone(440, 8000, 800), 0).blockUs).toBeCloseTo(50000, -2); // 150 ms queued
  });
  it('shifts samples like I2S.shift (volume)', () => {
    expect(shiftSamples([0x00, 0x10, 0x00, 0xf0], 16, -4)).toEqual([0x00, 0x01, 0x00, 0xff]);
    expect(shiftSamples([0x01, 0x00], 16, 1)).toEqual([0x02, 0x00]);
  });
  it('plays a tone the test hears at the right pitch, then goes quiet', async () => {
    const r = await run('max98357a.json', 2000);
    expect(r.out).toContain('playing');
    expect(r.dut.tone).toBeGreaterThan(430);
    expect(r.dut.tone).toBeLessThan(450);
  });
  it('follows SD_MODE: driven low it shuts down, driven high it plays the left channel', async () => {
    const play = (level: number) =>
      run('max98357a.json', 1500, {
        spec: (s) => (s.pins.find((p) => p.name === 'SD')!.required = true),
        code: (p) =>
          `from machine import I2S, Pin\nimport struct, math\nsd = Pin(${p.SD}, Pin.OUT, value=${level})\na = I2S(0, sck=Pin(${p.BCLK}), ws=Pin(${p.LRC}), sd=Pin(${p.DIN}), mode=I2S.TX, bits=16, format=I2S.MONO, rate=16000, ibuf=4000)\nb = bytearray(288)\nfor i in range(144):\n    struct.pack_into('<h', b, i * 2, int(8000 * math.sin(2 * math.pi * i / 36)))\nwhile True:\n    a.write(b)\n`,
      });
    expect((await play(0)).dut.tone).toBe(0);
    expect((await play(1)).dut.tone).toBeGreaterThan(400);
  });
  it("needs WS on the pin after SCK on the Pico, as rp2's PIO I2S does", async () => {
    const r = await run('max98357a.json', 1000, { board: 'pico', code: (p) => `from machine import I2S, Pin\nI2S(0, sck=Pin(${p.BCLK}), ws=Pin(${p.BCLK + 2}), sd=Pin(${p.DIN}), mode=I2S.TX, bits=16, format=I2S.MONO, rate=16000, ibuf=4000)\n` });
    expect(r.error).toMatch(/must be sck\+1/);
  });
  it('wires BCLK and LRC to neighbouring pins on the Pico', () => {
    const { project } = testProject(fixture('max98357a.json'), 'pico');
    const p = pinNumbers(project);
    expect(p.LRC).toBe(p.BCLK + 1);
  });
  it('rejects an I2S amplifier without I2S pins', () => {
    const s = fixture('max98357a.json');
    s.pins = s.pins.filter((p) => p.fn !== 'i2s.din');
    expect(validateSpec(s).join(' ')).toMatch(/i2s.bclk, i2s.lrc and i2s.din/);
  });
});
