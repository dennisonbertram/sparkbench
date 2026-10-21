// I2S output for the simulator: machine.I2S writes land here as raw sample bytes. Each port keeps the last
// ~100 ms of audio per channel, plays out at its sample rate through a buffer of `ibuf` bytes (so write()
// blocks only once the buffer is full, like the real driver), and reports the dominant frequency and level
// of what is playing for amplifiers such as the MAX98357A.

export interface I2SPort {
  id: number;
  sck: number;
  ws: number;
  sd: number;
  bits: 16 | 32;
  stereo: boolean;
  rate: number;
  ibuf: number;
  /** Simulated time (µs) when the last queued sample finishes playing. */
  playEndUs: number;
  left: Float32Array;
  right: Float32Array;
  filled: number;
}

const WINDOW_S = 0.1;

export function openPort(id: number, sck: number, ws: number, sd: number, bits: 16 | 32, stereo: boolean, rate: number, ibuf: number): I2SPort {
  const n = Math.max(16, Math.round(rate * WINDOW_S));
  return { id, sck, ws, sd, bits, stereo, rate, ibuf, playEndUs: 0, left: new Float32Array(n), right: new Float32Array(n), filled: 0 };
}

/** Queue little-endian signed samples; returns how long (µs) write() must block for buffer space. */
export function writeSamples(p: I2SPort, bytes: number[], nowUs: number): { frames: number; blockUs: number } {
  const bps = p.bits / 8;
  const frameBytes = bps * (p.stereo ? 2 : 1);
  const frames = Math.floor(bytes.length / frameBytes);
  const full = 2 ** (p.bits - 1);
  const sample = (off: number) => {
    let v = 0;
    for (let i = bps - 1; i >= 0; i--) v = v * 256 + bytes[off + i];
    if (v >= full) v -= 2 * full;
    return v / full;
  };
  const n = p.left.length;
  // Slide the window by the new frames, then fill its tail.
  const keep = Math.max(0, n - frames);
  p.left.copyWithin(0, n - keep);
  p.right.copyWithin(0, n - keep);
  for (let f = Math.max(0, frames - n); f < frames; f++) {
    const at = keep + f - Math.max(0, frames - n);
    const l = sample(f * frameBytes);
    p.left[at] = l;
    p.right[at] = p.stereo ? sample(f * frameBytes + bps) : l;
  }
  p.filled = Math.min(n, p.filled + frames);
  const durUs = (frames / p.rate) * 1e6;
  p.playEndUs = Math.max(p.playEndUs, nowUs) + durUs;
  const bufferUs = (p.ibuf / frameBytes / p.rate) * 1e6;
  return { frames, blockUs: Math.max(0, p.playEndUs - bufferUs - nowUs) };
}

/** Dominant frequency (zero crossings with hysteresis) and RMS level (0–1) of a channel mix. */
export function analyse(p: I2SPort, mix: 'left' | 'right' | 'mix'): { hz: number; level: number } {
  const n = p.filled;
  if (n < 8) return { hz: 0, level: 0 };
  const start = p.left.length - n;
  const s = (i: number) => (mix === 'left' ? p.left[i] : mix === 'right' ? p.right[i] : (p.left[i] + p.right[i]) / 2);
  let mean = 0;
  for (let i = start; i < p.left.length; i++) mean += s(i);
  mean /= n;
  let sq = 0;
  let peak = 0;
  for (let i = start; i < p.left.length; i++) {
    const v = s(i) - mean;
    sq += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const level = Math.sqrt(sq / n);
  if (peak < 1e-4) return { hz: 0, level: 0 };
  const th = peak * 0.1;
  let state = 0;
  let crossings = 0;
  let first = -1;
  let last = -1;
  for (let i = start; i < p.left.length; i++) {
    const v = s(i) - mean;
    const ns = v > th ? 1 : v < -th ? -1 : state;
    if (ns !== state && state !== 0) {
      crossings++;
      if (first < 0) first = i;
      last = i;
    }
    state = ns;
  }
  if (crossings < 2 || last <= first) return { hz: 0, level };
  return { hz: Math.round(((crossings - 1) / 2) * (p.rate / (last - first))), level };
}

/** MicroPython's I2S.shift: shift every sample in place (positive = left). */
export function shiftSamples(bytes: number[], bits: number, shift: number): number[] {
  const bps = bits / 8;
  const full = 2 ** (bits - 1);
  const out = bytes.slice();
  for (let off = 0; off + bps <= out.length; off += bps) {
    let v = 0;
    for (let i = bps - 1; i >= 0; i--) v = v * 256 + out[off + i];
    if (v >= full) v -= 2 * full;
    v = shift >= 0 ? v * 2 ** shift : Math.floor(v / 2 ** -shift);
    v = ((v % (2 * full)) + 2 * full) % (2 * full);
    for (let i = 0; i < bps; i++) {
      out[off + i] = v % 256;
      v = Math.floor(v / 256);
    }
  }
  return out;
}
