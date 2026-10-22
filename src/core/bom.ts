// Bill of materials: groups identical parts, prices them, adds supplier search links
// and the "obvious to experts, invisible to beginners" items (breadboard, jumpers, cables…).
import type { PartDef, PartInstance, Project } from './types';
import { partDef, formatOhms, formatFarads } from './parts';
import { boardFor } from './boards';
import { benchCounts, jumpersToBuy } from './toolkit';

export interface SupplierLink {
  name: string; // "DigiKey", "Mouser", …
  url: string;
}

export interface BomLine {
  /** Stable grouping key (type + value). */
  key: string;
  /** 'part' = in the schematic; 'supply' = build items you need that aren't in the schematic. */
  kind: 'part' | 'supply';
  /** Part type for 'part' lines (matches parts.ts). */
  type?: string;
  category?: PartDef['category'] | 'supply';
  quantity: number;
  /** Reference designators, naturally sorted: ['R1', 'R2', 'R10']. */
  refs: string[];
  /** "R1, R2" (empty for supplies). */
  references: string;
  name: string;
  description: string;
  value: string;
  mpn: string;
  footprint: string;
  unitPrice: number;
  linePrice: number;
  suppliers: SupplierLink[];
  /** Optional beginner note ("must be a data cable, not charge-only"). */
  note?: string;
  /** True for nice-to-have items (left out of the "must buy" total by bomTotal({ optional: false })). */
  optional?: boolean;
}

const CATEGORY_ORDER: (PartDef['category'] | 'supply')[] = ['board', 'ic', 'display', 'sensor', 'input', 'output', 'actuator', 'passive', 'power', 'supply'];

const round2 = (n: number) => Math.round(n * 100) / 100;

const q = encodeURIComponent;
const LINKS = {
  digikey: (s: string): SupplierLink => ({ name: 'DigiKey', url: `https://www.digikey.com/en/products/result?keywords=${q(s)}` }),
  mouser: (s: string): SupplierLink => ({ name: 'Mouser', url: `https://www.mouser.com/c/?q=${q(s)}` }),
  aliexpress: (s: string): SupplierLink => ({ name: 'AliExpress', url: `https://www.aliexpress.com/wholesale?SearchText=${q(s)}` }),
  adafruit: (s: string): SupplierLink => ({ name: 'Adafruit', url: `https://www.adafruit.com/search?q=${q(s)}` }),
  sparkfun: (s: string): SupplierLink => ({ name: 'SparkFun', url: `https://www.sparkfun.com/search/results?term=${q(s)}` }),
  amazon: (s: string): SupplierLink => ({ name: 'Amazon', url: `https://www.amazon.com/s?k=${q(s)}` }),
};

