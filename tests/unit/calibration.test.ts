import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evalProgram, parseProgram, solveMonotonic } from '../../src/core/expr';
import { crc4Ms5611 } from '../../src/core/calibration';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';
import { GenericI2CDevice } from '../../src/sim/devices';

const fixture = (n: string): CustomPartSpec => JSON.parse(readFileSync(`tests/fixtures/parts/${n}.json`, 'utf8'));
const run = (src: string, vars: Record<string, number> = {}, reg?: (a: number) => number) => evalProgram(parseProgram(src), vars, reg);
/** A GenericI2CDevice built from a fixture the way the engine builds it, with settable sliders. */
function chip(spec: CustomPartSpec, values: Record<string, number>) {
  const s = spec.sim;
  return new GenericI2CDevice('u', spec.i2cAddress!, s.registers ?? {}, [...(s.measure ? [s.measure] : []), ...(s.measures ?? [])], (k) => values[k] ?? 0, s.responses ?? [], { constants: s.constants, commandLatch: s.commandLatch, promCrc4: s.promCrc4, dac: s.dac });
}

describe('formula language', () => {
  it('follows arithmetic precedence', () => {
    expect(run('1 + 2 * 3 ^ 2')).toBe(19);
    expect(run('2 ^ 3 ^ 2')).toBe(512);
    expect(run('-2 ^ 2')).toBe(-4);
    expect(run('(1 + 2) * 0x10 / 4')).toBe(12);
    expect(run('1.5e3 - 2')).toBe(1498);
  });
  it('has steps, comparisons and functions', () => {
    expect(run('a = x * 2; b = a + 1; b * 10', { x: 3 })).toBe(70);
    expect(run('if(x < 0, -1, 1) * abs(x)', { x: -4 })).toBe(-4);
    expect(run('signed(0xFFFF, 16) + signed(5, 16)')).toBe(4);
    expect(run('mod(0x1B, 16) + floor(0x1B / 16) + min(3, 4) + max(3, 4)')).toBe(11 + 1 + 3 + 4);
    expect(run('reg(0xA2) * 256 + reg(0xA3)', {}, (a) => (a === 0xa2 ? 0x9c : 0xbf))).toBe(40127);
  });
  it('rejects bad formulas with a readable message', () => {
    expect(() => parseProgram('pow(2, 3)')).toThrow(/unknown function pow/);
    expect(() => parseProgram('1 + ')).toThrow(/end/);
    expect(() => parseProgram('1 2')).toThrow(/unexpected "2"/);
    expect(() => parseProgram('x; y')).toThrow();
    expect(() => run('y + 1')).toThrow(/unknown name y/);
    expect(() => parseProgram('import("fs")')).toThrow();
  });
  it('inverts rising and falling functions to the nearest integer', () => {
    expect(solveMonotonic((r) => r / 10, 12.34, 0, 1000)).toBe(123);
    expect(solveMonotonic((r) => -3 * r, -300, 0, 1000)).toBe(100);
    expect(solveMonotonic((r) => r, 5000, 0, 1000)).toBe(1000);
  });
});

