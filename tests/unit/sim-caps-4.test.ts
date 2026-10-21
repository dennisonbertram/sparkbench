// SPI OLEDs, HD44780 character LCDs of any size, pointer-less chips with values split across registers (TLV493D),
// and decimal readings sent as whole units + tenths (DHT12).
import { describe, expect, it } from 'vitest';
import { GenericI2CDevice, Lcd1602Device, SSD1306Device, packResponse } from '../../src/sim/devices';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';
import { readFileSync } from 'node:fs';

describe('split decimal fields (DHT12)', () => {
  it('sends 56.8 %RH as 56, 8 and −5.7 °C as 5, 0x80 | 7, with a sum8 checksum', () => {
    const v: Record<string, number> = { humidity: 56.8, value: -5.7 };
    const b = packResponse([{ control: 'humidity', split: 'int', bits: 8 }, { control: 'humidity', split: 'tenths', bits: 8 }, { control: 'value', split: 'int', bits: 8 }, { control: 'value', split: 'tenths', bits: 8, signBit: 7 }, { crc: 'sum8', over: 4 }], (k) => v[k]);
    expect(b).toEqual([56, 8, 5, 0x87, (56 + 8 + 5 + 0x87) & 0xff]);
  });
  it('rounds to the nearest tenth without carrying a tenths digit of 10', () => {
    const b = packResponse([{ control: 'v', split: 'int', bits: 8 }, { control: 'v', split: 'tenths', bits: 8 }], () => 21.96);
    expect(b).toEqual([22, 0]);
  });
});

describe('values spread over registers, reads from register 0 (TLV493D)', () => {
  const dev = (vals: Record<string, number>) =>
    new GenericI2CDevice('u', 0x5e, { '0x05': 0x10 }, [
      { reg: '0x00', bytes: 2, bits: 12, signed: true, scale: 1, fields: [{ reg: '0x00', from: 4, width: 8 }, { reg: '0x04', from: 0, width: 4, at: 4 }] },
      { reg: '0x01', bytes: 2, bits: 12, signed: true, scale: 1, control: 'by', fields: [{ reg: '0x01', from: 4, width: 8 }, { reg: '0x04', from: 0, width: 4, at: 0 }] },
      { reg: '0x05', bytes: 1, bits: 4, scale: 1, control: 'bz', fields: [{ reg: '0x05', from: 0, width: 4 }] },
    ], (k) => vals[k] ?? 0, [], { readFromZero: true });
  it('puts the high byte and the low nibbles where the datasheet says, keeping the other bits', () => {
    const d = dev({ value: 0x5a3, by: -2, bz: 9 });
    const r = d.read(6);
    expect(r[0]).toBe(0x5a);
    expect(r[1]).toBe(0xff); // −2 = 0xFFE: high byte 0xFF
    expect(r[4]).toBe(0x3e); // Bx[3:0] = 3 in bits 7:4, By[3:0] = 0xE in bits 3:0
    expect(r[5]).toBe(0x19); // static flag bit 4 kept, Bz nibble 9
  });
  it('restarts every read at register 0 and keeps writes in a separate map', () => {
    const d = dev({ value: 0x123 });
    d.write([0x00, 0x05, 0x00, 0x40]);
    expect(d.read(2)[0]).toBe(0x12);
    expect(d.read(1)[0]).toBe(0x12);
    expect(d.written.get(1)).toBe(0x05);
  });
  it('clamps a signed value to its width', () => {
    expect(dev({ value: 5000 }).read(1)[0]).toBe(0x7f);
    expect(dev({ value: -5000 }).read(1)[0]).toBe(0x80);
  });
});

describe('HD44780 character LCDs', () => {
  const nib = (d: Lcd1602Device, n: number, rs: number, map = { rs: 0, e: 2, bl: 3, d4: 4 }) => {
    const b = (n << map.d4) | (rs << map.rs) | (1 << map.bl);
    d.write([b | (1 << map.e), b]);
  };
  const byte = (d: Lcd1602Device, v: number, rs: number, map?: { rs: number; e: number; bl: number; d4: number }) => {
    nib(d, v >> 4, rs, map);
    nib(d, v & 15, rs, map);
  };
  const init = (d: Lcd1602Device, map?: { rs: number; e: number; bl: number; d4: number }) => {
    for (let i = 0; i < 3; i++) nib(d, 3, 0, map);
    nib(d, 2, 0, map);
    for (const c of [0x28, 0x0c, 0x01]) byte(d, c, 0, map);
  };
  it('addresses the four rows of a 20×4 at 0x00, 0x40, 0x14 and 0x54', () => {
    const d = new Lcd1602Device('u', { cols: 20, rows: 4 });
    init(d);
    for (const [addr, s] of [[0x14, 'third'], [0x54, 'fourth'], [0x40, 'second'], [0x00, 'first']] as const) {
      byte(d, 0x80 | addr, 0);
      for (const ch of s) byte(d, ch.charCodeAt(0), 1);
    }
    expect(d.lines().map((l) => l.trim())).toEqual(['first', 'second', 'third', 'fourth']);
    expect(d.characters().length).toBe(80);
  });
  it('follows a different backpack wiring', () => {
    const map = { rs: 1, e: 2, bl: 7, d4: 3 };
    const d = new Lcd1602Device('u', { pins: { rs: 1, rw: 0, e: 2, backlight: 7, d4: 3 } });
    init(d, map);
    for (const ch of 'Hi') byte(d, ch.charCodeAt(0), 1, map);
    expect(d.lines()[0].trim()).toBe('Hi');
    expect(d.backlight).toBe(true);
  });
  it('rejects pin maps that share a bit', () => {
    const spec = JSON.parse(readFileSync('tests/fixtures/parts/lcd2004.json', 'utf8')) as CustomPartSpec;
    expect(validateSpec(spec)).toEqual([]);
    spec.sim.lcd = { cols: 20, rows: 4, pins: { rs: 0, rw: 1, e: 4, backlight: 3, d4: 4 } };
    expect(validateSpec(spec).join(' ')).toMatch(/own port bit/);
  });
});

describe('SPI OLEDs', () => {
  it('takes DC low as commands and DC high as display data', () => {
    const d = new SSD1306Device('u', { addr: -1 });
    d.spi(false, [0xaf, 0x21, 0, 127, 0x22, 0, 7]);
    d.spi(true, [0xff, 0x81]);
    expect(d.on).toBe(true);
    expect([d.ram[0], d.ram[1]]).toEqual([0xff, 0x81]);
  });
  it('needs DC and the SPI clock/data pins, but no I2C address', () => {
    const spec = JSON.parse(readFileSync('tests/fixtures/parts/ssd1306-spi.json', 'utf8')) as CustomPartSpec;
    expect(validateSpec(spec)).toEqual([]);
    spec.pins = spec.pins.filter((p) => p.fn !== 'tft.dc');
    expect(validateSpec(spec).join(' ')).toMatch(/tft\.dc/);
  });
});
