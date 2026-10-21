import { describe, expect, it } from 'vitest';
import { GenericI2CDevice, MAX7219Device, TFTDevice, alphaText, crc7Ens210, packResponse } from '../../src/sim/devices';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';

describe('checksums', () => {
  it('computes the ENS210 CRC-7 (datasheet examples: T_VAL FD 49 0B, H_VAL 6C 2E F5)', () => {
    expect(crc7Ens210(0x149fd)).toBe(0x05);
    expect(crc7Ens210(0x12e6c)).toBe(0xf5 >> 1);
  });

  it('builds the ENS210 readout bytes from a measure', () => {
    const t = 0x49fd / 64 - 273.15; // the datasheet's 296.0 K
    const dev = new GenericI2CDevice('u', 0x43, {}, [{ reg: '0x30', bytes: 3, scale: 1 / 64, offset: -273.15, format: 'ens210' }], () => t);
    dev.write([0x30]);
    expect(dev.read(3)).toEqual([0xfd, 0x49, 0x0b]);
  });

  it('computes the CM1106 checksum over every byte (datasheet example 16 05 01 02 58 00 00 8A)', () => {
    const b = packResponse([{ const: 0x16, bits: 8 }, { const: 5, bits: 8 }, { const: 1, bits: 8 }, { control: 'value', bits: 16, scale: 1 }, { const: 0, bits: 16 }, { crc: 'neg8', over: 7 }], () => 600);
    expect(b).toEqual([0x16, 0x05, 0x01, 0x02, 0x58, 0x00, 0x00, 0x8a]);
  });
});

describe('HT16K33 alphanumeric', () => {
  it('reads Adafruit 14-segment glyphs back as text, ignoring the decimal point', () => {
    expect(alphaText([0x00f7, 0x0536 | 0x4000, 0x0006, 0x0000])).toBe('AM1 ');
    expect(alphaText([0x1234])).toBe('?');
  });
});

describe('MAX7219 daisy chain', () => {
  const frame = (reg: number, d: number) => [reg, d];
  it('passes earlier frames on to later chips; each chip runs its own frame on LOAD', () => {
    const m = new MAX7219Device('u', 4);
    // First frame written ends in the farthest chip (3); the last in chip 0.
    m.clockIn([...frame(1, 0xa0), ...frame(1, 0xb0), ...frame(1, 0xc0), ...frame(1, 0xd0)]);
    m.latch();
    expect(m.chips.map((c) => c.digitRegs[0])).toEqual([0xd0, 0xc0, 0xb0, 0xa0]);
  });
  it('re-latches what is still in the shift registers when only one frame is sent', () => {
    const m = new MAX7219Device('u', 2);
    m.clockIn([...frame(2, 0x11), ...frame(3, 0x22)]);
    m.latch();
    m.clockIn(frame(4, 0x33));
    m.latch();
    // chip 1 now holds chip 0's previous frame (digit 2 → 0x22 again), chip 0 the new one.
    expect(m.chips[0].digitRegs[3]).toBe(0x33);
    expect(m.chips[1].digitRegs[2]).toBe(0x22);
  });
  it('draws chip 0 as the rightmost block (FC-16: DIN enters on the right)', () => {
    const m = new MAX7219Device('u', 2);
    m.clockIn([...frame(0x0c, 1), ...frame(0x0c, 1)]);
    m.latch();
    m.clockIn([...frame(1, 0x80), ...frame(1, 0x00)]); // chip 1: top-left dot; chip 0: nothing
    m.latch();
    const px = m.matrix();
    expect(px[0]).toBe(255);
    expect(px.slice(1, 16).every((x) => x === 0)).toBe(true);
  });
});