describe('MS5611', () => {
  it('computes the AN520 PROM CRC-4 example', () => {
    expect(crc4Ms5611([0x3132, 0x3334, 0x3536, 0x3738, 0x3940, 0x4142, 0x4344, 0x4500])).toBe(0x0b);
  });
  it("matches the datasheet's worked example (D1 9085466, D2 8569150 → 20.07 °C, 1000.09 mbar)", () => {
    const s = fixture('ms5611').sim;
    const [t, p] = s.measures!;
    const C = { C1: 40127, C2: 36924, C3: 23317, C4: 23282, C5: 33464, C6: 28312 };
    expect(run(t.solve!.formula, { ...C, D2: 8569150 })).toBeCloseTo(20.0798, 3);
    expect(run(p.solve!.formula, { ...C, D1: 9085466, D2: 8569150 })).toBeCloseTo(1000.09, 1);
  });
  it('answers the real command sequence, and the datasheet integer maths reads the sliders back', () => {
    const spec = fixture('ms5611');
    for (const [temp, mbar] of [[20.07, 1000.09], [-20, 850], [-25, 1100.5], [60, 300]]) {
      const dev = chip(spec, { temperature: temp, value: mbar });
      const word = (cmd: number) => (dev.write([cmd]), dev.read(2)).reduce((a, b) => a * 256 + b, 0);
      const C = Array.from({ length: 8 }, (_, i) => word(0xa0 + 2 * i));
      expect(C.slice(1, 7)).toEqual([40127, 36924, 23317, 23282, 33464, 28312]);
      expect(C[7] & 0xf).toBe(crc4Ms5611(C));
      const adc = (conv: number) => {
        dev.write([conv]);
        dev.write([0x00]);
        return dev.read(3).reduce((a, b) => a * 256 + b, 0);
      };
      const D1 = BigInt(adc(0x48));
      const D2 = BigInt(adc(0x58));
      // Datasheet first- and second-order compensation in 64-bit integers.
      const c = C.map(BigInt);
      const dT = D2 - c[5] * 256n;
      let TEMP = 2000n + (dT * c[6]) / 8388608n;
      let OFF = c[2] * 65536n + (c[4] * dT) / 128n;
      let SENS = c[1] * 32768n + (c[3] * dT) / 256n;
      if (TEMP < 2000n) {
        const T2 = (dT * dT) / 2147483648n;
        let OFF2 = (5n * (TEMP - 2000n) ** 2n) / 2n;
        let SENS2 = (5n * (TEMP - 2000n) ** 2n) / 4n;
        if (TEMP < -1500n) {
          OFF2 += 7n * (TEMP + 1500n) ** 2n;
          SENS2 += (11n * (TEMP + 1500n) ** 2n) / 2n;
        }
        TEMP -= T2;
        OFF -= OFF2;
        SENS -= SENS2;
      }
      const P = ((D1 * SENS) / 2097152n - OFF) / 32768n;
      expect(Math.abs(Number(TEMP) / 100 - temp)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(Number(P) / 100 - mbar)).toBeLessThanOrEqual(0.03);
    }
  });
  it('returns nothing from the ADC before a conversion is started', () => {
    const dev = chip(fixture('ms5611'), { temperature: 20, value: 1000 });
    dev.write([0x00]);
    expect(dev.read(3)).toEqual([0, 0, 0]);
  });
});

describe('QMP6988', () => {
  // M5Stack's integer driver (M5Unit-ENV QMP6988.cpp), ported with BigInt: an independent decoder of the raws.
  function m5Decode(c: number[], rawP: number, rawT: number) {
    const s16 = (i: number) => BigInt((((c[i] << 8) | c[i + 1]) << 16) >> 16);
    const s20 = (v: number) => BigInt(v >= 524288 ? v - 1048576 : v);
    const a0 = s20((c[18] << 12) | (c[19] << 4) | (c[24] & 0x0f));
    const b00 = s20((c[0] << 12) | (c[1] << 4) | (c[24] >> 4));
    const a1 = 3608n * s16(20) - 1731677965n;
    const a2 = 16889n * s16(22) - 87619360n;
    const bt1 = 2982n * s16(2) + 107370906n;
    const bt2 = 329854n * s16(4) + 108083093n;
    const bp1 = 19923n * s16(6) + 1133836764n;
    const b11 = 2406n * s16(8) + 118215883n;
    const bp2 = 3079n * s16(10) - 181579595n;
    const b12 = 6846n * s16(12) + 85590281n;
    const b21 = 13836n * s16(14) + 79333336n;
    const bp3 = 2915n * s16(16) + 157155561n;
    const dt = BigInt(rawT - 8388608);
    const dp = BigInt(rawP - 8388608);
    let wk1 = a1 * dt;
    let wk2 = (a2 * dt) >> 14n;
    wk2 = (wk2 * dt) >> 10n;
    wk2 = ((wk1 + wk2) / 32767n) >> 19n;
    const tx = (a0 + wk2) >> 4n;
    wk1 = bt1 * tx;
    wk2 = (bp1 * dp) >> 5n;
    wk1 += wk2;
    wk2 = (bt2 * tx) >> 1n;
    wk2 = (wk2 * tx) >> 8n;
    let wk3 = wk2;
    wk2 = (b11 * tx) >> 4n;
    wk2 = (wk2 * dp) >> 1n;
    wk3 += wk2;
    wk2 = (bp2 * dp) >> 13n;
    wk2 = (wk2 * dp) >> 1n;
    wk3 += wk2;
    wk1 += wk3 >> 14n;
    wk2 = b12 * tx;
    wk2 = (wk2 * tx) >> 22n;
    wk2 = (wk2 * dp) >> 1n;
    wk3 = wk2;
    wk2 = (b21 * tx) >> 6n;
    wk2 = (wk2 * dp) >> 23n;
    wk2 = (wk2 * dp) >> 1n;
    wk3 += wk2;
    wk2 = (bp3 * dp) >> 12n;
    wk2 = (wk2 * dp) >> 23n;
    wk2 = wk2 * dp;
    wk3 += wk2;
    wk1 += wk3 >> 15n;
    wk1 /= 32767n;
    wk1 >>= 11n;
    wk1 += b00;
    return { tempC: Number(tx) / 256, hPa: Number(wk1) / 16 / 100 };
  }
  it("encodes raws that M5Stack's integer driver decodes to the slider values", () => {
    const spec = fixture('qmp6988');
    for (const [temp, hPa] of [[25, 1013.25], [-10, 950], [60, 1090], [5, 320]]) {
      const dev = chip(spec, { temperature: temp, value: hPa });
      dev.write([0xa0]);
      const cal = dev.read(25);
      dev.write([0xf7]);
      const d = dev.read(6);
      const r = m5Decode(cal, (d[0] << 16) | (d[1] << 8) | d[2], (d[3] << 16) | (d[4] << 8) | d[5]);
      expect(Math.abs(r.tempC - temp)).toBeLessThan(0.02);
      expect(Math.abs(r.hPa - hPa)).toBeLessThan(0.05);
    }
  });
  it('makes the pressure raw depend on temperature, as the real chip does', () => {
    const spec = fixture('qmp6988');
    const raw = (temp: number) => {
      const dev = chip(spec, { temperature: temp, value: 1000 });
      dev.write([0xf7]);
      return dev.read(3).reduce((a, b) => a * 256 + b, 0);
    };
    expect(raw(0)).not.toBe(raw(40));
  });
});

