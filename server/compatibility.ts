import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Project } from '../src/core/types';
import { canonicalJson, compareInventory, normalizeInventory, parseNetlist, type CircuitInventory, type CompatibilityReport } from '../src/core/compatibility';
import { registerProjectParts } from '../src/core/customParts';
import { partDef, footprintOf } from '../src/core/parts';
import { annotate, buildNets } from '../src/core/netlist';
import { defaultValue, pinNumber } from '../src/core/symbols';
import { exportKicadSchematic, exportKicadProject } from '../src/core/kicad';

const text = z.string().max(1000);
const endpoint = z.object({ part: text, pin: text });
const projectSchema = z.object({
  id: text, name: text, summary: text, version: z.literal(1),
  board: z.enum(['esp32', 'pico', 'rpi4', 'none']),
  createdAt: z.number().finite(), updatedAt: z.number().finite(),
  parts: z.array(z.object({ id: text, type: text, ref: text.optional(), props: z.record(z.string(), z.unknown()), x: z.number().finite(), y: z.number().finite(), rotate: z.number().finite().optional() }).passthrough()).min(1).max(100),
  wires: z.array(z.object({ id: text, a: endpoint, b: endpoint }).passthrough()).max(1000),
  files: z.record(z.string(), z.string()), notes: z.array(text),
  customParts: z.array(z.object({ type: text, pins: z.array(z.object({ name: text }).passthrough()).min(1).max(100), sim: z.object({ kind: text }).passthrough() }).passthrough()).max(100).optional(),
}).passthrough();

export function validateCompatibilityProject(value: unknown): Project {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > 2_000_000) throw new Error('Project exceeds the 2 MB compatibility limit');
  projectSchema.parse(value);
  return value as Project;
}

export function projectHash(project: Project): string {
  return createHash('sha256').update(canonicalJson(project)).digest('hex');
}

export function projectInventory(project: Project): CircuitInventory {
  const ids = new Set<string>();
  for (const p of project.parts) {
    if (!/^[A-Za-z0-9_-]+$/.test(p.id) || ids.has(p.id)) throw new Error(`Invalid or duplicate part ID: ${p.id}`);
    if (!p.ref || !/^[A-Za-z][A-Za-z0-9_]*$/.test(p.ref)) throw new Error(`Invalid reference: ${p.ref}`);
    ids.add(p.id);
    const pins = partDef(p.type).pins;
    if (new Set(pins.map((pin) => pin.name)).size !== pins.length) throw new Error(`Duplicate pin names on ${p.ref}`);
    const pads = pins.map((pin) => pinNumber(p.type, pin.name));
    if (pads.includes('0') || new Set(pads).size !== pads.length) throw new Error(`Ambiguous physical pin mapping on ${p.ref}`);
  }
  const byId = new Map(project.parts.map((p) => [p.id, p]));
  for (const wire of project.wires) for (const end of [wire.a, wire.b]) {
    const p = byId.get(end.part);
    if (!p || !partDef(p.type).pins.some((pin) => pin.name === end.pin)) throw new Error(`Dangling wire endpoint: ${end.part}.${end.pin}`);
  }
  return normalizeInventory({
    components: project.parts.map((p) => ({ ref: p.ref!, value: defaultValue(partDef(p.type), p.props), footprint: footprintOf(p) })),
    nets: buildNets(project).nets.map((n) => n.pins.map((p) => `${byId.get(p.part)!.ref}.${pinNumber(byId.get(p.part)!.type, p.pin)}`)),
  });
}

