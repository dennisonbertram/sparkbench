// "Add any component": Claude finds and reads the part's datasheet on the web, extracts a
// CustomPartSpec, and the result is saved as a Claude Code skill in .claude/skills/part-<slug>/
// (SKILL.md for people and AI, part.json for Sparkbench, driver.py when there is one).
import { z } from 'zod';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { askJson } from './llm';
import { slugType, validateSpec, type CustomPartSpec } from '../src/core/customParts';
import { PARTS } from '../src/core/parts';
import { mode, type RequestContext } from './tenancy/context';
import { listWorkspaceParts, saveWorkspacePart } from './tenancy/repo';

const SKILLS_DIR = join(process.cwd(), '.claude', 'skills');

const PinSchema = z.object({
  name: z.string().describe('Pin label as printed on the breakout/module (or the chip pin name for bare ICs), e.g. "VCC", "SDA", "OUT"'),
  role: z.enum(['power', 'gnd', 'io', 'passive', 'nc']),
  fn: z.enum(['i2c.sda', 'i2c.scl', 'spi.sck', 'spi.mosi', 'spi.miso', 'spi.cs', 'adc', 'digital-in', 'digital-out', 'pwm', 'irq', 'uart.tx', 'uart.rx', 'onewire', 'none']).describe('What the board pin it connects to must do (from the board\'s point of view: a sensor output is "digital-in" or "adc")'),
  description: z.string(),
  required: z.boolean().describe('false if the pin can be left unconnected in a basic hookup'),
});