describe('solve validation', () => {
  const ms = () => fixture('ms5611');
  it('accepts the fixtures', () => {
    for (const f of ['ms5611', 'qmp6988', 'mcp4725', 'mcp4728']) expect(validateSpec(fixture(f))).toEqual([]);
  });
  it('rejects a formula that is not monotonic, unknown names, and an unreachable slider range', () => {
    const a = ms();
    a.sim.measures![0].solve!.formula = '(D2 - 8388608)^2 / 1e10';
    expect(validateSpec(a).join(' ')).toMatch(/rise \(or fall\) steadily/);
    const b = ms();
    b.sim.measures![1].solve!.formula = 'D1 * C9';
    expect(validateSpec(b).join(' ')).toMatch(/uses C9/);
    const c = ms();
    c.sim.measures![0].solve!.max = 8566784 + 100;
    expect(validateSpec(c).join(' ')).toMatch(/only reaches/);
    const d = ms();
    d.sim.constants!.C1 = 'reg(0xA2) * 256 +';
    expect(validateSpec(d).join(' ')).toMatch(/constant C1/);
  });
  it('checks DAC pins', () => {
    const s = fixture('mcp4728');
    s.sim.dac!.pins = ['VA'];
    expect(validateSpec(s).join(' ')).toMatch(/drives 4 pins/);
  });
});

describe('DACs', () => {
  it('MCP4725: fast mode, write-DAC command, readback and power-down', () => {
    const outs: any[] = [];
    const s = fixture('mcp4725');
    const dev = new GenericI2CDevice('u', 0x62, {}, [], () => 0, [], { dac: s.sim.dac, onDac: (ch, d) => outs.push({ ch, ...d }) });
    dev.write([0x04, 0xd2]);
    expect(outs.at(-1)).toMatchObject({ ch: 0, code: 0x4d2, pd: 0 });
    dev.write([0x60, 0xab, 0xc0]);
    expect(outs.at(-1)).toMatchObject({ code: 0xabc, pd: 0 });
    expect(dev.read(5)).toEqual([0xc0, 0xab, 0xc0, 0x0a, 0xbc]);
    dev.write([0x20 | 0x0a, 0xbc]);
    expect(outs.at(-1)).toMatchObject({ code: 0xabc, pd: 2 });
  });
  it('MCP4728: multi-write with UDAC, sequential, references and gain', () => {
    const outs: any[] = [];
    const s = fixture('mcp4728');
    const dev = new GenericI2CDevice('u', 0x60, {}, [], () => 0, [], { dac: s.sim.dac, onDac: (ch, d) => outs.push({ ch, ...d }) });
    dev.write([0x41, 0x81, 0x00]); // channel A, UDAC = 1: held
    expect(outs).toEqual([]);
    dev.write([0x42, 0x90, 0x10]); // channel B, internal reference, gain 2
    expect(outs.at(-1)).toMatchObject({ ch: 1, vref: 1, gain: 2, code: 0x010 });
    dev.write([0x54, 0x01, 0x23, 0x04, 0x56]); // sequential from C
    expect(outs.slice(-2).map((o) => [o.ch, o.code])).toEqual([[2, 0x123], [3, 0x456]]);
    dev.write([0x8f]);
    expect(outs.slice(-4).every((o) => o.vref === 1)).toBe(true);
  });
});
