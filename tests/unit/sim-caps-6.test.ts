// Sample FIFOs (MAX30102), the MFRC522 RFID reader and NEC IR receivers.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GenericI2CDevice } from '../../src/sim/devices';
import { ppgShape } from '../../src/sim/fifo';
import { MFRC522Device, crcA } from '../../src/sim/mfrc522';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';

const fixture = (f: string): CustomPartSpec => JSON.parse(readFileSync(`tests/fixtures/parts/${f}`, 'utf8'));

describe('sample FIFO (MAX30102)', () => {
  const spec = fixture('max30102.json');
  const make = (vals: Record<string, number> = {}) => {
    let now = 0;
    const v = { value: 60, ir: 100000, red: 50000, irPulse: 0, redPulse: 0, ...vals };
    const d = new GenericI2CDevice('u', 0x57, spec.sim.registers!, [], (k) => (v as any)[k] ?? 0, [], { nowMs: () => now, fifo: spec.sim.fifo, selfClearing: spec.sim.selfClearing });
    const w = (r: number, x: number) => d.write([r, x]);
    const r8 = (r: number) => (d.write([r]), d.read(1)[0]);
    return { d, w, r8, at: (ms: number) => (now = ms) };
  };

  it('fills at the configured rate and pops whole samples from FIFO_DATA', () => {
    const { d, w, r8, at } = make();
    w(0x0a, 0x27); // 100 Hz, 18-bit
    w(0x09, 0x03); // SpO2 mode: red + IR
    at(105);
    expect((r8(0x04) - r8(0x06)) & 31).toBe(10);
    d.write([0x07]);
    const b = d.read(12);
    expect((b[0] << 16) | (b[1] << 8) | b[2]).toBe(50000);
    expect((b[3] << 16) | (b[4] << 8) | b[5]).toBe(100000);
    expect(r8(0x06)).toBe(2);
  });

  it('drops (no rollover) or overwrites (rollover) when full, counting overflows', () => {
    const a = make();
    a.w(0x0a, 0x27);
    a.w(0x09, 0x03);
    a.at(400); // 40 samples into a 32-deep FIFO
    expect(a.r8(0x05)).toBe(8);
    expect(a.r8(0x06)).toBe(0);
    const b = make();
    b.w(0x08, 0x10);
    b.w(0x0a, 0x27);
    b.w(0x09, 0x03);
    b.at(400);
    expect(b.r8(0x05)).toBe(8);
    expect(b.r8(0x06)).toBe(8);
    expect(b.r8(0x04)).toBe(8);
  });

  it('left-justifies lower resolutions and averages samples', () => {
    const { d, w, at } = make({ ir: 100003, red: 50001 });
    w(0x08, 0x40); // average 4
    w(0x0a, 0x24); // 100 Hz, 15-bit
    w(0x09, 0x02); // heart-rate mode: red only
    at(45);
    d.write([0x04]);
    expect(d.read(1)[0]).toBe(1); // 25 entries a second
    d.write([0x07]);
    const b = d.read(3);
    expect((b[0] << 16) | (b[1] << 8) | b[2]).toBe(50001 & ~7);
  });

  it('soft reset restores the registers and clears itself; status clears when read', () => {
    const { w, r8, at } = make();
    w(0x0a, 0x27);
    w(0x09, 0x03);
    at(50);
    expect(r8(0x00) & 0x40).toBe(0x40);
    expect(r8(0x00)).toBe(0);
    w(0x09, 0x40);
    expect(r8(0x09)).toBe(0);
    expect(r8(0x0a)).toBe(0);
    expect(r8(0x04)).toBe(0);
    expect(r8(0xff)).toBe(0x15);
  });

  it('beats once per period with a dip in reflected light', () => {
    expect(ppgShape(0.12)).toBeCloseTo(1, 5);
    expect(ppgShape(0.9)).toBeLessThan(0.05);
  });

  it('validates the FIFO description', () => {
    const bad = { ...spec, sim: { ...spec.sim, fifo: { ...spec.sim.fifo!, depth: 30, bpmControl: 'nope', channels: [{ control: 'x' }] } } };
    const errs = validateSpec(bad as CustomPartSpec).join(' ');
    expect(errs).toMatch(/power of two/);
    expect(errs).toMatch(/bpmControl/);
    expect(errs).toMatch(/channel control x/);
    expect(validateSpec(spec)).toEqual([]);
  });
});

