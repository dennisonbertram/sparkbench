// A small, dependency-free circuit solver (Modified Nodal Analysis, Norton form).
// Every source is modelled as a Norton equivalent (current source ∥ conductance), so the
// only unknowns are node voltages. Nonlinear parts (diodes, LEDs, BJTs) use Newton–Raphson
// with SPICE-style junction voltage limiting. Capacitors use backward-Euler companions.

export const VT = 0.025852; // thermal voltage at 27 °C
const GMIN = 1e-12;

export interface Stamp {
  G: Float64Array[]; // conductance matrix (n x n)
  I: Float64Array; // current injection vector
  limited?: boolean; // set by nonlinear elements when junction limiting kicked in (not yet converged)
}

export interface Element {
  name: string;
  nodes: number[]; // node indices, -1 = ground
  nonlinear?: boolean;
  stamp(s: Stamp, x: Float64Array, ctx: SolveCtx): void;
  /** Called after a transient step converged. */
  accept?(x: Float64Array, ctx: SolveCtx): void;
  /** Branch current (positive into nodes[0]) for reporting. */
  current?(x: Float64Array): number;
}

export interface SolveCtx {
  dt: number; // 0 for DC operating point
  time: number;
}

const v = (x: Float64Array, n: number) => (n < 0 ? 0 : x[n]);

function addG(s: Stamp, a: number, b: number, g: number) {
  if (a >= 0) s.G[a][a] += g;
  if (b >= 0) s.G[b][b] += g;
  if (a >= 0 && b >= 0) {
    s.G[a][b] -= g;
    s.G[b][a] -= g;
  }
}
/** Current source pushing `i` amps from node a into node b (through the source). */
function addI(s: Stamp, a: number, b: number, i: number) {
  if (a >= 0) s.I[a] -= i;
  if (b >= 0) s.I[b] += i;
}

export class Resistor implements Element {
  nodes: number[];
  constructor(public name: string, a: number, b: number, public ohms: number) {
    this.nodes = [a, b];
  }
  stamp(s: Stamp) {
    addG(s, this.nodes[0], this.nodes[1], 1 / Math.max(this.ohms, 1e-6));
  }
  current(x: Float64Array) {
    return (v(x, this.nodes[0]) - v(x, this.nodes[1])) / Math.max(this.ohms, 1e-6);
  }
}

/** Voltage source with series resistance (Norton form). Positive terminal = nodes[0]. */
export class VSource implements Element {
  nodes: number[];
  constructor(public name: string, pos: number, neg: number, public volts: number, public rs = 0.05) {
    this.nodes = [pos, neg];
  }
  stamp(s: Stamp) {
    const g = 1 / this.rs;
    addG(s, this.nodes[0], this.nodes[1], g);
    addI(s, this.nodes[1], this.nodes[0], this.volts * g);
  }
  /** Current delivered out of the + terminal into the circuit. */
  current(x: Float64Array) {
    return (this.volts - (v(x, this.nodes[0]) - v(x, this.nodes[1]))) / this.rs;
  }
}

export class CurrentSink implements Element {
  nodes: number[];
  constructor(public name: string, a: number, b: number, public amps: number) {
    this.nodes = [a, b];
  }
  stamp(s: Stamp) {
    addI(s, this.nodes[0], this.nodes[1], this.amps);
  }
  current() {
    return this.amps;
  }
}

export class Capacitor implements Element {
  nodes: number[];
  vPrev = 0;
  constructor(public name: string, a: number, b: number, public farads: number, public v0 = 0) {
    this.nodes = [a, b];
    this.vPrev = v0;
  }
  stamp(s: Stamp, _x: Float64Array, ctx: SolveCtx) {
    if (ctx.dt <= 0) {
      addG(s, this.nodes[0], this.nodes[1], GMIN);
      return;
    }
    const g = this.farads / ctx.dt;
    addG(s, this.nodes[0], this.nodes[1], g);
    addI(s, this.nodes[1], this.nodes[0], g * this.vPrev);
  }
  accept(x: Float64Array) {
    this.vPrev = v(x, this.nodes[0]) - v(x, this.nodes[1]);
  }
  current(x: Float64Array) {
    return 0 * x[0];
  }
}

