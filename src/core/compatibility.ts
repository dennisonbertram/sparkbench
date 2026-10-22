export type CompatibilityStatus = 'passed' | 'failed' | 'blocked' | 'not-tested';

export interface CompatibilityCheck {
  id: string;
  label: string;
  status: CompatibilityStatus;
  detail: string;
}

export interface CircuitInventory {
  components: { ref: string; value: string; footprint: string }[];
  /** Sorted groups of physical REF.pad endpoints; singletons are not connections. */
  nets: string[][];
}

export interface CompatibilityReport {
  schemaVersion: 1;
  project: { id: string; name: string; updatedAt: number; sha256: string };
  sourceCommit?: string;
  startedAt: string;
  finishedAt: string;
  tool: { name: 'KiCad'; version: string | null };
  status: CompatibilityStatus;
  checks: CompatibilityCheck[];
  warnings: string[];
  otherTargets: { name: string; status: 'not-tested'; reason: string }[];
}

export interface CompatibilityJob {
  id: string;
  state: 'queued' | 'running' | 'finished' | 'failed';
  report?: CompatibilityReport;
  error?: string;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).filter((k) => obj[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function normalizeInventory(input: CircuitInventory): CircuitInventory {
  const refs = new Set<string>();
  const components = input.components.map((c) => {
    if (!c.ref || refs.has(c.ref)) throw new Error(`Missing or duplicate reference: ${c.ref}`);
    refs.add(c.ref);
    return { ref: c.ref, value: c.value, footprint: c.footprint };
  }).sort((a, b) => a.ref.localeCompare(b.ref));
  const seen = new Set<string>();
  const nets = input.nets.map((net) => net.map((pin) => {
    if (seen.has(pin)) throw new Error(`Pin appears more than once: ${pin}`);
    seen.add(pin);
    return pin;
  }).sort()).filter((n) => n.length > 1).sort((a, b) => a.join(' ').localeCompare(b.join(' ')));
  return { components, nets };
}

export function compareInventory(expected: CircuitInventory, actual: CircuitInventory): string[] {
  const e = normalizeInventory(expected);
  const a = normalizeInventory(actual);
  const diff: string[] = [];
  for (const key of ['components', 'nets'] as const) {
    const left = new Set(e[key].map(canonicalJson));
    const right = new Set(a[key].map(canonicalJson));
    for (const item of left) if (!right.has(item)) diff.push(`Missing ${key}: ${item}`);
    for (const item of right) if (!left.has(item)) diff.push(`Unexpected ${key}: ${item}`);
  }
  return diff;
}

type S = string | S[];
export function parseNetlist(source: string): CircuitInventory {
  let at = 0;
  const space = () => { while (at < source.length && /\s/.test(source[at])) at++; };
  const read = (depth = 0): S => {
    if (depth > 100) throw new Error('Netlist nesting limit exceeded');
    space();
    if (at >= source.length) throw new Error('Truncated netlist');
    if (source[at] === '(') {
      at++;
      const items: S[] = [];
      for (;;) {
        space();
        if (source[at] === ')') { at++; return items; }
        items.push(read(depth + 1));
      }
    }
    if (source[at] === '"') {
      at++;
      let value = '';
      while (at < source.length) {
        const ch = source[at++];
        if (ch === '"') return value;
        if (ch === '\\') {
          if (at >= source.length) break;
          value += source[at++];
        } else value += ch;
      }
      throw new Error('Unterminated netlist string');
    }
    const start = at;
    while (at < source.length && !/[\s()]/.test(source[at])) at++;
    if (start === at) throw new Error('Unexpected netlist token');
    return source.slice(start, at);
  };
  const root = read();
  space();
  if (at !== source.length || !Array.isArray(root) || root[0] !== 'export') throw new Error('Not a KiCad netlist');
  const children = (s: S[], key: string) => s.filter((x): x is S[] => Array.isArray(x) && x[0] === key);
  const child = (s: S[], key: string) => {
    const matches = children(s, key);
    if (matches.length !== 1) throw new Error(`Expected one ${key} in netlist`);
    return matches[0];
  };
  const field = (s: S[], key: string): string => {
    const val = child(s, key)[1];
    if (typeof val !== 'string') throw new Error(`Invalid ${key}`);
    return val;
  };
  const components = children(child(root, 'components'), 'comp').map((c) => ({
    ref: field(c, 'ref'), value: field(c, 'value'), footprint: children(c, 'footprint').length ? field(c, 'footprint') : '',
  })).filter((c) => !c.ref.startsWith('#'));
  if (!components.length) throw new Error('Empty component inventory');
  const refs = new Set(components.map((c) => c.ref));
  const nets = children(child(root, 'nets'), 'net').map((n) => children(n, 'node').flatMap((nd) => {
    const ref = field(nd, 'ref');
    if (ref.startsWith('#')) return [];
    if (!refs.has(ref)) throw new Error(`Unknown component in netlist: ${ref}`);
    return [`${ref}.${field(nd, 'pin')}`];
  }));
  return normalizeInventory({ components, nets });
}