describe('MFRC522 reader', () => {
  const make = () => {
    const card = { present: true, uid: 0xdeadbeef };
    let now = 0;
    const d = new MFRC522Device('u', 0x92, () => card, () => now);
    // SPI register access as the datasheet frames it: address byte (bit 7 = read), then data.
    const w = (r: number, v: number) => (d.select(), d.transfer([(r << 1) & 0x7e, v]));
    const rd = (r: number) => (d.select(), d.transfer([((r << 1) & 0x7e) | 0x80, 0])[1]);
    const xfer = (frame: number[], txLast = 0) => {
      w(0x01, 0x00);
      w(0x0a, 0x80);
      w(0x04, 0x7f);
      for (const b of frame) w(0x09, b);
      w(0x0d, txLast);
      w(0x01, 0x0c);
      w(0x0d, 0x80 | txLast);
      const n = rd(0x0a);
      return { irq: rd(0x04), bytes: Array.from({ length: n }, () => rd(0x09)), last: rd(0x0c) & 7 };
    };
    w(0x01, 0x0f);
    w(0x2a, 0x8d);
    w(0x2b, 0x3e);
    w(0x2d, 30);
    w(0x11, 0x3d);
    w(0x14, 0x83);
    return { d, w, rd, xfer, card, at: (us: number) => (now = us) };
  };
  const sel = (uid: number[]) => {
    const f = [0x93, 0x70, ...uid, uid.reduce((a, b) => a ^ b, 0)];
    const c = crcA(f);
    return [...f, c & 0xff, c >> 8];
  };

  it('computes CRC_A as ISO 14443-3 (HLTA = 50 00 57 CD)', () => {
    expect(crcA([0x50, 0x00])).toBe(0xcd57);
    const { w, rd } = make();
    for (const b of [0x50, 0x00]) w(0x09, b);
    w(0x01, 0x03);
    expect(rd(0x05) & 0x04).toBe(0x04);
    expect([rd(0x22), rd(0x21)]).toEqual([0x57, 0xcd]);
  });

  it('answers REQA, anticollision and SELECT like a MIFARE Classic 1K card', () => {
    const { xfer, rd } = make();
    expect(rd(0x37)).toBe(0x92);
    expect(xfer([0x26], 7).bytes).toEqual([0x04, 0x00]);
    expect(xfer([0x93, 0x20]).bytes).toEqual([0xde, 0xad, 0xbe, 0xef, 0xde ^ 0xad ^ 0xbe ^ 0xef]);
    const sak = xfer(sel([0xde, 0xad, 0xbe, 0xef])).bytes;
    expect(sak[0]).toBe(0x08);
    expect(sak.length).toBe(3);
  });

  it('REQA needs a 7-bit short frame; a halted card only wakes on WUPA', () => {
    const { xfer } = make();
    expect(xfer([0x26], 0).bytes).toEqual([]);
    expect(xfer([0x26], 7).bytes.length).toBe(2);
    xfer([0x93, 0x20]);
    xfer(sel([0xde, 0xad, 0xbe, 0xef]));
    const c = crcA([0x50, 0x00]);
    expect(xfer([0x50, 0x00, c & 0xff, c >> 8]).bytes).toEqual([]);
    expect(xfer([0x26], 7).bytes).toEqual([]);
    expect(xfer([0x52], 7).bytes).toEqual([0x04, 0x00]);
  });

  it('times out with TimerIRq when no card answers, and the card resets when the field goes off', () => {
    const m = make();
    m.card.present = false;
    const r = m.xfer([0x26], 7);
    expect(r.irq & 0x20).toBe(0);
    m.at(16000); // (2·0xD3E + 1)(30 + 1) / 13.56 MHz ≈ 15.5 ms
    expect(m.rd(0x04) & 0x01).toBe(1);
    m.card.present = true;
    expect(m.xfer([0x26], 7).bytes.length).toBe(2);
    m.w(0x14, 0x80); // antenna off
    m.w(0x14, 0x83);
    expect(m.xfer([0x26], 7).bytes.length).toBe(2);
  });

  it('refuses MIFARE authentication (Crypto1 is not modelled) and NAKs an unauthenticated READ', () => {
    const { w, rd, xfer } = make();
    xfer([0x26], 7);
    xfer([0x93, 0x20]);
    xfer(sel([0xde, 0xad, 0xbe, 0xef]));
    const c = crcA([0x30, 4]);
    const r = xfer([0x30, 4, c & 0xff, c >> 8]);
    expect(r.bytes).toEqual([0x04]);
    expect(r.last).toBe(4);
    w(0x01, 0x0e);
    expect(rd(0x06) & 0x1b).not.toBe(0);
  });
});

describe('IR receiver and RFID reader specs', () => {
  it('validates the new kinds', () => {
    const ir = fixture('vs1838b.json');
    expect(validateSpec(ir)).toEqual([]);
    expect(validateSpec({ ...ir, sim: { ...ir.sim, outputPin: 'NOPE', ir: { protocol: 'rc5' as any } } }).join(' ')).toMatch(/outputPin.*\n?|protocol/);
    const rf = fixture('rc522.json');
    expect(validateSpec(rf)).toEqual([]);
    expect(validateSpec({ ...rf, pins: rf.pins.filter((p) => p.fn !== 'spi.miso') }).join(' ')).toMatch(/spi.miso/);
  });
});