function pnjlim(vnew: number, vold: number, nvt: number, vcrit: number, s?: Stamp): number {
  const r = pnjlimRaw(vnew, vold, nvt, vcrit);
  if (s && Math.abs(r - vnew) > 1e-9) s.limited = true;
  return r;
}
function pnjlimRaw(vnew: number, vold: number, nvt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nvt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nvt;
      return arg > 0 ? vold + nvt * Math.log(arg) : vcrit;
    }
    return nvt * Math.log(vnew / nvt);
  }
  return vnew;
}

/** Junction diode / LED. nodes = [anode, cathode]. */
export class Diode implements Element {
  nodes: number[];
  nonlinear = true;
  vd = 0;
  nvt: number;
  vcrit: number;
  constructor(public name: string, a: number, k: number, public is: number, public n: number, public rs = 0) {
    this.nodes = [a, k];
    this.nvt = n * VT;
    this.vcrit = this.nvt * Math.log(this.nvt / (Math.SQRT2 * is));
  }
  stamp(s: Stamp, x: Float64Array) {
    let vd = v(x, this.nodes[0]) - v(x, this.nodes[1]);
    vd = pnjlim(vd, this.vd, this.nvt, this.vcrit, s);
    this.vd = vd;
    const e = Math.exp(Math.min(vd / this.nvt, 80));
    const id = this.is * (e - 1);
    const gd = (this.is * e) / this.nvt + GMIN;
    addG(s, this.nodes[0], this.nodes[1], gd);
    addI(s, this.nodes[0], this.nodes[1], id - gd * vd);
  }
  current(x: Float64Array) {
    const vd = v(x, this.nodes[0]) - v(x, this.nodes[1]);
    return this.is * (Math.exp(Math.min(vd / this.nvt, 80)) - 1);
  }
}

/** Shunt voltage reference (LM335-style, like a zener): sinks current from nodes[0] (+) to nodes[1] (−) once the
 * voltage across it passes `vz`, with dynamic impedance `rz`; it never sources current. The knee is a smooth
 * softplus (a few mV wide) so Newton–Raphson converges. */
export class ShuntRef implements Element {
  nodes: number[];
  nonlinear = true;
  static KNEE = 0.002;
  constructor(public name: string, pos: number, neg: number, public vz: number, public rz = 1) {
    this.nodes = [pos, neg];
  }
  private iv(vd: number): [number, number] {
    const k = ShuntRef.KNEE;
    const u = (vd - this.vz) / k;
    // softplus(u)·k / rz and its derivative (logistic(u) / rz), with overflow guards
    const sp = u > 30 ? u : Math.log1p(Math.exp(u));
    const sig = u > 30 ? 1 : u < -30 ? Math.exp(u) : 1 / (1 + Math.exp(-u));
    return [(sp * k) / this.rz, sig / this.rz];
  }
  stamp(s: Stamp, x: Float64Array) {
    const vd = v(x, this.nodes[0]) - v(x, this.nodes[1]);
    const [i, g] = this.iv(vd);
    addG(s, this.nodes[0], this.nodes[1], g + GMIN);
    addI(s, this.nodes[0], this.nodes[1], i - g * vd);
  }
  current(x: Float64Array) {
    return this.iv(v(x, this.nodes[0]) - v(x, this.nodes[1]))[0];
  }
}

