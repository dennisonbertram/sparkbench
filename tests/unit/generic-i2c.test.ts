import { describe, expect, it } from 'vitest';
import { GenericI2CDevice, crc8Sensirion, packResponse } from '../../src/sim/devices';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';

describe('datasheet-part I2C model', () => {
  it('computes the Sensirion CRC-8 (datasheet example: 0xBEEF → 0x92)', () => {
    expect(crc8Sensirion([0xbe, 0xef])).toBe(0x92);
  });

  it('packs fields MSB-first across bytes (AHT20 20-bit values)', () => {
    // status 0x1C, humidity raw 0x80000 (50 %), temperature raw 0x60000 (≈ 25 °C), then CRC over 6 bytes.
    const bytes = packResponse(
      [
        { const: 0x1c, bits: 8 },
        { control: 'humidity', bits: 20, scale: 100 / 2 ** 20 },
        { control: 'value', bits: 20, scale: 200 / 2 ** 20, offset: -50 },
        { crc: 'sensirion', over: 6 },
      ],
      (k) => (k === 'humidity' ? 50 : 25),
    );
    expect(bytes.slice(0, 6)).toEqual([0x1c, 0x80, 0x00, 0x06, 0x00, 0x00]);
    expect(bytes[6]).toBe(crc8Sensirion(bytes.slice(0, 6)));
  });

  it('answers a command with its response, and registers otherwise', () => {
    const dev = new GenericI2CDevice('u', 0x44, { '0xd0': 0x60 }, [{ reg: '0x10', bytes: 2, scale: 0.5, control: 'lux' }], (k) => (k === 'lux' ? 100 : 21), [
      { match: '24 00', bytes: [{ control: 'value', bits: 16, scale: 175 / 65535, offset: -45 }, { crc: 'sensirion', over: 2 }] },
    ]);
    dev.write([0x24, 0x00]);
    const r = dev.read(3);
    const raw = (r[0] << 8) | r[1];
    expect(-45 + (175 * raw) / 65535).toBeCloseTo(21, 1);
    expect(r[2]).toBe(crc8Sensirion(r.slice(0, 2)));
    dev.write([0xd0]);
    expect(dev.read(1)).toEqual([0x60]);
    dev.write([0x10]);
    expect(dev.read(2)).toEqual([0, 200]);
  });

  it('rejects malformed models', () => {
    const spec = {
      type: 'custom-x',
      name: 'x',
      mpn: 'X',
      category: 'sensor',
      description: '',
      eli5: '',
      refPrefix: 'U',
      interface: 'i2c',
      pins: [{ name: 'GND', role: 'gnd' }, { name: 'VCC', role: 'power' }],
      i2cAddress: 0x44,
      priceUsd: 1,
      supplierQuery: 'x',
      sim: { kind: 'i2c-device', measures: [{ reg: '16', bytes: 2, scale: 1, control: 'nope' }], responses: [{ match: '2400', bytes: [{ const: 1, bits: 4 }] }] },
    } as unknown as CustomPartSpec;
    const errs = validateSpec(spec).join(' | ');
    expect(errs).toMatch(/must be hex like/);
    expect(errs).toMatch(/control nope/);
    expect(errs).toMatch(/hex bytes like/);
    expect(errs).toMatch(/not whole bytes/);
  });
});

describe('word registers and 16-bit addresses', () => {
  it('keeps 16-bit registers apart (INA219-style bus and shunt registers)', () => {
    const vals: Record<string, number> = { value: 5, shunt: 0.01 };
    const dev = new GenericI2CDevice('u', 0x40, { '0x00': 0x399f }, [
      { reg: '0x02', bytes: 2, scale: 0.004, shift: 3 },
      { reg: '0x01', bytes: 2, scale: 0.00001, signed: true, control: 'shunt' },
    ], (k) => vals[k], [], { regWidth: 16 });
    dev.write([0x02]);
    const bus = dev.read(2);
    expect((((bus[0] << 8) | bus[1]) >> 3) * 0.004).toBeCloseTo(5, 2);
    dev.write([0x01]);
    const sh = dev.read(2);
    expect(((sh[0] << 8) | sh[1]) * 0.00001).toBeCloseTo(0.01, 5);
    dev.write([0x00]);
    expect(dev.read(2)).toEqual([0x39, 0x9f]);
    dev.write([0x05, 0x10, 0x00]); // calibration write
    dev.write([0x05]);
    expect(dev.read(2)).toEqual([0x10, 0x00]);
  });

  it('uses two-byte register addresses when asked (VL53L1X-style)', () => {
    const dev = new GenericI2CDevice('u', 0x29, { '0x010f': 0xea }, [], () => 0, [], { addrWidth: 16 });
    dev.write([0x01, 0x0f]);
    expect(dev.read(1)).toEqual([0xea]);
  });

  it('computes the HTU21D/Si7021 CRC (init 0x00): 0x683A → 0x7C', () => {
    expect(crc8Sensirion([0x68, 0x3a], 0)).toBe(0x7c);
  });
});

describe('float fields', () => {
  it('packs IEEE-754 floats big-endian with a CRC per word (SCD30 style)', () => {
    const b = packResponse([{ control: 'value', float32: true, bits: 32 }], () => 1234.5);
    const dv = new DataView(new Uint8Array(b).buffer);
    expect(dv.getFloat32(0)).toBeCloseTo(1234.5, 3);
  });
});

describe('split float fields', () => {
  it('splits a float into words with a CRC after each (SCD30 read_measurement)', () => {
    const b = packResponse([{ control: 'value', float32: 'hi', bits: 16 }, { crc: 'sensirion', over: 2 }, { control: 'value', float32: 'lo', bits: 16 }, { crc: 'sensirion', over: 2 }], () => 812.25);
    expect(b[2]).toBe(crc8Sensirion(b.slice(0, 2)));
    expect(b[5]).toBe(crc8Sensirion(b.slice(3, 5)));
    expect(new DataView(new Uint8Array([b[0], b[1], b[3], b[4]]).buffer).getFloat32(0)).toBeCloseTo(812.25, 3);
  });
});

describe('little-endian fields', () => {
  it('sends a 16-bit value low byte first (SDS011 PM2.5 = 123.4)', () => {
    const b = packResponse([{ control: 'value', bits: 16, scale: 0.1, littleEndian: true }], () => 123.4);
    expect(b).toEqual([1234 & 0xff, 1234 >> 8]);
  });
});

describe('command-selected results', () => {
  it('serves temperature or pressure from the same register depending on the last command (BMP180-style)', () => {
    const vals: Record<string, number> = { value: 27000, pressure: 23843 };
    const dev = new GenericI2CDevice('u', 0x77, {}, [
      { reg: '0xf6', bytes: 2, scale: 1, when: { reg: '0xf4', equals: 0x2e } },
      { reg: '0xf6', bytes: 2, scale: 1, control: 'pressure', when: { reg: '0xf4', equals: 0x34 } },
    ], (k) => vals[k]);
    dev.write([0xf4, 0x2e]);
    dev.write([0xf6]);
    expect(dev.read(2)).toEqual([27000 >> 8, 27000 & 0xff]);
    dev.write([0xf4, 0x34]);
    dev.write([0xf6]);
    expect(dev.read(2)).toEqual([23843 >> 8, 23843 & 0xff]);
  });
});
