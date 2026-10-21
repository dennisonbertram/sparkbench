// Publish a staged part into the library only if (1) it passed the part check after its last edit and
// (2) an independent reading of the datasheet (verify.json, written blind by a second agent) agrees with
// it: header pin order and roles, I2C address, supply range, conversion constants and chip ID.
// Anything else goes to the review queue with the differences listed.
// Run: npx tsx scripts/parts/publish.ts <slug>   (reads parts-staging/part-<slug>/ and parts-staging/verify/<slug>.json)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CustomPartSpec, ResponseSegment } from '../../src/core/customParts';

export interface VerifyFacts {
  mpn: string;
  breakoutPins: { name: string; role: 'power' | 'gnd' | 'io' | 'nc'; required: boolean }[];
  i2cAddresses: number[];
  defaultI2cAddress: number | null;
  vmin: number | null;
  vmax: number | null;
  conversions: { quantity: string; scale: number; offset: number }[];
  chipId: { reg: number; value: number } | null;
  sources: string[];
  /** How many separate header rows the board has (pins on two or more edges); 1 for a single row. */
  headerRows?: number;
}

const ALIAS: [RegExp, string][] = [
  [/^(VCC|VIN|VDD|V\+|\+|3V3|3\.3V|5V|\+5V|VS|POWER|PWR|V)$/, 'PWR'],
  [/^(GND|G|-|VSS|GROUND|0V)$/, 'GND'],
  [/^(SDA|SDI|SDI\/SDA|SDA\/SDI|DATA)$/, 'SDA'],
  [/^(SCL|SCK|SCK\/SCL|SCL\/SCK|CLK)$/, 'SCL'],
  [/^(OUT|DO|D0|DOUT|SIG|S|SIGNAL|OUTPUT)$/, 'OUT'],
  [/^(AO|A0|AOUT|ANALOG)$/, 'AO'],
];
export function pinKey(name: string): string {
  const n = name.toUpperCase().replace(/\s+/g, '');
  for (const [re, k] of ALIAS) if (re.test(n)) return k;
  return n.replace(/[^A-Z0-9]/g, '');
}

/** The author's conversion constants: value = raw × scale + offset, per measured field. */
function authorConversions(spec: CustomPartSpec): { scale: number; offset: number; per: number }[] {
  const out: { scale: number; offset: number; per: number }[] = [];
  const s = spec.sim;
  for (const m of [...(s.measure ? [s.measure] : []), ...(s.measures ?? [])]) out.push({ scale: m.scale, offset: m.offset ?? 0, per: m.scale / 2 ** (m.shift ?? 0) });
  for (const r of s.responses ?? []) for (const b of r.bytes as ResponseSegment[]) {
      // A split decimal (DHT12) is whole units in one byte and tenths in the next.
      if ('split' in b) out.push(b.split === 'int' ? { scale: 1, offset: 0, per: 1 } : { scale: 0.1, offset: 0, per: 0.1 });
      else if ('control' in b) out.push({ scale: b.scale ?? 1, offset: b.offset ?? 0, per: b.scale ?? 1 });
    }
  if (s.kind === 'analog-sensor' && s.min !== undefined && s.max !== undefined && s.vAtMin !== undefined && s.vAtMax !== undefined && s.vAtMax !== s.vAtMin) {
    // value per volt at the output pin
    const k = (s.max - s.min) / (s.vAtMax - s.vAtMin);
    out.push({ scale: k, offset: s.min - k * s.vAtMin, per: k });
  }
  return out;
}

const close = (a: number, b: number, rel = 0.02, abs = 1e-9) => Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));
/** Equal, or off by a power of two (bit alignment differs between how people describe a register). */
const scaleMatch = (a: number, b: number) => {
  if (!a || !b) return false;
  const r = Math.log2(Math.abs(a / b));
  return Math.abs(r - Math.round(r)) < 0.03 && Math.abs(r) <= 8 && Math.sign(a) === Math.sign(b);
};