/** NPN BJT, Ebers–Moll transport model. nodes = [C, B, E]. */
export class NPN implements Element {
  nodes: number[];
  nonlinear = true;
  vbe = 0;
  vbc = 0;
  vcrit: number;
  constructor(public name: string, c: number, b: number, e: number, public is = 1e-14, public bf = 200, public br = 3) {
    this.nodes = [c, b, e];
    this.vcrit = VT * Math.log(VT / (Math.SQRT2 * is));
  }
  stamp(s: Stamp, x: Float64Array) {
    const [c, b, e] = this.nodes;
    let vbe = v(x, b) - v(x, e);
    let vbc = v(x, b) - v(x, c);
    vbe = pnjlim(vbe, this.vbe, VT, this.vcrit, s);
    vbc = pnjlim(vbc, this.vbc, VT, this.vcrit, s);
    this.vbe = vbe;
    this.vbc = vbc;
    const ef = Math.exp(Math.min(vbe / VT, 80));
    const er = Math.exp(Math.min(vbc / VT, 80));
    const icc = this.is * (ef - er); // transport current C->E
    const ibe = (this.is / this.bf) * (ef - 1);
    const ibc = (this.is / this.br) * (er - 1);
    const gf = (this.is * ef) / VT;
    const gr = (this.is * er) / VT;
    const gpi = gf / this.bf + GMIN;
    const gmu = gr / this.br + GMIN;
    // Base-emitter diode
    addG(s, b, e, gpi);
    addI(s, b, e, ibe - gpi * vbe);
    // Base-collector diode
    addG(s, b, c, gmu);
    addI(s, b, c, ibc - gmu * vbc);
    // Transport current source from C to E: icc = f(vbe, vbc); linearise.
    // i_ce ≈ icc0 + gf·(vbe - vbe0) - gr·(vbc - vbc0)
    const ieq = icc - gf * vbe + gr * vbc;
    addI(s, c, e, ieq);
    // gf·vbe term: current C->E controlled by (vb - ve)
    if (c >= 0) {
      if (b >= 0) s.G[c][b] += gf - gr;
      if (e >= 0) s.G[c][e] -= gf;
      s.G[c][c] += gr;
    }
    if (e >= 0) {
      if (b >= 0) s.G[e][b] -= gf - gr;
      if (e >= 0) s.G[e][e] += gf;
      if (c >= 0) s.G[e][c] -= gr;
    }
  }
  current(x: Float64Array) {
    const [c, b, e] = this.nodes;
    const vbe = v(x, b) - v(x, e);
    const vbc = v(x, b) - v(x, c);
    const ef = Math.exp(Math.min(vbe / VT, 80));
    const er = Math.exp(Math.min(vbc / VT, 80));
    return this.is * (ef - er) - (this.is / this.br) * (er - 1); // collector current
  }
}

/** Behavioural NE555. nodes = [GND, TRIG, OUT, RESET, CTRL, THR, DIS, VCC]. */
export class Timer555 implements Element {
  nodes: number[];
  nonlinear = true;
  q = false; // flip-flop output
  constructor(public name: string, nodes: number[]) {
    this.nodes = nodes;
  }
  private evalState(x: Float64Array): boolean {
    const [gnd, trig, , reset, ctrl, thr, , vcc] = this.nodes;
    const vg = v(x, gnd);
    const vc = v(x, ctrl) - vg;
    if (v(x, vcc) - vg < 3) return false;
    if (v(x, reset) - vg < 0.7) return false;
    const vt = v(x, trig) - vg;
    const vth = v(x, thr) - vg;
    if (vt < vc / 2) return true;
    if (vth > vc) return false;
    return this.q;
  }
  stamp(s: Stamp, x: Float64Array) {
    const [gnd, , out, , ctrl, , dis, vcc] = this.nodes;
    // Internal divider 3 × 5 kΩ: VCC – CTRL – mid – GND (mid is lumped: CTRL sees 5k to VCC and 10k to GND)
    addG(s, vcc, ctrl, 1 / 5000);
    addG(s, ctrl, gnd, 1 / 10000);
    // Quiescent current
    addG(s, vcc, gnd, 1 / 3000);
    const q = this.q;
    const vccV = v(x, vcc) - v(x, gnd);
    const vout = q ? Math.max(vccV - 1.7, 0) : 0.1;
    // Output stage: Norton source referenced to GND, 10 Ω
    const g = 1 / 10;
    addG(s, out, gnd, g);
    addI(s, gnd, out, vout * g);
    // Discharge transistor: on when output low
    addG(s, dis, gnd, q ? 1e-9 : 1 / 10);
  }
  accept(x: Float64Array) {
    this.q = this.evalState(x);
  }
  /** Re-evaluate latch at DC operating point. */
  settle(x: Float64Array) {
    const nq = this.evalState(x);
    const changed = nq !== this.q;
    this.q = nq;
    return changed;
  }
}

/** A switch is just a resistor whose value the caller changes. */
export class Switch extends Resistor {
  constructor(name: string, a: number, b: number, public closed = false) {
    super(name, a, b, closed ? 0.05 : 1e9);
  }
  set(closed: boolean) {
    this.closed = closed;
    this.ohms = closed ? 0.05 : 1e9;
  }
}

export class Circuit {
  elements: Element[] = [];
  nodeNames: string[] = [];
  x: Float64Array = new Float64Array(0);
  time = 0;
  lastIterations = 0;
  converged = true;

  node(name: string): number {
    if (name === 'GND' || name === '0') return -1;
    let i = this.nodeNames.indexOf(name);
    if (i < 0) {
      i = this.nodeNames.length;
      this.nodeNames.push(name);
    }
    return i;
  }
  add<T extends Element>(e: T): T {
    this.elements.push(e);
    return e;
  }
  voltage(name: string): number {
    const i = this.nodeNames.indexOf(name);
    return i < 0 ? 0 : this.x[i] ?? 0;
  }