async function command(cli: string, args: string[], dir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cli, args, { cwd: dir, timeout: 45_000, killSignal: 'SIGKILL', maxBuffer: 4_000_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${args.join(' ')}: ${err.message}\n${stderr.slice(0, 3000)}`));
      else resolve(stdout);
    });
  });
}

export async function runCompatibility(input: Project, dir: string, options: { cli?: string; expected?: CircuitInventory; sourceCommit?: string } = {}): Promise<CompatibilityReport> {
  const startedAt = new Date().toISOString();
  const report: CompatibilityReport = {
    schemaVersion: 1,
    project: { id: input.id, name: input.name, updatedAt: input.updatedAt, sha256: projectHash(input) },
    sourceCommit: options.sourceCommit, startedAt, finishedAt: startedAt,
    tool: { name: 'KiCad', version: null }, status: 'blocked', checks: [],
    warnings: [
      'Schematic interoperability only: no PCB routing, footprint geometry, firmware execution or physical hardware certification.',
      'Ad-hoc projects are compared against Sparkbench’s model; only lab fixtures also have independently written expectations.',
    ],
    otherTargets: ['Flux', 'EasyEDA', 'Altium', 'Wokwi', 'ngspice'].map((name) => ({ name, status: 'not-tested', reason: 'No verified adapter in this lab version. No project was uploaded to this service.' })),
  };
  await mkdir(dir, { recursive: true });
  const add = (id: string, label: string, status: 'passed' | 'failed' | 'blocked', detail: string) => report.checks.push({ id, label, status, detail });
  const finish = async () => {
    report.status = report.checks.some((c) => c.status === 'failed') ? 'failed' : report.checks.some((c) => c.status === 'blocked') ? 'blocked' : 'passed';
    report.finishedAt = new Date().toISOString();
    await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
    return report;
  };
  let expected: CircuitInventory;
  let project: Project;
  try {
    validateCompatibilityProject(input);
    registerProjectParts(input);
    const missingRefs = input.parts.filter((p) => !p.ref).length;
    if (missingRefs && missingRefs !== input.parts.length) throw new Error('Some parts lack references. Annotate the complete project before checking compatibility to avoid renumbering existing references.');
    project = missingRefs ? annotate(input) : input;
    if (missingRefs) report.warnings.push('No component references were supplied; references were assigned before export.');
    expected = projectInventory(project);
    await writeFile(join(dir, 'expected.json'), JSON.stringify(options.expected ?? expected, null, 2));
    if (options.expected) {
      const differences = compareInventory(options.expected, expected);
      add('reference', 'Independent fixture expectations', differences.length ? 'failed' : 'passed', differences.join('\n') || 'Model matches the hand-written component and physical-pin expectations.');
    }
    await writeFile(join(dir, 'design.kicad_sch'), exportKicadSchematic(project));
    await writeFile(join(dir, 'design.kicad_pro'), exportKicadProject(project));
    add('export', 'Export generated', 'passed', 'Created an embedded-symbol KiCad schematic; this alone does not prove compatibility.');
  } catch (err) {
    add('export', 'Export generated', 'failed', String(err));
    return finish();
  }
  const cli = options.cli ?? process.env.KICAD_CLI ?? 'kicad-cli';
  try {
    report.tool.version = (await command(cli, ['version'], dir)).trim();
    if (!/^([89]|[1-9]\d)\./.test(report.tool.version)) throw new Error(`KiCad 8+ required; found ${report.tool.version}`);
  } catch (err) {
    add('tool', 'KiCad available', 'blocked', String(err));
    return finish();
  }
  try {
    await command(cli, ['sch', 'export', 'netlist', '--format', 'kicadsexpr', '-o', join(dir, 'imported.net'), join(dir, 'design.kicad_sch')], dir);
    const actual = parseNetlist(await readFile(join(dir, 'imported.net'), 'utf8'));
    await writeFile(join(dir, 'actual.json'), JSON.stringify(actual, null, 2));
    add('import', 'File accepted', 'passed', 'KiCad opened the schematic and generated a parseable netlist.');
    const differences = compareInventory(options.expected ?? expected, actual);
    add('connectivity', 'Circuit preserved', differences.length ? 'failed' : 'passed', differences.join('\n') || 'Component references, values, footprint identifiers and physical-pin connections match.');
  } catch (err) {
    add('import', 'File accepted', 'failed', String(err));
  }
  try {
    await command(cli, ['sch', 'erc', '--format', 'json', '--severity-all', '-o', join(dir, 'erc.json'), join(dir, 'design.kicad_sch')], dir);
    const erc = JSON.parse(await readFile(join(dir, 'erc.json'), 'utf8'));
    if (!Array.isArray(erc.sheets) || !erc.sheets.length || erc.sheets.some((s: any) => !Array.isArray(s.violations))) throw new Error('Unrecognized ERC report');
    const violations = erc.sheets.flatMap((s: any) => s.violations) as { type: string; severity: string; description: string }[];
    const libraryTypes = new Set(['lib_symbol_issues', 'lib_symbol_mismatch', 'footprint_link_issues']);
    const library = violations.filter((v) => libraryTypes.has(v.type));
    if (library.length) report.warnings.push(`Library checks not certified (${library.length} findings): ${library.map((v) => `${v.type}: ${v.description}`).join('; ')}`);
    const electrical = violations.filter((v) => !libraryTypes.has(v.type));
    add('erc', 'Electrical rules', electrical.length ? 'failed' : 'passed', electrical.map((v) => `${v.severity} ${v.type}: ${v.description}`).join('\n') || 'No electrical findings. Library findings, if any, are listed separately as warnings.');
  } catch (err) {
    add('erc', 'Electrical rules', 'failed', String(err));
  }
  try {
    const plots = join(dir, 'plots');
    await mkdir(plots, { recursive: true });
    await command(cli, ['sch', 'export', 'svg', '-o', plots, join(dir, 'design.kicad_sch')], dir);
    const names = (await readdir(plots)).filter((f) => f.endsWith('.svg'));
    if (!names.length || !(await readFile(join(plots, names[0]), 'utf8')).includes('<svg')) throw new Error('No SVG produced');
    add('render', 'Render generated', 'passed', 'KiCad generated an SVG. This is not a visual review or an editing test.');
  } catch (err) {
    add('render', 'Render generated', 'failed', String(err));
  }
  report.checks.push({ id: 'editing', label: 'Interactive editing / running', status: 'not-tested', detail: 'CLI import and rendering do not prove interactive editing or firmware execution.' });
  return finish();
}
