// Live parts data (LCSC part number, stock, price breaks, JLCPCB basic/extended) from the parts
// search JLCPCB's website uses. It is not an official API, so results are cached for a day,
// requests are spaced out, and every caller copes with "not found".
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Project } from '../src/core/types';
import { buildBom, type BomLine } from '../src/core/bom';

export interface LivePart {
  lcsc: string;
  mfr: string;
  brand: string;
  pkg: string;
  description: string;
  stock: number;
  /** JLCPCB assembly library: basic parts have no loading fee. */
  basic: boolean;
  /** [min quantity, unit price USD] */
  prices: [number, number][];
  url: string;
}

const CACHE = join(homedir(), '.cache/sparkbench/jlc');
const DAY = 24 * 3600 * 1000;
let last = 0;

async function search(keyword: string, page = 1): Promise<LivePart[]> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, createHash('sha1').update(`${keyword}#${page}`).digest('hex') + '.json');
  if (existsSync(file)) {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    if (Date.now() - c.at < DAY) return c.parts;
  }
  const wait = last + 400 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const r = await fetch('https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Sparkbench parts lookup)' },
    body: JSON.stringify({ keyword, currentPage: page, pageSize: 12 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`parts search failed (${r.status})`);
  const d = await r.json();
  const list: any[] = d?.data?.componentPageInfo?.list ?? [];
  const parts: LivePart[] = list.map((x) => ({
    lcsc: x.componentCode,
    mfr: x.componentModelEn,
    brand: x.componentBrandEn ?? '',
    pkg: x.componentSpecificationEn ?? '',
    description: x.describe ?? '',
    stock: x.stockCount ?? 0,
    basic: x.componentLibraryType === 'base',
    prices: (x.componentPrices ?? []).map((p: any) => [p.startNumber, p.productPrice] as [number, number]),
    url: x.lcscGoodsUrl ?? `https://www.lcsc.com/search?q=${x.componentCode}`,
  }));
  writeFileSync(file, JSON.stringify({ at: Date.now(), parts }));
  return parts;
}

const fmtR = (o: number) => (o >= 1e6 ? `${o / 1e6}MΩ` : o >= 1000 ? `${o / 1000}kΩ` : `${o}Ω`);
const fmtC = (f: number) => (f >= 1e-6 ? `${Math.round(f * 1e6 * 10) / 10}uF` : `${Math.round(f * 1e9)}nF`);
const tht = (p: LivePart) => /^(Plugin|TO-92|DIP|PDIP|TH)/i.test(p.pkg);

