// A sample FIFO that fills at the chip's configured sample rate (MAX30102/MAX30105 pulse oximeters). The pointer and
// overflow registers live in the chip's register store, so a driver can read and clear them as on the real part.
import type { FifoSpec } from '../core/customParts';

type Field = { reg: string; mask: number; shift?: number };

/** One heartbeat (phase 0–1): a quick systolic rise, a slower fall with a small dicrotic bump. Peaks at 1. */
export function ppgShape(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.12) return Math.sin((p / 0.12) * (Math.PI / 2)) ** 2;
  const fall = Math.exp(-(p - 0.12) * 6);
  const notch = 0.12 * Math.exp(-(((p - 0.38) / 0.05) ** 2));
  return Math.min(1, fall + notch);
}

export class SampleFifo {
  private slots: number[][];
  private count = 0;
  private lastUs = -1;
  constructor(
    private spec: FifoSpec,
    private reg: (addr: number) => number,
    private setReg: (addr: number, v: number) => void,
    private value: (key: string) => number,
  ) {
    this.slots = Array.from({ length: spec.depth }, () => []);
  }
  private field(f: Field | undefined): number {
    if (!f) return 0;
    return (this.reg(Number(f.reg)) & f.mask) >> (f.shift ?? 0);
  }
  private get mask() {
    return this.spec.depth - 1;
  }
  /** How many channels each sample holds now (0 = not sampling). */
  channels(): number {
    const m = this.spec.mode;
    if (m.shutdownBit !== undefined && (this.reg(Number(m.reg)) >> m.shutdownBit) & 1) return 0;
    return m.channels[String(this.field(m))] ?? 0;
  }
  reset() {
    this.count = 0;
    this.lastUs = -1;
  }
  /** The driver wrote a pointer register: the unread count follows the pointers. */
  pointersWritten() {
    const s = this.spec;
    this.count = (this.reg(Number(s.writePtr)) - this.reg(Number(s.readPtr))) & this.mask;
  }
  isData(addr: number) {
    return addr === Number(this.spec.data);
  }
  /** Heartbeat phase, integrated so a changed heart rate bends the pulse train instead of jumping it. */
  private phase = 0;
  private phaseUs = 0;
  private sampleAt(tUs: number, nch: number): number[] {
    const s = this.spec;
    const bpm = Math.max(0, this.value(s.bpmControl));
    this.phase = (this.phase + ((bpm / 60) * Math.max(0, tUs - this.phaseUs)) / 1e6) % 1;
    this.phaseUs = tUs;
    const ph = this.phase;
    const res = s.resolution ? (s.resolution.bits[this.field(s.resolution)] ?? s.sampleBits) : s.sampleBits;
    const drop = s.sampleBits - res;
    const top = 2 ** s.sampleBits - 1;
    return s.channels.slice(0, nch).map((c) => {
      const depth = typeof c.depth === 'string' ? this.value(c.depth) : (c.depth ?? 0);
      const v = this.value(c.control) * (1 - Math.max(0, Math.min(1, depth)) * ppgShape(ph));
      const raw = Math.max(0, Math.min(top, Math.round(v)));
      return Math.floor(raw / 2 ** drop) * 2 ** drop; // left-justified: the low bits read 0 at lower resolution
    });
  }
  /** Add the samples taken since the last call. */
  advance(nowUs: number) {
    const s = this.spec;
    const nch = this.channels();
    const hz = s.rate.hz[this.field(s.rate)] ?? s.rate.hz[0];
    const avg = s.average ? (s.average.n[this.field(s.average)] ?? 1) : 1;
    const period = (1e6 * avg) / hz;
    if (!nch || this.lastUs < 0) {
      this.lastUs = nowUs;
      return;
    }
    // After a long gap only the last depth samples could still be in the FIFO; skip the rest.
    if (nowUs - this.lastUs > period * (s.depth * 2)) this.lastUs = nowUs - period * s.depth * 2;
    let st = s.status ? this.reg(Number(s.status.reg)) : 0;
    while (this.lastUs + period <= nowUs) {
      this.lastUs += period;
      this.push(this.sampleAt(this.lastUs - period / 2, nch));
      if (s.status?.readyBit !== undefined) st |= 1 << s.status.readyBit;
      const slots = s.status?.almostFullSlots ? this.field(s.status.almostFullSlots) : 0;
      if (s.status?.almostFullBit !== undefined && this.count >= s.depth - slots) st |= 1 << s.status.almostFullBit;
    }
    if (s.status) this.setReg(Number(s.status.reg), st);
  }
  private push(sample: number[]) {
    const s = this.spec;
    const wr = this.reg(Number(s.writePtr)) & this.mask;
    const rollover = s.rollover ? (this.reg(Number(s.rollover.reg)) >> s.rollover.bit) & 1 : 0;
    if (this.count >= s.depth) {
      this.setReg(Number(s.overflow), Math.min(this.mask, this.reg(Number(s.overflow)) + 1));
      if (!rollover) return;
      this.setReg(Number(s.readPtr), (this.reg(Number(s.readPtr)) + 1) & this.mask);
      this.count--;
    }
    this.slots[wr] = sample;
    this.setReg(Number(s.writePtr), (wr + 1) & this.mask);
    this.count++;
  }
  /** Bytes read from FIFO_DATA: whole samples pop and advance the read pointer. */
  read(n: number): number[] {
    const s = this.spec;
    const nch = Math.max(1, this.channels());
    const per = s.bytes * nch;
    const out: number[] = [];
    while (out.length < n) {
      const rd = this.reg(Number(s.readPtr)) & this.mask;
      const sample = this.slots[rd] ?? [];
      for (let c = 0; c < nch; c++) {
        const v = sample[c] ?? 0;
        for (let b = s.bytes - 1; b >= 0; b--) out.push(Math.floor(v / 2 ** (8 * b)) & 0xff);
      }
      if (this.count > 0) {
        this.setReg(Number(s.readPtr), (rd + 1) & this.mask);
        this.count--;
      }
      if (per <= 0) break;
    }
    return out.slice(0, n);
  }
  /** Reading the interrupt status register clears it. */
  statusRead(addr: number) {
    if (this.spec.status && addr === Number(this.spec.status.reg)) this.setReg(addr, 0);
  }
}
