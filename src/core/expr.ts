// A tiny, safe arithmetic language for datasheet formulas (compensation maths, calibration constants).
// No eval: the text is parsed into a tree once and evaluated against named variables.
//   program := (name '=' expr ';')* expr
//   expr    := comparisons, + - * / ^ (right-associative), unary -, parentheses, numbers (12, 0x1F, 1.5e-3), names, calls
//   calls   := min(a,b) max(a,b) floor(x) abs(x) mod(a,b) if(cond, a, b) signed(x, bits) reg(addr)
// Comparisons (< <= > >= ==) give 1 or 0, for if(). reg(addr) reads a byte register of the chip being modelled.

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Expr }
  | { k: 'bin'; op: string; a: Expr; b: Expr }
  | { k: 'call'; fn: string; args: Expr[] };

export interface Program {
  lets: { name: string; e: Expr }[];
  result: Expr;
}

const FNS: Record<string, number> = { min: 2, max: 2, floor: 1, abs: 1, mod: 2, if: 3, signed: 2, reg: 1 };

function tokenize(src: string): string[] {
  const out: string[] = [];
  const re = /\s*(0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|<=|>=|==|[-+*/^(),;=<>])/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`can't read "${src.slice(i, i + 12).trim()}"`);
    out.push(m[1]);
    i = re.lastIndex;
  }
  return out;
}

/** Parse a formula; throws an Error with a readable message on bad input. */
export function parseProgram(src: string): Program {
  const t = tokenize(src);
  let p = 0;
  const peek = () => t[p];
  const take = (want?: string) => {
    const x = t[p++];
    if (want !== undefined && x !== want) throw new Error(`expected "${want}" but found ${x === undefined ? 'the end' : `"${x}"`}`);
    if (x === undefined) throw new Error('unexpected end of formula');
    return x;
  };
  const primary = (): Expr => {
    const x = take();
    if (x === '(') {
      const e = cmp();
      take(')');
      return e;
    }
    if (x === '-') return { k: 'neg', a: unary() };
    if (/^(0x|\d|\.)/.test(x)) return { k: 'num', v: Number(x) };
    if (/^[A-Za-z_]/.test(x)) {
      if (peek() === '(') {
        if (!(x in FNS)) throw new Error(`unknown function ${x}()`);
        take('(');
        const args: Expr[] = [];
        if (peek() !== ')') {
          args.push(cmp());
          while (peek() === ',') {
            take(',');
            args.push(cmp());
          }
        }
        take(')');
        if (args.length !== FNS[x]) throw new Error(`${x}() takes ${FNS[x]} argument${FNS[x] > 1 ? 's' : ''}`);
        return { k: 'call', fn: x, args };
      }
      return { k: 'var', name: x };
    }
    throw new Error(`unexpected "${x}"`);
  };
  const unary = (): Expr => (peek() === '-' ? (take(), { k: 'neg', a: unary() }) : power());
  const power = (): Expr => {
    const a = primary();
    if (peek() === '^') {
      take();
      return { k: 'bin', op: '^', a, b: unary() };
    }
    return a;
  };
  const term = (): Expr => {
    let a = unary();
    while (peek() === '*' || peek() === '/') a = { k: 'bin', op: take(), a, b: unary() };
    return a;
  };
  const sum = (): Expr => {
    let a = term();
    while (peek() === '+' || peek() === '-') a = { k: 'bin', op: take(), a, b: term() };
    return a;
  };
  const cmp = (): Expr => {
    let a = sum();
    while (['<', '<=', '>', '>=', '=='].includes(peek())) a = { k: 'bin', op: take(), a, b: sum() };
    return a;
  };
  const lets: { name: string; e: Expr }[] = [];
  while (p < t.length && /^[A-Za-z_]/.test(t[p]) && t[p + 1] === '=') {
    const name = take();
    take('=');
    lets.push({ name, e: cmp() });
    take(';');
  }
  const result = cmp();
  if (p < t.length) throw new Error(`unexpected "${t[p]}"`);
  return { lets, result };
}

/** Names a formula reads that it doesn't define itself. */
export function freeNames(prog: Program): string[] {
  const out = new Set<string>();
  const defined = new Set<string>();
  const walk = (e: Expr) => {
    if (e.k === 'var' && !defined.has(e.name)) out.add(e.name);
    else if (e.k === 'neg') walk(e.a);
    else if (e.k === 'bin') (walk(e.a), walk(e.b));
    else if (e.k === 'call') e.args.forEach(walk);
  };
  for (const l of prog.lets) {
    walk(l.e);
    defined.add(l.name);
  }
  walk(prog.result);
  return [...out];
}

export function evalProgram(prog: Program, vars: Record<string, number>, reg: (addr: number) => number = () => 0): number {
  const env: Record<string, number> = { ...vars };
  const ev = (e: Expr): number => {
    switch (e.k) {
      case 'num':
        return e.v;
      case 'var':
        if (!(e.name in env)) throw new Error(`unknown name ${e.name}`);
        return env[e.name];
      case 'neg':
        return -ev(e.a);
      case 'bin': {
        const a = ev(e.a);
        const b = ev(e.b);
        switch (e.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return a / b;
          case '^': return a ** b;
          case '<': return a < b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '>=': return a >= b ? 1 : 0;
          default: return a === b ? 1 : 0;
        }
      }
      case 'call': {
        const [x, y] = e.args;
        switch (e.fn) {
          case 'if': return ev(x) ? ev(y) : ev(e.args[2]);
          case 'min': return Math.min(ev(x), ev(y));
          case 'max': return Math.max(ev(x), ev(y));
          case 'floor': return Math.floor(ev(x));
          case 'abs': return Math.abs(ev(x));
          case 'mod': {
            const b = ev(y);
            return ev(x) - Math.floor(ev(x) / b) * b;
          }
          case 'signed': {
            const v = ev(x);
            const bits = ev(y);
            return v >= 2 ** (bits - 1) ? v - 2 ** bits : v;
          }
          default: return reg(ev(x));
        }
      }
    }
  };
  for (const l of prog.lets) env[l.name] = ev(l.e);
  return ev(prog.result);
}

/** The integer in [lo, hi] whose f(raw) is closest to target, for f monotonic over the range (either direction).
 * Bisection on the crossing, then the better of the two neighbours. Targets outside f's range clamp to an end. */
export function solveMonotonic(f: (raw: number) => number, target: number, lo: number, hi: number): number {
  const up = f(hi) >= f(lo);
  let a = lo;
  let b = hi;
  // Invariant: the crossing lies in [a, b]; stop when adjacent.
  while (b - a > 1) {
    const m = Math.floor((a + b) / 2);
    if (f(m) < target === up) a = m;
    else b = m;
  }
  return Math.abs(f(a) - target) <= Math.abs(f(b) - target) ? a : b;
}