  private solveOnce(ctx: SolveCtx, maxIter = 150): boolean {
    const n = this.nodeNames.length;
    if (this.x.length !== n) {
      const nx = new Float64Array(n);
      nx.set(this.x.subarray(0, Math.min(n, this.x.length)));
      this.x = nx;
    }
    const hasNonlinear = this.elements.some((e) => e.nonlinear);
    const G = Array.from({ length: n }, () => new Float64Array(n));
    const I = new Float64Array(n);
    for (let it = 0; it < maxIter; it++) {
      for (let r = 0; r < n; r++) G[r].fill(0);
      I.fill(0);
      for (let r = 0; r < n; r++) G[r][r] += GMIN;
      const s: Stamp = { G, I, limited: false };
      for (const e of this.elements) e.stamp(s, this.x, ctx);
      const nx = gauss(G, I);
      if (!nx) {
        this.converged = false;
        return false;
      }
      let maxDelta = 0;
      for (let k = 0; k < n; k++) maxDelta = Math.max(maxDelta, Math.abs(nx[k] - this.x[k]));
      this.x = nx;
      this.lastIterations = it + 1;
      if (!hasNonlinear || (maxDelta < 1e-6 && !s.limited)) {
        this.converged = true;
        return true;
      }
    }
    this.converged = false;
    return false;
  }

  /** DC operating point (capacitors open). Iterates 555 latches until stable. */
  dc(): boolean {
    const ctx = { dt: 0, time: this.time };
    let ok = this.solveOnce(ctx);
    for (let k = 0; k < 4; k++) {
      let changed = false;
      for (const e of this.elements) if (e instanceof Timer555 && e.settle(this.x)) changed = true;
      if (!changed) break;
      ok = this.solveOnce(ctx);
    }
    return ok;
  }

  /** One backward-Euler transient step. */
  step(dt: number): boolean {
    const ctx = { dt, time: this.time + dt };
    const ok = this.solveOnce(ctx, 60);
    for (const e of this.elements) e.accept?.(this.x, ctx);
    this.time += dt;
    return ok;
  }

  /** Initialise capacitor voltages from the current solution. */
  initCaps(zero = true) {
    for (const e of this.elements) if (e instanceof Capacitor) e.vPrev = zero ? e.v0 : v(this.x, e.nodes[0]) - v(this.x, e.nodes[1]);
  }
}

/** Dense Gaussian elimination with partial pivoting. Returns null if singular. */
export function gauss(Gin: Float64Array[], Iin: Float64Array): Float64Array | null {
  const n = Iin.length;
  const A = Gin.map((r) => Float64Array.from(r));
  const b = Float64Array.from(Iin);
  for (let c = 0; c < n; c++) {
    let piv = c;
    let best = Math.abs(A[c][c]);
    for (let r = c + 1; r < n; r++) {
      const a = Math.abs(A[r][c]);
      if (a > best) {
        best = a;
        piv = r;
      }
    }
    if (best < 1e-30) return null;
    if (piv !== c) {
      [A[c], A[piv]] = [A[piv], A[c]];
      [b[c], b[piv]] = [b[piv], b[c]];
    }
    const inv = 1 / A[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] * inv;
      if (f === 0) continue;
      const Ar = A[r];
      const Ac = A[c];
      for (let k = c; k < n; k++) Ar[k] -= f * Ac[k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    const Ar = A[r];
    for (let k = r + 1; k < n; k++) sum -= Ar[k] * x[k];
    x[r] = sum / Ar[r];
  }
  return x;
}

/** LED diode parameters by colour: [Is, n] fitted so I(Vf_typ) ≈ 20 mA. */
export const LED_PARAMS: Record<string, { is: number; n: number; vf: number }> = {
  red: { vf: 2.0, n: 2, is: 0 },
  orange: { vf: 2.05, n: 2, is: 0 },
  yellow: { vf: 2.1, n: 2, is: 0 },
  green: { vf: 2.2, n: 2, is: 0 },
  blue: { vf: 3.0, n: 2.2, is: 0 },
  white: { vf: 3.0, n: 2.2, is: 0 },
};
for (const k of Object.keys(LED_PARAMS)) {
  const p = LED_PARAMS[k];
  p.is = 0.02 / Math.exp(p.vf / (p.n * VT));
}