export function compare(spec: CustomPartSpec, v: VerifyFacts): string[] {
  const diffs: string[] = [];
  const a = spec.pins.map((p) => ({ k: pinKey(p.name), role: p.role, req: p.required !== false && p.role !== 'nc' }));
  const b = v.breakoutPins.map((p) => ({ k: pinKey(p.name), role: p.role, req: p.required && p.role !== 'nc' }));
  if (a.length !== b.length) diffs.push(`pin count: part has ${a.length} (${spec.pins.map((p) => p.name).join(' ')}), datasheet reading has ${b.length} (${v.breakoutPins.map((p) => p.name).join(' ')})`);
  else
    a.forEach((x, i) => {
      const y = b[i];
      const roleOk = x.role === y.role || (x.role === 'passive' && y.role === 'io') || (!x.req && !y.req);
      if (x.k !== y.k && !(x.role === y.role && x.role !== 'io') && (x.req || y.req)) diffs.push(`header pin ${i + 1}: part says ${spec.pins[i].name}, datasheet reading says ${v.breakoutPins[i].name}`);
      else if (!roleOk) diffs.push(`header pin ${i + 1} (${spec.pins[i].name}): part says ${x.role}, datasheet reading says ${y.role}`);
    });
  // Small modules (≤ 8 pins) plug straight into the breadboard and a socket; larger ones are cabled, so any shape works.
  if ((v.headerRows ?? 1) > 1 && spec.pins.length <= 8 && !spec.cabled && /PinHeader_1x/.test(spec.footprint ?? 'PinHeader_1x')) diffs.push(`physical layout: the board has ${v.headerRows} header rows, but this small module is modelled as plugging in as a single row`);
  if (spec.interface === 'i2c' || spec.i2cAddress !== undefined) {
    if (v.defaultI2cAddress === null && !v.i2cAddresses.length) diffs.push('part has an I2C address but the datasheet reading has none');
    else if (spec.i2cAddress === undefined || ![v.defaultI2cAddress, ...v.i2cAddresses].includes(spec.i2cAddress)) diffs.push(`I2C address: part 0x${spec.i2cAddress?.toString(16)}, datasheet reading 0x${v.defaultI2cAddress?.toString(16)} (also ${v.i2cAddresses.map((x) => `0x${x.toString(16)}`).join(', ')})`);
  }
  // The part may not promise a wider supply range than the datasheet allows.
  if (v.vmin !== null && spec.vmin !== undefined && spec.vmin < v.vmin - 0.15) diffs.push(`minimum supply: part ${spec.vmin} V, datasheet reading ${v.vmin} V`);
  if (v.vmax !== null && spec.vmax !== undefined && spec.vmax > v.vmax + 0.15) diffs.push(`maximum supply: part ${spec.vmax} V, datasheet reading ${v.vmax} V`);
  const mine = authorConversions(spec);
  for (const c of v.conversions) {
    // Prefer a field whose scale AND offset both match (temperature and humidity often differ by exactly 2×).
    const cands = mine.filter((m) => scaleMatch(m.per, c.scale) || scaleMatch(m.scale, c.scale));
    const hit = cands.find((m) => close(m.offset, c.offset, 0.02, 0.6) && (close(m.per, c.scale) || close(m.scale, c.scale))) ?? cands.find((m) => close(m.offset, c.offset, 0.02, 0.6)) ?? cands[0];
    if (!hit) diffs.push(`${c.quantity}: datasheet reading gives ${c.scale} per count, the part's model has ${mine.map((m) => +m.scale.toPrecision(4)).join(', ') || 'none'}`);
    else if (!close(hit.offset, c.offset, 0.02, 0.6)) diffs.push(`${c.quantity}: offset ${+hit.offset.toPrecision(4)} vs datasheet reading ${c.offset}`);
  }
  if (v.chipId && spec.sim.registers) {
    const got = Object.entries(spec.sim.registers).find(([k]) => Number(k) === v.chipId!.reg)?.[1];
    if (got !== undefined && got !== v.chipId.value) diffs.push(`chip ID register 0x${v.chipId.reg.toString(16)}: part ${got}, datasheet reading ${v.chipId.value}`);
  }
  return diffs;
}

/** A third reading's verdict on each difference, with evidence (see the review step). */
interface Resolution {
  diffs: { diff: string; verdict: 'part-correct' | 'part-fixed' | 'unresolved'; evidence: string; source: string }[];
}