const PartSchema = z.object({
  found: z.boolean().describe('false if no datasheet could be found for this part'),
  mpn: z.string().describe('Manufacturer part number, e.g. "BME280"'),
  name: z.string().describe('Short friendly name, e.g. "BME280 temperature/humidity/pressure sensor"'),
  category: z.enum(['display', 'input', 'sensor', 'output', 'actuator', 'passive', 'power', 'ic']),
  form: z.string().describe('The form a hobbyist would buy, e.g. "GY-BME280 breakout (4-pin)"; describe pins for THIS form'),
  description: z.string().describe('1-2 factual sentences: what it measures/does, interface, supply range'),
  eli5: z.string().describe('One friendly sentence for a total beginner'),
  refPrefix: z.string().describe('Reference designator prefix: U for modules/ICs, R, D, SW, M, K…'),
  interface: z.enum(['i2c', 'spi', 'analog', 'digital-in', 'digital-out', 'pwm', 'uart', 'onewire', 'power', 'passive']),
  pins: z.array(PinSchema),
  vmin: z.number().describe('Minimum supply voltage of the module'),
  vmax: z.number().describe('Maximum supply voltage of the module'),
  currentMa: z.number().describe('Typical supply current in mA'),
  i2cAddress: z.number().nullable().describe('Default 7-bit I2C address as a number (e.g. 118 for 0x76); null if not I2C'),
  datasheetUrl: z.string(),
  priceUsd: z.number().describe('Typical hobby price of the module in USD'),
  supplierQuery: z.string().describe('Good search query for buying it'),
  footprint: z.string().nullable().describe('KiCad footprint lib:name if a standard one fits (e.g. Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical), else null'),
  buildNotes: z.array(z.string()).describe('2-5 practical wiring/handling tips from the datasheet'),
  sim: z.object({
    kind: z.enum(['analog-sensor', 'digital-sensor', 'actuator', 'i2c-device', 'none']),
    outputPin: z.string().nullable(),
    inputPin: z.string().nullable(),
    quantity: z.string().nullable().describe('What the user changes in simulation, e.g. "Temperature"'),
    unit: z.string().nullable(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    default: z.number().nullable(),
    vAtMin: z.number().nullable().describe('analog-sensor: output volts at min'),
    vAtMax: z.number().nullable().describe('analog-sensor: output volts at max'),
    activeHigh: z.boolean().nullable(),
    registers: z.array(z.object({ reg: z.number(), value: z.number() })).describe('i2c-device: fixed registers such as chip-id/WHO_AM_I'),
    measure: z
      .object({ reg: z.number(), bytes: z.number(), scale: z.number(), offset: z.number(), signed: z.boolean(), littleEndian: z.boolean(), shift: z.number() })
      .nullable()
      .describe('i2c-device: register holding the main measurement with value = raw*scale+offset (raw = big/little-endian bytes >> shift); null if the conversion is too complex (e.g. needs calibration)'),
  }),
  driver: z.object({ filename: z.string(), code: z.string() }).nullable().describe('For I2C/SPI/protocol parts: a small, complete MicroPython driver (class with read methods) written from the datasheet register map; null for simple analog/digital parts'),
  skill: z.string().describe('Markdown body (no frontmatter) of a reference skill for this part: Overview; Pinout table; Electrical limits; Interface details (address, key registers/timing); Wiring for ESP32, Raspberry Pi Pico and Raspberry Pi 4; Using the driver (example MicroPython code); Gotchas; Datasheet link'),
});

const SYSTEM = `You are the component librarian inside Sparkbench, a hardware design studio for beginners.
Given a part name, MPN or datasheet URL: find the real datasheet on the web (prefer the manufacturer's PDF), read it, and describe the part as a hobbyist would buy it (usually a breakout module). Be precise: pin names, voltages, I2C addresses and register addresses must come from the datasheet. If a field is not in the datasheet, use a conservative, common value and say so in the skill. Never invent a part: if you cannot find it, set found=false.`;

export function listParts(): CustomPartSpec[] {
  if (!existsSync(SKILLS_DIR)) return [];
  const out: CustomPartSpec[] = [];
  for (const d of readdirSync(SKILLS_DIR)) {
    const f = join(SKILLS_DIR, d, 'part.json');
    if (d.startsWith('part-') && existsSync(f)) {
      try {
        out.push(JSON.parse(readFileSync(f, 'utf8')));
      } catch {}
    }
  }
  return out;
}

/**
 * Find a part's datasheet and turn it into a part. Locally the part is saved as a Claude Code skill
 * folder (as before); when hosted it belongs to the asking workspace and is stored in the database,
 * so one workspace's parts never appear in another's library.
 */
export async function fetchPart(ctx: RequestContext, query: string): Promise<{ spec: CustomPartSpec; skillDir: string | null; reused: boolean }> {
  // Already known? (the shared library, this workspace's own parts, or a built-in)
  const q = query.toLowerCase().trim();
  const hosted = mode() === 'hosted';
  const mine = hosted ? await listWorkspaceParts(ctx) : [];
  const known = [...listParts(), ...mine].find((s) => s.mpn.toLowerCase() === q || s.type === slugType(q));
  if (known) return { spec: known, skillDir: hosted ? null : join(SKILLS_DIR, `part-${known.type.replace(/^custom-/, '')}`), reused: true };
  const builtin = PARTS.find((p) => p.keywords.includes(q) || p.name.toLowerCase().includes(q) || p.bom.mpn.toLowerCase().includes(q));
  if (builtin) throw new Error(`“${query}” is already in the built-in library as “${builtin.name}”. Add it from the list instead.`);

  const d = await askJson(SYSTEM, [{ role: 'user', content: `Part: ${query}` }], PartSchema, { effort: 'medium', web: true });
  if (!d.found) throw new Error(`I couldn't find a datasheet for “${query}”. Try the exact part number (e.g. “BME280”) or paste the datasheet URL.`);
  const spec: CustomPartSpec = {
    type: slugType(d.mpn),
    name: d.name,
    mpn: d.mpn,
    category: d.category,
    description: `${d.description} Sold as: ${d.form}.`,
    eli5: d.eli5,
    refPrefix: d.refPrefix || 'U',
    interface: d.interface,
    pins: d.pins.map((p) => ({ name: p.name, role: p.role, fn: p.fn === 'none' ? undefined : p.fn, description: p.description, required: p.required })),
    vmin: d.vmin,
    vmax: d.vmax,
    currentMa: d.currentMa,
    i2cAddress: d.i2cAddress ?? undefined,
    datasheetUrl: d.datasheetUrl,
    priceUsd: d.priceUsd,
    supplierQuery: d.supplierQuery,
    footprint: d.footprint ?? undefined,
    buildNotes: d.buildNotes,
    keywords: [d.mpn.toLowerCase(), ...d.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)],
    sim: {
      kind: d.sim.kind,
      outputPin: d.sim.outputPin ?? undefined,
      inputPin: d.sim.inputPin ?? undefined,
      quantity: d.sim.quantity ?? undefined,
      unit: d.sim.unit ?? undefined,
      min: d.sim.min ?? undefined,
      max: d.sim.max ?? undefined,
      default: d.sim.default ?? undefined,
      vAtMin: d.sim.vAtMin ?? undefined,
      vAtMax: d.sim.vAtMax ?? undefined,
      activeHigh: d.sim.activeHigh ?? undefined,
      registers: Object.fromEntries(d.sim.registers.map((r) => [`0x${r.reg.toString(16)}`, r.value])),
      measure: d.sim.measure ? { ...d.sim.measure, reg: `0x${d.sim.measure.reg.toString(16)}` } : undefined,
    },
    driver: d.driver ?? undefined,
  };
  const errs = validateSpec(spec);
  if (errs.length) throw new Error(`The datasheet extraction for ${d.mpn} looked wrong (${errs.join('; ')}). Try again or give the exact part number.`);
  if (hosted) {
    spec.skill = skillMarkdown(spec, d.skill);
    await saveWorkspacePart(ctx, spec);
    return { spec, skillDir: null, reused: false };
  }
  const skillDir = writeSkill(spec, d.skill);
  spec.skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
  writeFileSync(join(skillDir, 'part.json'), JSON.stringify(spec, null, 2));
  return { spec, skillDir, reused: false };
}

/** The part's SKILL.md (frontmatter + body). */
function skillMarkdown(spec: CustomPartSpec, body: string): string {
  const slug = spec.type.replace(/^custom-/, '');
  return `---
name: part-${slug}
description: Pinout, electrical limits, wiring and MicroPython driver for the ${spec.name} (${spec.mpn}). Use when designing, wiring, simulating or writing code for a ${spec.mpn} in a Sparkbench project or any ESP32 / Raspberry Pi Pico / Raspberry Pi build.
---

# ${spec.name} (${spec.mpn})

${body.trim()}

---
*Generated by Sparkbench from the datasheet: ${spec.datasheetUrl ?? 'n/a'}. Machine-readable definition: \`part.json\`${spec.driver ? `; driver: \`${spec.driver.filename}\`` : ''}.*
`;
}

/** Write the part as a Claude Code skill folder. */
function writeSkill(spec: CustomPartSpec, body: string): string {
  const slug = spec.type.replace(/^custom-/, '');
  const dir = join(SKILLS_DIR, `part-${slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), skillMarkdown(spec, body));
  if (spec.driver) writeFileSync(join(dir, spec.driver.filename), spec.driver.code);
  return dir;
}