describe('colour displays', () => {
  const dcs = (t: TFTDevice, c: number, data: number[] = []) => {
    t.command(c);
    if (data.length) t.data(data);
  };
  it('takes 3-byte RGB666 pixels after COLMOD 0x66', () => {
    const t = new TFTDevice('u', 4, 4);
    dcs(t, 0x3a, [0x66]);
    dcs(t, 0x2c, [0xfc, 0x00, 0x00, 0x00, 0xfc, 0x00]);
    expect(t.fb[0]).toBe(0xf800); // red
    expect(t.fb[1]).toBe(0x07e0); // green
  });
  it('keeps RGB565 by default', () => {
    const t = new TFTDevice('u', 4, 4);
    dcs(t, 0x2c, [0xf8, 0x00]);
    expect(t.fb[0]).toBe(0xf800);
  });
  it('honours the SSD1351 window, remap and sleep commands', () => {
    const t = new TFTDevice('u', 128, 128, 'ssd1351');
    expect(t.on).toBe(false);
    dcs(t, 0xa0, [0x74]); // 65k, COM scan reversed (upright on real panels), RGB order
    dcs(t, 0x15, [10, 10]);
    dcs(t, 0x75, [20, 20]);
    dcs(t, 0x5c, [0xf8, 0x00]);
    expect(t.fb[20 * 128 + 10]).toBe(0xf800);
    dcs(t, 0xa0, [0x60]); // COM scan normal: rows come out bottom-up; colour order swapped
    dcs(t, 0x5c, [0xf8, 0x00]);
    expect(t.fb[(127 - 20) * 128 + 10]).toBe(0x001f);
    dcs(t, 0xaf);
    expect(t.on).toBe(true);
  });
  it('ignores SSD1351 commands while the command lock is on', () => {
    const t = new TFTDevice('u', 128, 128, 'ssd1351');
    dcs(t, 0xfd, [0x16]);
    dcs(t, 0xaf);
    expect(t.on).toBe(false);
    dcs(t, 0xfd, [0x12]);
    dcs(t, 0xaf);
    expect(t.on).toBe(true);
  });
});

describe('validation', () => {
  const base = { type: 'custom-x', name: 'x', mpn: 'x', category: 'display', description: 'x', eli5: 'x', refPrefix: 'U', interface: 'spi', vmin: 3, vmax: 5, currentMa: 10, priceUsd: 1, supplierQuery: 'x' } as const;
  const spi = [{ name: 'VCC', role: 'power' }, { name: 'GND', role: 'gnd' }, { name: 'DIN', role: 'io', fn: 'spi.mosi' }, { name: 'CS', role: 'io', fn: 'spi.cs' }, { name: 'CLK', role: 'io', fn: 'spi.sck' }];
  it('rejects a chain that is not a matrix, and a 14-segment MAX7219', () => {
    const errs = validateSpec({ ...base, pins: spi, sim: { kind: 'segment-display', protocol: 'max7219', count: 4, segments: 14 } } as unknown as CustomPartSpec);
    expect(errs.join(' ')).toMatch(/matrix: true/);
    expect(errs.join(' ')).toMatch(/segments/);
  });
  it('rejects an oled controller on a TFT and a 2-byte ens210 measure', () => {
    const e1 = validateSpec({ ...base, pins: [...spi, { name: 'DC', role: 'io', fn: 'tft.dc' }], sim: { kind: 'tft-display', width: 128, height: 128, controller: 'sh1106' } } as unknown as CustomPartSpec);
    expect(e1.join(' ')).toMatch(/oled-display controller/);
    const e2 = validateSpec({ ...base, interface: 'i2c', i2cAddress: 0x43, pins: [{ name: 'VCC', role: 'power' }, { name: 'GND', role: 'gnd' }, { name: 'SDA', role: 'io', fn: 'i2c.sda' }, { name: 'SCL', role: 'io', fn: 'i2c.scl' }], sim: { kind: 'i2c-device', measure: { reg: '0x30', bytes: 2, scale: 1, format: 'ens210' } } } as unknown as CustomPartSpec);
    expect(e2.join(' ')).toMatch(/ens210 is 3 bytes/);
  });
});