/** Supplier links for a search phrase. Hobby shops (Adafruit/SparkFun) only where they actually sell that kind of thing. */
export function supplierLinks(query: string, category: BomLine['category']): SupplierLink[] {
  const links = [LINKS.digikey(query), LINKS.mouser(query), LINKS.aliexpress(query)];
  if (category === 'passive' || category === 'ic' || category === 'power') links.push(LINKS.sparkfun(query));
  else links.push(LINKS.adafruit(query));
  return links;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Human value string for a part instance ("220Ω", "10µF", "Red"), '' when not applicable. */
export function partValue(part: PartInstance): string {
  const pr = part.props ?? {};
  switch (part.type) {
    case 'resistor':
      return `${formatOhms(Number(pr.ohms ?? 220))}Ω`;
    case 'potentiometer':
      return `${formatOhms(Number(pr.ohms ?? 10000))}Ω`;
    case 'capacitor':
      return formatFarads(Number(pr.farads ?? 1e-7));
    case 'electrolytic':
      return formatFarads(Number(pr.farads ?? 1e-5));
    case 'led':
      return cap(String(pr.color ?? 'red'));
    case 'battery-9v':
      return `${pr.volts ?? 9} V`;
    case 'dc-supply':
      return `${pr.volts ?? 12} V, ${pr.amps ?? 2} A`;
    case 'neopixel-ring':
      return `${pr.pixels ?? 12} LEDs`;
    default:
      return '';
  }
}

function searchQuery(part: PartInstance, def: PartDef): string {
  const pr = part.props ?? {};
  switch (part.type) {
    case 'resistor':
      return `${formatOhms(Number(pr.ohms ?? 220))} ohm resistor 1/4W through hole`;
    case 'potentiometer':
      return `${formatOhms(Number(pr.ohms ?? 10000))} potentiometer linear breadboard`;
    case 'capacitor':
      return `${formatFarads(Number(pr.farads ?? 1e-7)).replace('µ', 'u')} ceramic capacitor through hole`;
    case 'electrolytic':
      return `${formatFarads(Number(pr.farads ?? 1e-5)).replace('µ', 'u')} 25V electrolytic capacitor`;
    case 'led':
      return `5mm ${pr.color ?? 'red'} LED`;
    case 'dc-supply':
      return `${pr.volts ?? 12}V ${pr.amps ?? 2}A DC power adapter 5.5x2.1mm`;
    default:
      return def.bom.supplierQuery;
  }
}

function naturalRefCompare(a: string, b: string): number {
  const ma = /^([A-Z]+)(\d+)$/.exec(a);
  const mb = /^([A-Z]+)(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
  return a.localeCompare(b);
}

function supply(key: string, name: string, description: string, unitPrice: number, query: string, extra: Partial<BomLine> = {}): BomLine {
  const quantity = extra.quantity ?? 1;
  return {
    key: `supply:${key}`,
    kind: 'supply',
    category: 'supply',
    quantity,
    refs: [],
    references: '',
    name,
    description,
    value: '',
    mpn: '',
    footprint: '',
    unitPrice,
    linePrice: round2(unitPrice * quantity),
    suppliers: [LINKS.digikey(query), LINKS.mouser(query), LINKS.aliexpress(query), LINKS.adafruit(query)],
    ...extra,
  };
}

/** The extra things a beginner needs to actually build the project on a bench. */
function supplies(project: Project): BomLine[] {
  const out: BomLine[] = [];
  // Breadboard and wires: the same counts as the Build guide's hole-by-hole layout.
  const bench = benchCounts(project);
  out.push(
    supply('breadboard', bench.breadboards > 1 ? 'Breadboards (830 points, full size)' : 'Breadboard (830 points, full size)', `Solderless breadboard, 830 tie points: the Build guide's hole-by-hole layout is for this size${bench.breadboards > 1 ? ' (two boards joined end to end)' : ''}.${project.board === 'esp32' ? ' The ESP32 DevKit is wide, so a half-size board leaves no room for wires.' : ''}`, 5, '830 point solderless breadboard', { quantity: bench.breadboards }),
  );
  if (bench.cobbler) {
    out.push(supply('cobbler', '40-pin T-Cobbler with ribbon cable', "Breakout board and 40-way ribbon cable that bring the Raspberry Pi's GPIO header onto the breadboard, pin names printed.", 6, 'Raspberry Pi 40 pin T-Cobbler breakout ribbon cable'));
  }
  if (bench.jumpers > 0) {
    out.push(
      supply('jumpers-mm', 'Jumper wires, male-to-male', `Pack of 40 breadboard jumper wires (this build uses ${bench.jumpers}).`, 3, 'male to male jumper wires 40 pack', {
        quantity: Math.max(1, Math.ceil(jumpersToBuy(bench.jumpers) / 40)),
        note: 'Pre-cut solid-core wire kits also work and look tidier.',
      }),
    );
  }
  if (bench.femaleLeads > 0) {
    out.push(
      supply('jumpers-fm', 'Jumper wires, female-to-male', `Pack of 40 jumper wires with a socket on one end, for the parts that sit off the breadboard (this build uses ${bench.femaleLeads}).`, 3, 'female to male jumper wires 40 pack', {
        quantity: Math.max(1, Math.ceil(bench.femaleLeads / 40)),
      }),
    );
  }
  // Power / programming cables
  if (project.board === 'esp32' || project.board === 'pico' || project.board === 'nicla-vision' || project.board === 'nicla-voice') {
    const board = boardFor(project.board)!;
    out.push(
      supply('usb-micro', 'Micro-USB cable (data)', `USB-A (or USB-C) to micro-USB cable to power and program the ${board.name}.`, 3, 'micro USB data cable', {
        note: 'It must be a data cable — many cheap "charge-only" cables have no data wires and the board will never show up on your computer.',
      }),
    );
  } else if (project.board === 'rpi4') {
    out.push(
      supply('usb-c-psu', 'USB-C power supply (5 V, 3 A)', 'Official Raspberry Pi 15 W USB-C power supply (or any good 5 V 3 A USB-C supply).', 8, 'Raspberry Pi 4 USB-C power supply 5V 3A', {
        note: 'Phone chargers often sag under load and cause random crashes and the lightning-bolt "under-voltage" warning.',
      }),
      supply('microsd', 'microSD card (16 GB or larger)', 'Class 10 / A1 microSD card for Raspberry Pi OS.', 6, '16GB microSD card A1 class 10'),
    );
  }
  if (project.parts.some((p) => p.type === 'battery-9v')) {
    out.push(supply('9v-snap', '9 V battery snap clip', 'PP3 battery snap with red/black wire leads that push into the breadboard.', 0.5, '9V battery snap connector wire leads'));
  }
  if (project.parts.some((p) => p.type === 'dc-supply')) {
    out.push(supply('barrel-terminal', 'DC barrel jack to screw terminal adapter (5.5 × 2.1 mm, female)', 'Plugs onto the adapter\'s barrel plug; its + and − screw terminals take the jumper wires to the parts that need the separate supply.', 1, 'DC barrel jack female 5.5x2.1mm screw terminal adapter'));
  }
  // Recommended extras
  if (project.parts.some((p) => p.type === 'neopixel-ring')) {
    out.push(
      supply('neopixel-cap', 'Capacitor 1000 µF, 10 V or higher', 'Electrolytic capacitor across the NeoPixel ring\'s 5 V and GND, to absorb current spikes (recommended).', 0.3, '1000uF 16V electrolytic capacitor', { optional: true }),
    );
  }
  if (project.parts.some((p) => p.type === 'servo') && project.board !== 'none') {
    out.push(
      supply('servo-cap', 'Capacitor 470 µF, 10 V or higher', 'Electrolytic capacitor across the servo\'s 5 V and GND; stops the board resetting when the servo starts moving (recommended).', 0.25, '470uF 16V electrolytic capacitor', { optional: true }),
    );
  }
  return out;
}

/** Group the project's parts into BOM lines and append the build supplies. */
export function buildBom(project: Project): BomLine[] {
  const groups = new Map<string, { part: PartInstance; def: PartDef; refs: string[] }>();
  for (const part of project.parts) {
    let def: PartDef;
    try {
      def = partDef(part.type);
    } catch {
      continue; // unknown part type (e.g. from a newer project file) — skip rather than crash
    }
    const key = `${part.type}|${partValue(part)}`;
    const g = groups.get(key);
    const ref = part.ref ?? part.id;
    if (g) g.refs.push(ref);
    else groups.set(key, { part, def, refs: [ref] });
  }
  const lines: BomLine[] = [...groups.entries()].map(([key, { part, def, refs }]) => {
    const value = partValue(part);
    refs.sort(naturalRefCompare);
    const unit = def.bom.priceUsd;
    return {
      key,
      kind: 'part',
      type: part.type,
      category: def.category,
      quantity: refs.length,
      refs,
      references: refs.join(', '),
      name: def.name,
      description: value ? `${def.bom.description}, ${value}` : def.bom.description,
      value,
      mpn: def.bom.mpn,
      footprint: part.props?.footprint ?? def.bom.footprint ?? def.kicad.footprint ?? '',
      unitPrice: unit,
      linePrice: round2(unit * refs.length),
      suppliers: supplierLinks(searchQuery(part, def), def.category),
    };
  });
  lines.sort((a, b) => {
    const c = CATEGORY_ORDER.indexOf(a.category!) - CATEGORY_ORDER.indexOf(b.category!);
    if (c) return c;
    return naturalRefCompare(a.refs[0] ?? '', b.refs[0] ?? '');
  });
  return [...lines, ...supplies(project)];
}

/** Sum of line prices in USD. By default includes supplies and optional extras. */
export function bomTotal(lines: BomLine[], opts: { supplies?: boolean; optional?: boolean } = {}): number {
  const { supplies: inclSupplies = true, optional = false } = opts;
  return round2(lines.filter((l) => (inclSupplies || l.kind === 'part') && (optional || !l.optional)).reduce((s, l) => s + l.linePrice, 0));
}

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const BOM_CSV_HEADER = ['Qty', 'References', 'Name', 'Value', 'Description', 'MPN', 'Footprint', 'Unit price (USD)', 'Line price (USD)', 'Kind', 'Notes', 'DigiKey', 'Mouser', 'AliExpress', 'Hobby shop'];

/** RFC 4180 CSV (comma separated, quoted where needed, CRLF line endings) with a header row. */
export function bomToCsv(lines: BomLine[]): string {
  const rows: (string | number)[][] = [BOM_CSV_HEADER];
  for (const l of lines) {
    const link = (name: string) => l.suppliers.find((s) => s.name === name)?.url ?? '';
    const hobby = l.suppliers.find((s) => s.name === 'Adafruit' || s.name === 'SparkFun')?.url ?? '';
    rows.push([
      l.quantity,
      l.references,
      l.name,
      l.value,
      l.description,
      l.mpn,
      l.footprint,
      l.unitPrice.toFixed(2),
      l.linePrice.toFixed(2),
      l.kind === 'part' ? 'part' : l.optional ? 'supply (optional)' : 'supply',
      l.note ?? '',
      link('DigiKey'),
      link('Mouser'),
      link('AliExpress'),
      hobby,
    ]);
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** "$12.34" */
export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