/** What to search for each part type, and which results are acceptable (through-hole, right kind). */
function queries(type: string, props: Record<string, any>): { q: string[]; ok: (p: LivePart) => boolean; pages?: number } | null {
  // Surface-mount variants (product version of a board).
  const fp = String(props.footprint ?? '');
  if (/_0805_/.test(fp)) {
    if (type === 'resistor') return { q: [`${fmtR(props.ohms ?? 220)} 0805`], ok: (p) => p.pkg === '0805' && /resist/i.test(p.description) };
    if (type === 'capacitor') return { q: [`${fmtC(props.farads ?? 1e-7)} 0805`], ok: (p) => p.pkg === '0805' && /capacitor|MLCC/i.test(p.description) };
    if (type === 'led') return { q: [`0805 ${props.color ?? 'red'} LED`, 'LED 0805'], ok: (p) => p.pkg === '0805' && /LED|emitting/i.test(p.description) };
  }
  if (/CP_Elec/.test(fp)) return { q: [`${fmtC(props.farads ?? 1e-5)} 25V SMD electrolytic`], ok: (p) => /SMD/.test(p.pkg) && /electrolytic/i.test(p.description) };
  if (/SOD-123/.test(fp)) return { q: ['1N4148W'], ok: (p) => /SOD-123/.test(p.pkg) };
  if (type === 'ne555' && /SOIC/.test(fp)) return { q: ['NE555DR'], ok: (p) => /SOIC-8|SOP-8/.test(p.pkg) };
  if (type === 'mcp3008' && /SOIC/.test(fp)) return { q: ['MCP3008-I/SL'], ok: (p) => /SOIC-16|SOP-16/.test(p.pkg) };
  switch (type) {
    case 'esp32-wroom':
      return { q: ['ESP32-WROOM-32E-N4'], ok: (p) => /WROOM/i.test(p.mfr) };
    case 'ldo-3v3':
      return { q: ['AMS1117-3.3'], ok: (p) => /SOT-223/.test(p.pkg) };
    case 'ch340c':
      return { q: ['CH340C'], ok: (p) => /SOP-16|SOIC-16/.test(p.pkg) };
    case 'npn-smd':
      return { q: ['MMBT3904'], ok: (p) => /SOT-23/.test(p.pkg) };
    case 'usb-micro':
      return { q: ['105017-0001', 'Micro USB B SMD'], ok: (p) => /USB/i.test(p.description) };
    case 'resistor':
      return { q: [`${fmtR(props.ohms ?? 220)} 1/4W`], ok: (p) => tht(p) && /resist/i.test(p.description) };
    case 'capacitor':
      return { q: [`${fmtC(props.farads ?? 1e-7)} 50V Plugin`], ok: (p) => tht(p) && /ceramic|MLCC|capacitor/i.test(p.description) && !/electrolytic/i.test(p.description) };
    case 'electrolytic':
      return { q: [`${fmtC(props.farads ?? 1e-5)} 25V Plugin aluminum electrolytic`, `${fmtC(props.farads ?? 1e-5)} 25V Plugin`], ok: (p) => tht(p) && /electrolytic/i.test(p.description) };
    case 'led': {
      // Descriptions give the wavelength, not the colour name.
      const band: Record<string, [number, number]> = { red: [615, 640], orange: [600, 614], yellow: [583, 599], green: [515, 575], blue: [455, 480] };
      const want = band[props.color ?? 'red'];
      const nm = (p: LivePart) => [...p.description.matchAll(/(\d{3})nm/g)].map((m) => +m[1]);
      return {
        q: ['LED 5mm', `5mm ${props.color ?? 'red'} LED`],
        pages: 4,
        ok: (p) => /D=5mm/.test(p.pkg) && (want ? nm(p).some((n) => n >= want[0] && n <= want[1]) : /white/i.test(p.description) || nm(p).length === 0),
      };
    }
    case 'rgb-led':
      return { q: ['5mm RGB LED common cathode'], ok: (p) => /D=5mm/.test(p.pkg) && /cathode/i.test(p.description + p.mfr) !== false };
    case 'npn':
      return { q: ['PN2222A', '2N2222A TO-92'], ok: (p) => /TO-92/.test(p.pkg) };
    case 'diode':
      return { q: ['1N4148 DO-35'], ok: (p) => /DO-35|Plugin/i.test(p.pkg) };
    case 'ne555':
      return { q: ['NE555P'], ok: (p) => /DIP-8/.test(p.pkg) };
    case 'mcp3008':
      return { q: ['MCP3008-I/P'], ok: (p) => /DIP-16/.test(p.pkg) };
    case 'ldr':
      return { q: ['GL5528'], ok: tht };
    case 'buzzer':
      return { q: ['passive buzzer 12mm', 'passive buzzer'], ok: (p) => tht(p) && /buzzer/i.test(p.description) };
    case 'potentiometer':
      return { q: ['RK09K 10K', 'RK09K'], ok: tht };
    case 'pushbutton':
      return { q: ['Tactile Switches 6x6', 'tactile switch 6x6mm Plugin'], ok: (p) => tht(p) && /6x6/.test(p.pkg) && /switch|button|SPST/i.test(p.description) };
    case 'dht22':
      return { q: ['AM2302', 'DHT22'], ok: (p) => /humidity|temperature/i.test(p.description) && /sensor|AM2302|DHT22/i.test(p.description + p.mfr) };
    default:
      return null;
  }
}