export function publish(slug: string, opts: { resolved?: boolean } = {}): { status: 'published' | 'review' | 'not-ready'; detail: string[] } {
  const dir = join('parts-staging', `part-${slug}`);
  const specFile = join(dir, 'part.json');
  const checkFile = join(dir, 'check.json');
  const vf = join('parts-staging', 'verify', `${slug}.json`);
  if (!existsSync(specFile)) return { status: 'not-ready', detail: ['no part.json'] };
  if (!existsSync(checkFile)) return { status: 'not-ready', detail: ['the part check has not been run'] };
  const check = JSON.parse(readFileSync(checkFile, 'utf8'));
  if (!check.pass) return { status: 'not-ready', detail: ['the part check did not pass'] };
  const newest = Math.max(...['part.json', ...readdirSync(dir).filter((f) => f.endsWith('.py'))].map((f) => statSync(join(dir, f)).mtimeMs));
  if (statSync(checkFile).mtimeMs < newest) return { status: 'not-ready', detail: ['files changed after the part check: run it again'] };
  if (!existsSync(vf)) return { status: 'not-ready', detail: ['no independent datasheet reading yet'] };
  const spec: CustomPartSpec & { library?: unknown; sources?: string[] } = JSON.parse(readFileSync(specFile, 'utf8'));
  const facts: VerifyFacts = JSON.parse(readFileSync(vf, 'utf8'));
  // The second reading must stay blind: the first version compared is kept, and a reading changed after seeing the
  // differences (which name the part's own values) is not accepted.
  const first = join('parts-staging', 'verify', `${slug}.first.json`);
  if (!existsSync(first)) writeFileSync(first, readFileSync(vf, 'utf8'));
  else if (readFileSync(first, 'utf8').trim() !== readFileSync(vf, 'utf8').trim()) {
    writeFileSync(join(dir, 'review.json'), JSON.stringify({ diffs: ['the independent reading was edited after it was first compared with the part, so it is no longer blind'] }, null, 2));
    return { status: 'review', detail: ['the independent reading was edited after it was first compared with the part; it needs a fresh blind reading'] };
  }
  let diffs = compare(spec, facts);
  let resolvedNote = '';
  if (diffs.length && opts.resolved) {
    const res: Resolution | null = existsSync(join(dir, 'resolution.json')) ? JSON.parse(readFileSync(join(dir, 'resolution.json'), 'utf8')) : null;
    const ok = (d: string) => res?.diffs.some((r) => r.verdict !== 'unresolved' && r.evidence.trim().length > 20 && /^https?:\/\//.test(r.source) && normDiff(r.diff) === normDiff(d));
    const left = diffs.filter((d) => !ok(d));
    if (!left.length) resolvedNote = `${diffs.length} difference(s) settled by a third reading with quoted evidence`;
    diffs = left;
  }
  if (diffs.length) {
    writeFileSync(join(dir, 'review.json'), JSON.stringify({ diffs, verify: facts }, null, 2));
    return { status: 'review', detail: diffs };
  }
  const dest = join('.claude', 'skills', `part-${slug}`);
  // Already published (e.g. by an earlier run of this same step): report it, don't treat it as a disagreement.
  if (existsSync(join(dest, 'part.json'))) return { status: 'published', detail: [`${dest} (already in the library)`] };
  mkdirSync(dest, { recursive: true });
  cpSync(dir, dest, { recursive: true, filter: (f) => !/review\.json$/.test(f) });
  spec.library = { status: 'checked', note: `Passed the Sparkbench part check in simulation and matched an independent datasheet reading${resolvedNote ? ` (${resolvedNote})` : ''}. Not yet tested on real hardware.`, checkedAt: check.checkedAt, verifiedSources: facts.sources };
  writeFileSync(join(dest, 'part.json'), JSON.stringify(spec, null, 2));
  return { status: 'published', detail: [dest] };
}

const normDiff = (d: string) => d.toLowerCase().replace(/[^a-z0-9]/g, '');

if (process.argv[1]?.includes('publish')) {
  const resolved = process.argv.includes('--resolved');
  for (const slug of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
    const r = publish(slug, { resolved });
    console.log(`${r.status.toUpperCase()} ${slug}${r.detail.length ? `\n  - ${r.detail.join('\n  - ')}` : ''}`);
  }
}
