// Calibrated sensors whose raw counts go through the datasheet's compensation maths (MS5611, QMP6988…).
// The part declares the FORWARD formula (raw counts + calibration constants → physical value) and the
// simulator inverts it numerically, so a real driver doing the datasheet maths reads back the slider value.
// Shared by the simulator (src/sim/devices.ts) and spec validation (customParts.ts).
import { evalProgram, freeNames, parseProgram, solveMonotonic, type Program } from './expr';
import type { I2CMeasure } from './customParts';

/** MS5611 / MS56xx PROM CRC-4 (TE application note AN520): over the 8 PROM words with the CRC nibble (low 4 bits
 * of word 7) taken as 0. */
export function crc4Ms5611(words: number[]): number {
  const w = words.slice(0, 8).map((x) => x & 0xffff);
  while (w.length < 8) w.push(0);
  w[7] &= 0xff00;
  let rem = 0;
  for (let cnt = 0; cnt < 16; cnt++) {
    rem ^= cnt % 2 === 1 ? w[cnt >> 1] & 0x00ff : w[cnt >> 1] >> 8;
    for (let b = 8; b > 0; b--) rem = rem & 0x8000 ? ((rem << 1) ^ 0x3000) & 0xffff : (rem << 1) & 0xffff;
  }
  return (rem >> 12) & 0x0f;
}

/** The chip's byte registers with a declared PROM CRC filled in (what the driver will read). */
export function withPromCrc(registers: Record<string, number>, promCrc4?: { reg: string }): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(registers)) out[Number(k)] = v;
  if (promCrc4) {
    const base = Number(promCrc4.reg);
    const words = Array.from({ length: 8 }, (_, i) => (((out[base + 2 * i] ?? 0) & 0xff) << 8) | ((out[base + 2 * i + 1] ?? 0) & 0xff));
    out[base + 15] = ((out[base + 15] ?? 0) & 0xf0) | crc4Ms5611(words);
  }
  return out;
}

export interface Solver {
  /** Raw counts for every solve measure, in order (later formulas see earlier raws by name). */
  solve(value: (key: string) => number): Map<I2CMeasure, number>;
  /** The constants as evaluated (for messages and tests). */
  constants(): Record<string, number>;
}

/** Compile a chip's constants and solve measures. `reg` reads one register (a byte, or a word on 16-bit chips). */
export function makeSolver(constants: Record<string, number | string> | undefined, measures: I2CMeasure[], reg: (addr: number) => number): Solver {
  const constProgs = Object.entries(constants ?? {}).map(([name, v]) => ({ name, v: typeof v === 'number' ? v : parseProgram(v) }));
  const solveMs = measures.filter((m) => m.solve).map((m) => ({ m, prog: parseProgram(m.solve!.formula) }));
  let env: Record<string, number> | null = null;
  const consts = () => {
    if (env) return env;
    const e: Record<string, number> = {};
    for (const c of constProgs) e[c.name] = typeof c.v === 'number' ? c.v : evalProgram(c.v as Program, e, reg);
    return (env = e);
  };
  return {
    constants: consts,
    solve(value) {
      const vars = { ...consts() };
      const out = new Map<I2CMeasure, number>();
      for (const { m, prog } of solveMs) {
        const s = m.solve!;
        const f = (raw: number) => evalProgram(prog, { ...vars, [s.raw]: raw }, reg);
        const raw = solveMonotonic(f, value(m.control ?? 'value'), s.min, s.max);
        vars[s.raw] = raw;
        out.set(m, raw);
      }
      return out;
    },
  };
}

/** Spec checks for solve measures: formulas parse, use only known names, are monotonic over the raw range and can
 * reach the whole slider range (with the other sliders at their defaults). */
export function checkSolve(
  constants: Record<string, number | string> | undefined,
  measures: I2CMeasure[],
  reg: (addr: number) => number,
  range: (control: string) => { min: number; max: number; def: number } | undefined,
): string[] {
  const errs: string[] = [];
  const known = new Set<string>();
  for (const [name, v] of Object.entries(constants ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) errs.push(`constant name "${name}" must be a plain identifier`);
    if (typeof v === 'string') {
      try {
        const missing = freeNames(parseProgram(v)).filter((n) => !known.has(n));
        if (missing.length) errs.push(`constant ${name} uses ${missing.join(', ')} before it is defined`);
      } catch (e: any) {
        errs.push(`constant ${name}: ${e.message}`);
      }
    }
    known.add(name);
  }
  const solveMs = measures.filter((m) => m.solve);
  for (const m of solveMs) {
    const s = m.solve!;
    try {
      const missing = freeNames(parseProgram(s.formula)).filter((n) => n !== s.raw && !known.has(n));
      if (missing.length) errs.push(`solve formula for ${s.raw} uses ${missing.join(', ')}, which is not a constant or an earlier raw`);
    } catch (e: any) {
      errs.push(`solve formula for ${s.raw}: ${e.message}`);
    }
    if (!(Number.isInteger(s.min) && Number.isInteger(s.max) && s.min < s.max)) errs.push(`solve ${s.raw}: min and max must be integers with min < max`);
    if (known.has(s.raw)) errs.push(`solve raw name ${s.raw} is already a constant or raw`);
    known.add(s.raw);
  }
  if (errs.length || !solveMs.length) return errs;
  // Numerics: solve at the defaults, then check each formula's shape around that point.
  try {
    const solver = makeSolver(constants, measures, reg);
    const vars: Record<string, number> = { ...solver.constants() };
    for (const m of solveMs) {
      const s = m.solve!;
      const r = range(m.control ?? 'value');
      if (!r) {
        errs.push(`solve ${s.raw}: control ${m.control ?? 'value'} has no range`);
        continue;
      }
      const prog = parseProgram(s.formula);
      const f = (raw: number) => evalProgram(prog, { ...vars, [s.raw]: raw }, reg);
      const N = 128;
      const ys = Array.from({ length: N + 1 }, (_, i) => f(Math.round(s.min + ((s.max - s.min) * i) / N)));
      if (ys.some((y) => !Number.isFinite(y))) {
        errs.push(`solve ${s.raw}: the formula is not finite over ${s.min}…${s.max}`);
        continue;
      }
      const up = ys[N] >= ys[0];
      if (ys.some((y, i) => i > 0 && (up ? y < ys[i - 1] : y > ys[i - 1]))) errs.push(`solve ${s.raw}: the formula must rise (or fall) steadily over ${s.min}…${s.max}`);
      const lo = Math.min(ys[0], ys[N]);
      const hi = Math.max(ys[0], ys[N]);
      if (r.min < lo - 1e-9 * Math.abs(lo) || r.max > hi + 1e-9 * Math.abs(hi)) errs.push(`solve ${s.raw}: raw ${s.min}…${s.max} only reaches ${+lo.toPrecision(6)}…${+hi.toPrecision(6)}, not the slider's ${r.min}…${r.max}`);
      vars[s.raw] = solveMonotonic(f, r.def, s.min, s.max);
    }
  } catch (e: any) {
    errs.push(`solve: ${e.message}`);
  }
  return errs;
}