async function bestFor(q: string[], ok: (p: LivePart) => boolean, qty: number, pages = 1): Promise<LivePart | null> {
  for (const k of q) {
    for (let page = 1; page <= pages; page++) {
      const res = await search(k, page);
      const hits = res.filter((p) => ok(p) && p.stock >= qty);
      // Healthy stock first (room for repeat orders), then JLCPCB basic parts, then price.
      if (hits.length) return hits.sort((a, b) => Number(b.stock >= qty * 100) - Number(a.stock >= qty * 100) || Number(b.basic) - Number(a.basic) || unitPrice(a, qty) - unitPrice(b, qty))[0];
      if (res.length < 12) break;
    }
  }
  return null;
}

export function unitPrice(p: LivePart, qty: number): number {
  let price = p.prices[0]?.[1] ?? 0;
  for (const [min, v] of p.prices) if (qty >= min) price = v;
  return price;
}

export interface SourcedLine {
  key: string;
  name: string;
  quantity: number;
  part: LivePart | null;
}

/** Live LCSC/JLCPCB data for each line of the project's parts list (modules usually aren't there). */
export async function sourceBom(project: Project): Promise<SourcedLine[]> {
  const lines = buildBom(project).filter((l) => l.kind === 'part');
  const out: SourcedLine[] = [];
  for (const l of lines) {
    const part = project.parts.find((p) => l.refs.includes(p.ref ?? ''));
    const spec = l.type ? queries(l.type, part?.props ?? {}) : null;
    let found: LivePart | null = null;
    if (spec) {
      try {
        found = await bestFor(spec.q, spec.ok, l.quantity, spec.pages ?? 1);
      } catch {
        found = null;
      }
    }
    out.push({ key: l.key, name: l.name, quantity: l.quantity, part: found });
  }
  return out;
}

/** Female header sockets a carrier PCB needs for a module or board with `pins` pins in one row. */
export async function femaleHeader(pins: number): Promise<LivePart | null> {
  try {
    return await bestFor([`1x${pins}P female header`, `Female Header 2.54mm 1*${pins}P`], (p) => /P=2\.54mm/.test(p.pkg), 1);
  } catch {
    return null;
  }
}

export type { BomLine };

export interface PcbSourced {
  ref: string;
  /** What actually gets soldered to the circuit board (sockets for plug-in boards and modules). */
  item: string;
  quantity: number;
  part: LivePart | null;
}

/** LCSC parts for the circuit board: female sockets where a dev board or module plugs in, real parts otherwise. */
export async function sourcePcb(project: Project): Promise<PcbSourced[]> {
  const out: PcbSourced[] = [];
  const { partDef } = await import('../src/core/parts');
  for (const p of project.parts) {
    const def = partDef(p.type);
    const fp = p.props?.footprint ?? def.kicad.footprint ?? '';
    const ref = p.ref ?? p.id;
    const rows: number[] =
      p.type === 'esp32-devkit' ? [15, 15] : p.type === 'pi-pico' && !p.props?.footprint ? [20, 20] : p.type === 'rpi4' ? [] : /PinHeader_1x(\d+)/.test(fp) ? [Number(/PinHeader_1x(\d+)/.exec(fp)![1])] : [];
    if (p.type === 'rpi4') {
      const h = await bestFor(['2x20P female header 2.54mm', 'Female Header 2.54mm 2*20P'], (x) => /2\.54/.test(x.pkg), 1).catch(() => null);
      out.push({ ref, item: '2×20 socket for the Raspberry Pi ribbon cable', quantity: 1, part: h });
      continue;
    }
    if (rows.length) {
      for (const n of [...new Set(rows)]) out.push({ ref, item: `1×${n} female socket for ${def.name}`, quantity: rows.filter((r) => r === n).length, part: await femaleHeader(n) });
      continue;
    }
    const spec = queries(p.type, p.props ?? {});
    out.push({ ref, item: p.props?.color && /led/.test(p.type) ? `${def.name}, ${p.props.color}` : def.name, quantity: 1, part: spec ? await bestFor(spec.q, spec.ok, 1, spec.pages ?? 1).catch(() => null) : null });
  }
  return out;
}
