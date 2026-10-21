// Build a manufacturable circuit board for a project with open-source tools:
// pcbnew (placement, outline, ground pour) → Freerouting (auto-routing) → kicad-cli (DRC, Gerbers,
// drill, pick-and-place, 3D render, STEP) → JLCPCB-style BOM + CPL.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Project } from '../src/core/types';
import { pcbSpec, FABS, type PcbSpec, type FabId } from '../src/core/pcb';
import { exportKicadFootprints, exportKicadProject, exportKicadSchematic } from '../src/core/kicad';
import { partDef as partDefSync } from '../src/core/parts';
import { revLabel } from '../src/core/revisions';

const KICAD_APP = [process.env.KICAD_APP, join(homedir(), 'Applications/KiCad.app'), '/Applications/KiCad/KiCad.app', '/Applications/KiCad.app'].find((p) => p && existsSync(p));
export const KICAD_CLI = KICAD_APP ? join(KICAD_APP, 'Contents/MacOS/kicad-cli') : ['/usr/bin/kicad-cli', '/usr/local/bin/kicad-cli'].find(existsSync);
const KICAD_PY = KICAD_APP ? join(KICAD_APP, 'Contents/Frameworks/Python.framework/Versions/Current/bin/python3') : '/usr/bin/python3';
export const FP_DIR = KICAD_APP ? join(KICAD_APP, 'Contents/SharedSupport/footprints') : '/usr/share/kicad/footprints';
export const FREEROUTING = [process.env.FREEROUTING_JAR, join(homedir(), '.cache/sparkbench/freerouting/freerouting-2.5.0.jar')].find((p) => p && existsSync(p));
const JAVA = [process.env.JAVA, '/opt/homebrew/opt/openjdk/bin/java', '/usr/local/opt/openjdk/bin/java', '/usr/lib/jvm/default-java/bin/java', '/usr/lib/jvm/java-25-openjdk-amd64/bin/java', '/usr/lib/jvm/java-25-openjdk-arm64/bin/java', '/usr/bin/java'].find((p) => p && existsSync(p));

export function pcbToolsStatus() {
  return { kicad: !!KICAD_CLI && existsSync(KICAD_PY), freerouting: !!FREEROUTING && !!JAVA };
}

function run(cmd: string, args: string[], timeout = 600_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ code: err ? ((err as any).code ?? 1) : 0, out: `${stdout}${stderr}` }));
  });
}

export interface DrcItem {
  severity: string;
  type: string;
  description: string;
}

export interface PcbResult {
  dir: string;
  name: string;
  widthMm: number;
  heightMm: number;
  routed: boolean;
  unrouted: number | null;
  tracks: number;
  vias: number;
  drc: { errors: DrcItem[]; warnings: DrcItem[]; unconnected: number };
  files: string[];
  problems: string[];
  log: string[];
  /** Live parts data, cost at 5/50/500 boards, and design-for-manufacture notes (null when offline). */
  sourcing: PcbSourcing | null;
  fab: { id: FabId; name: string; track: number; drill: number; quote: string };
  variant: 'prototype' | 'product';
  /** The V-scored panel, if one was made. */
  panel: { rows: number; cols: number; drcErrors: number } | null;
  /** What the product version changed. */
  productNotes: string[];
  /** Where each part is (origin and reserved area, mm from the board's top-left), for the board editor. */
  placement: { ref: string; x: number; y: number; rot: number; reserved: [number, number, number, number] }[];
}

export interface PcbSourcing {
  lines: { ref: string; item: string; quantity: number; lcsc: string | null; mfr: string | null; stock: number; basic: boolean; unit: number | null; url: string | null }[];
  cost: { boards: number; parts: number; perBoard: number; missing: number }[];
  dfm: { level: 'ok' | 'note' | 'warn'; text: string }[];
}

/** Lay out, route, check and export a board for `project` into `dir`. */
export interface PcbOptions {
  fab?: FabId;
  /** Printed as a QR code on the board (e.g. the project's blog post or repo). */
  qrUrl?: string;
  /** User-arranged part positions (from the board editor). */
  fixed?: Record<string, { x: number; y: number; rot: number }>;
  /** 'product': bare module + support circuit + surface-mount parts (see production.ts). */
  variant?: 'prototype' | 'product';
  /** Several boards on one V-scored panel (KiKit), e.g. { rows: 2, cols: 2 }. */
  panel?: { rows: number; cols: number };
}

const KIKIT_LIB = join(homedir(), '.cache/sparkbench/kikit-lib');
export const kikitAvailable = () => existsSync(join(KIKIT_LIB, 'kikit'));

export async function buildPcb(source: Project, dir: string, onStep: (msg: string) => void = () => {}, opts: PcbOptions = {}): Promise<PcbResult> {
  if (!KICAD_CLI) throw new Error('KiCad is not installed (needed for circuit boards).');
  let project = source;
  let productNotes: string[] = [];
  if (opts.variant === 'product') {
    const { productionize } = await import('../src/core/production');
    const pr = productionize(source);
    project = pr.project;
    productNotes = pr.notes;
  }
  const spec: PcbSpec = pcbSpec(project, { fab: opts.fab });
  if (opts.qrUrl) {
    const QRCode = (await import('qrcode')).default;
    const q = QRCode.create(opts.qrUrl, { errorCorrectionLevel: 'M' });
    const n = q.modules.size;
    spec.qr = { url: opts.qrUrl, modules: Array.from({ length: n + 4 }, (_, r) => Array.from({ length: n + 4 }, (_, c) => r >= 2 && c >= 2 && r < n + 2 && c < n + 2 && !!q.modules.get(r - 2, c - 2))) };
  }
  (spec as any).fabRules = FABS[spec.fab];
  if (opts.fixed && Object.keys(opts.fixed).length) spec.fixed = opts.fixed;
  (spec as any).rev = revLabel(project);
  mkdirSync(dir, { recursive: true });
  const log: string[] = [];
  const step = (m: string) => (log.push(m), onStep(m));

  // Generated footprints (e.g. the ESP32 DevKit) live in a Sparkbench.pretty next to the board.
  for (const [f, src] of Object.entries(exportKicadFootprints(project))) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), src);
  }
  // A full KiCad project around the board: rules + net classes (.kicad_pro) and the schematic.
  writeFileSync(join(dir, `${spec.name}.kicad_pro`), exportKicadProject(project, FABS[spec.fab]));
  writeFileSync(join(dir, `${spec.name}.kicad_sch`), exportKicadSchematic(project));
  // Edge connectors (USB) are meant to sit on the board edge: relax edge clearance for them only.
  const edgeRefs = spec.parts.filter((p) => p.flushEdge !== undefined).map((p) => p.ref);
  writeFileSync(
    join(dir, `${spec.name}.kicad_dru`),
    `(version 1)\n${edgeRefs.map((r) => `(rule "${r} sits on the board edge"\n  (constraint edge_clearance (min 0mm))\n  (condition "A.memberOfFootprint('${r}')"))\n`).join('')}`,
  );
  // Net names come from KiCad's own reading of the schematic, so the board and schematic agree
  // exactly (and any disagreement with Sparkbench's netlist is caught here).
  const problems: string[] = [];
  const netlistPath = join(dir, `${spec.name}.net`);
  await run(KICAD_CLI, ['sch', 'export', 'netlist', '--format', 'kicadsexpr', '--output', netlistPath, join(dir, `${spec.name}.kicad_sch`)]);
  if (existsSync(netlistPath)) problems.push(...adoptKicadNets(spec, readFileSync(netlistPath, 'utf8')));
  else problems.push('KiCad could not read the schematic to export its netlist.');
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec, null, 1));

  step('Placing parts and drawing the board outline');
  const py = await run(KICAD_PY, [join(process.cwd(), 'scripts/pcb/make_pcb.py'), join(dir, 'spec.json'), dir, '--fplib-dir', FP_DIR, '--fplib-dir', dir, ...(FREEROUTING && JAVA ? ['--java', JAVA, '--freerouting', FREEROUTING] : [])]);
  if (py.code !== 0 || !existsSync(join(dir, 'layout.json'))) throw new Error(`Board layout failed: ${py.out.slice(-1500)}`);
  const layout = JSON.parse(readFileSync(join(dir, 'layout.json'), 'utf8'));
  step(layout.routed ? `Routed ${layout.tracks} tracks and ${layout.vias} vias` : 'Routing did not complete');
  // Say why: the router's own last words (e.g. a Java version mismatch) beat a bare "did not complete".
  if (!layout.routed && layout.route_log_tail) {
    const why = String(layout.route_log_tail).split('\n').map((l: string) => l.trim()).filter((l: string) => /error|exception|unsupported|timed out/i.test(l)).slice(-2);
    if (why.length) step(`Router: ${why.join(' / ').slice(0, 300)}`);
  }
  const pcb = layout.pcb as string;

  step('Checking design rules (KiCad DRC)');
  const drcPath = join(dir, 'drc.json');
  await run(KICAD_CLI, ['pcb', 'drc', '--format', 'json', '--severity-all', '--schematic-parity', '--output', drcPath, pcb]);
  let drcRaw = existsSync(drcPath) ? JSON.parse(readFileSync(drcPath, 'utf8')) : { violations: [], unconnected_items: [] };
  if ((drcRaw.violations ?? []).some((v: any) => v.type === 'starved_thermal')) {
    // A ground pad that only fits one thermal spoke gets a solid connection instead; then re-check.
    step('Strengthening ground connections and re-checking');
    await run(KICAD_PY, [join(process.cwd(), 'scripts/pcb/fix_thermals.py'), pcb, drcPath]);
    await run(KICAD_CLI, ['pcb', 'drc', '--format', 'json', '--severity-all', '--schematic-parity', '--output', drcPath, pcb]);
    drcRaw = JSON.parse(readFileSync(drcPath, 'utf8'));
  }
  // lib_footprint_issues only means this KiCad has no global library table to compare against.
  const items: DrcItem[] = [
    ...(drcRaw.violations ?? []).filter((v: any) => v.type !== 'lib_footprint_issues').map((v: any) => ({ severity: v.severity, type: v.type, description: v.description })),
    ...(drcRaw.schematic_parity ?? []).map((v: any) => ({ severity: 'error', type: `schematic_parity:${v.type}`, description: v.description })),
  ];
  const drc = { errors: items.filter((i) => i.severity === 'error'), warnings: items.filter((i) => i.severity !== 'error'), unconnected: (drcRaw.unconnected_items ?? []).length };

  step('Exporting manufacturing files');
  const fab = join(dir, 'fab');
  mkdirSync(join(fab, 'gerbers'), { recursive: true });
  await run(KICAD_CLI, ['pcb', 'export', 'gerbers', '--output', join(fab, 'gerbers') + '/', '--layers', 'F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts', pcb]);
  await run(KICAD_CLI, ['pcb', 'export', 'drill', '--output', join(fab, 'gerbers') + '/', '--format', 'excellon', '--excellon-separate-th', pcb]);
  await run(KICAD_CLI, ['pcb', 'export', 'pos', '--output', join(fab, 'positions.csv'), '--format', 'csv', '--units', 'mm', '--side', 'both', pcb]);
  step('Looking up parts at LCSC (stock, price, LCSC numbers)');
  const sourcing = await sourceForPcb(project, layout).catch(() => null);
  writeFileSync(join(fab, 'bom-jlcpcb.csv'), jlcBom(spec, sourcing));
  if (sourcing) writeFileSync(join(fab, 'sourcing.json'), JSON.stringify(sourcing, null, 1));
  writeFileSync(join(fab, 'cpl-jlcpcb.csv'), jlcCpl(join(fab, 'positions.csv')));
  // Assembly drawing, bring-up test procedure and pre-compliance checklist.
  await run(KICAD_CLI, ['pcb', 'export', 'pdf', '--output', join(fab, 'assembly.pdf'), '--layers', 'F.Fab,F.SilkS,Edge.Cuts', '--mode-single', pcb]);
  try {
    const { deriveTests } = await import('../src/core/acceptance');
    const { simulateSelfTest } = await import('../src/sim/selftest-sim');
    const { simulate } = await import('../src/sim/node-runner');
    const { multimeterChecks } = await import('../src/core/multimeter');
    const { testProcedure, complianceChecklist } = await import('../src/core/manufacturing');
    const at = Array.from({ length: 12 }, (_, i) => 1000 + i * 100);
    const r = await simulate(project, { untilMs: 2200, onFrameAt: at });
    const samples: Record<string, number[]> = {};
    for (const sn of r.snapshots) for (const [k, v] of Object.entries(sn.frame.nets ?? {})) (samples[k] ??= []).push(v);
    const expected = project.board === 'none' ? '' : await simulateSelfTest(project);
    writeFileSync(join(dir, 'TEST.md'), testProcedure(project, { tests: [...deriveTests(project), ...(project.tests ?? [])], selftestExpected: expected, meter: multimeterChecks(project, samples) }));
    writeFileSync(join(dir, 'COMPLIANCE.md'), complianceChecklist(project));
  } catch (e: any) {
    log.push(`Couldn't write the test procedure: ${e?.message ?? e}`);
  }
  // Panel: several copies on one V-scored sheet with rails, fiducials and tooling holes (KiKit).
  let panel: PcbResult['panel'] = null;
  if (opts.panel && opts.panel.rows * opts.panel.cols > 1) {
    if (spec.parts.some((p) => p.flushEdge !== undefined)) log.push('Panel skipped: a connector sits on the board edge; order single boards (or ask the maker to panelise with mouse bites).');
    else if (!kikitAvailable()) log.push('Panel skipped: KiKit is not installed.');
    else {
      step(`Making a ${opts.panel.rows}×${opts.panel.cols} panel`);
      const pdir = join(fab, 'panel');
      mkdirSync(join(pdir, 'gerbers'), { recursive: true });
      const ppcb = join(pdir, `${spec.name}-panel.kicad_pcb`);
      const env = { ...process.env, PYTHONPATH: KIKIT_LIB };
      await new Promise<void>((res) =>
        execFile(KICAD_PY, ['-m', 'kikit.ui', 'panelize', '--layout', `grid; rows: ${opts.panel!.rows}; cols: ${opts.panel!.cols}; space: 0mm`, '--tabs', 'full', '--cuts', 'vcuts; clearance: 0.5mm', '--framing', 'railstb; width: 5mm; space: 0mm', '--fiducials', '3fid; hoffset: 5mm; voffset: 2.5mm', '--tooling', '3hole; hoffset: 2.5mm; voffset: 2.5mm; size: 1.5mm', pcb, ppcb], { env, timeout: 300_000 }, () => res()),
      );
      if (existsSync(ppcb)) {
        const pdrc = join(pdir, 'panel-drc.json');
        await run(KICAD_CLI, ['pcb', 'drc', '--format', 'json', '--output', pdrc, ppcb]);
        const d = existsSync(pdrc) ? JSON.parse(readFileSync(pdrc, 'utf8')) : { violations: [] };
        await run(KICAD_CLI, ['pcb', 'export', 'gerbers', '--output', join(pdir, 'gerbers') + '/', '--layers', 'F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts,User.1', ppcb]);
        await run(KICAD_CLI, ['pcb', 'export', 'drill', '--output', join(pdir, 'gerbers') + '/', '--format', 'excellon', '--excellon-separate-th', ppcb]);
        await run(KICAD_CLI, ['pcb', 'render', '--output', join(pdir, 'panel-top.png'), '--side', 'top', '--width', '1600', '--height', '1200', '--quality', 'basic', ppcb], 300_000);
        panel = { rows: opts.panel.rows, cols: opts.panel.cols, drcErrors: (d.violations ?? []).filter((v: any) => v.severity === 'error').length };
      } else log.push('Panel could not be made.');
    }
  }
  step('Rendering the board');
  await run(KICAD_CLI, ['pcb', 'render', '--output', join(dir, 'board-top.png'), '--side', 'top', '--width', '1600', '--height', '1100', '--quality', 'basic', '--floor', pcb], 300_000);
  await run(KICAD_CLI, ['pcb', 'render', '--output', join(dir, 'board-bottom.png'), '--side', 'bottom', '--width', '1600', '--height', '1100', '--quality', 'basic', pcb], 300_000);
  await run(KICAD_CLI, ['pcb', 'export', 'svg', '--output', join(dir, 'board.svg'), '--layers', 'F.Cu,B.Cu,F.SilkS,Edge.Cuts', '--mode-single', '--page-size-mode', '2', '--exclude-drawing-sheet', pcb]);
  await run(KICAD_CLI, ['pcb', 'export', 'step', '--output', join(dir, 'board.step'), '--subst-models', pcb], 300_000);

  const files = [...walk(dir)].map((f) => f.slice(dir.length + 1)).filter((f) => !/^(spec|layout)\.json$|\.(dsn|ses|kicad_prl)$/.test(f));
  return { dir, name: spec.name, widthMm: layout.width_mm, heightMm: layout.height_mm, routed: layout.routed, unrouted: layout.unrouted, tracks: layout.tracks, vias: layout.vias, drc, files, problems: [...problems, ...layout.problems], log, sourcing, variant: opts.variant ?? 'prototype', panel, productNotes, placement: (layout.parts ?? []).map((p: any) => ({ ref: p.ref, x: p.x, y: p.y, rot: p.rot, reserved: p.reserved ?? p.box })), fab: { id: spec.fab, name: FABS[spec.fab].name, track: FABS[spec.fab].track, drill: FABS[spec.fab].drill, quote: FABS[spec.fab].quote } };
}

/** Rename the spec's nets to KiCad's names; report any grouping that differs between the two netlists. */
export function adoptKicadNets(spec: PcbSpec, netlist: string): string[] {
  const kicad = new Map<string, string>(); // "REF:pad" → KiCad net name
  for (const block of netlist.split(/\(net\s*\(code/).slice(1)) {
    const name = /\(name "((?:[^"\\]|\\.)*)"\)/.exec(block)?.[1];
    if (!name) continue;
    for (const m of block.matchAll(/\(ref "([^"]*)"\)\s*\(pin "([^"]*)"\)/g)) kicad.set(`${m[1]}:${m[2]}`, name);
  }
  const problems: string[] = [];
  const ours = new Map<string, string>(); // our net → KiCad net
  for (const part of spec.parts) {
    for (const [pad, net] of Object.entries(part.pads)) {
      const k = kicad.get(`${part.ref}:${pad}`);
      if (!k) {
        problems.push(`${part.ref} pad ${pad} (${net}) is not in KiCad's schematic netlist`);
        continue;
      }
      const prev = ours.get(net);
      if (prev && prev !== k) problems.push(`net ${net} is split in KiCad's schematic (${prev} / ${k})`);
      ours.set(net, k);
    }
  }
  const back = new Map<string, string>();
  for (const [o, k] of ours) {
    if (back.has(k) && back.get(k) !== o) problems.push(`nets ${back.get(k)} and ${o} are joined in KiCad's schematic (${k})`);
    back.set(k, o);
  }
  // Use KiCad's names everywhere, including single-pin (unconnected) pads.
  for (const part of spec.parts) {
    const pads: Record<string, string> = {};
    for (const [key, name] of kicad) if (key.startsWith(`${part.ref}:`)) pads[key.slice(part.ref.length + 1)] = name;
    part.pads = pads;
  }
  spec.powerNets = spec.powerNets.map((n) => ours.get(n) ?? n);
  spec.groundNet = spec.groundNet ? (ours.get(spec.groundNet) ?? spec.groundNet) : null;
  return problems;
}

function* walk(d: string): Generator<string> {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const csv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';

/** JLCPCB assembly BOM: one row per value+footprint, with designators and LCSC numbers when known. */
function jlcBom(spec: PcbSpec, sourcing: PcbSourcing | null): string {
  const groups = new Map<string, { value: string; footprint: string; refs: string[]; lcsc: string }>();
  for (const p of spec.parts) {
    const line = sourcing?.lines.find((l) => l.ref === p.ref);
    const lcsc = line?.lcsc ?? '';
    // Plug-in boards and modules are soldered as sockets: say so, with how many.
    const value = line && /socket/.test(line.item) ? `${line.quantity > 1 ? `${line.quantity}× ` : ''}${line.item}` : p.value;
    const k = `${value}|${p.footprint}|${lcsc}`;
    if (!groups.has(k)) groups.set(k, { value, footprint: p.footprint.split(':')[1], refs: [], lcsc });
    groups.get(k)!.refs.push(p.ref);
  }
  return csv([['Comment', 'Designator', 'Footprint', 'LCSC Part #'], ...[...groups.values()].map((g) => [g.value, g.refs.join(','), g.footprint, g.lcsc])]);
}

function partDefOf(type: string): string {
  return partDefSync(type).kicad.footprint ?? '';
}

async function sourceForPcb(project: Project, layout: { width_mm: number; height_mm: number }): Promise<PcbSourcing> {
  const { sourcePcb, unitPrice } = await import('./sourcing');
  const src = await sourcePcb(project);
  const lines = src.map((x) => ({ ref: x.ref, item: x.item, quantity: x.quantity, lcsc: x.part?.lcsc ?? null, mfr: x.part?.mfr ?? null, stock: x.part?.stock ?? 0, basic: !!x.part?.basic, unit: x.part ? unitPrice(x.part, x.quantity) : null, url: x.part?.url ?? null }));
  const cost = [5, 50, 500].map((boards) => {
    let parts = 0;
    let missing = 0;
    for (const x of src) {
      if (!x.part) {
        missing++;
        continue;
      }
      const n = x.quantity * boards;
      parts += unitPrice(x.part, n) * n;
    }
    return { boards, parts: Math.round(parts * 100) / 100, perBoard: Math.round((parts / boards) * 100) / 100, missing };
  });
  const dfm: PcbSourcing['dfm'] = [];
  const area = layout.width_mm * layout.height_mm;
  dfm.push(layout.width_mm <= 100 && layout.height_mm <= 100 ? { level: 'ok', text: `The board is ${layout.width_mm} × ${layout.height_mm} mm, within 100 × 100 mm, the cheapest size class at most PCB makers.` } : { level: 'note', text: `The board is ${layout.width_mm} × ${layout.height_mm} mm. Boards with a side longer than 100 mm cost more at most PCB makers.` });
  const unfound = src.filter((x) => !x.part);
  if (unfound.length) dfm.push({ level: 'note', text: `Buy separately (not in LCSC's catalogue): ${[...new Set(unfound.map((x) => x.item))].join(', ')}.` });
  const low = src.filter((x) => x.part && x.part.stock < x.quantity * 50);
  if (low.length) dfm.push({ level: 'warn', text: `Low stock for 50 boards: ${low.map((x) => `${x.ref} (${x.part!.lcsc}, ${x.part!.stock} left)`).join(', ')}.` });
  const ext = src.filter((x) => x.part && !x.part.basic);
  dfm.push(ext.length ? { level: 'note', text: `${ext.length} of ${src.filter((x) => x.part).length} parts are JLCPCB "extended" parts. If you use their assembly service, each extended part type adds a small one-time loading fee; basic parts don't.` } : { level: 'ok', text: 'Every part is a JLCPCB "basic" part (no loading fees).' });
  const smdCount = project.parts.filter((p) => /SMD|_0805_|SOIC|SOT|RF_Module|Connector_USB/.test(p.props?.footprint ?? partDefOf(p.type))).length;
  if (smdCount) dfm.push({ level: 'ok', text: `${smdCount} surface-mount parts can be placed and soldered by the factory (upload the BOM and CPL). The few through-hole parts left (sockets, buttons) are quick to hand-solder.` });
  else dfm.push({ level: 'note', text: 'All parts are through-hole, which beginners can solder by hand. Factory assembly mostly places surface-mount parts, so through-hole assembly costs extra; most makers solder these boards themselves.' });
  if (area < 30 * 30) dfm.push({ level: 'note', text: 'This board is small: ask the maker to panelise it (several boards on one sheet) to save money on larger orders.' });
  return { lines, cost, dfm };
}

/** JLCPCB CPL from KiCad's position file. */
function jlcCpl(posCsv: string): string {
  if (!existsSync(posCsv)) return csv([['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation']]);
  const lines = readFileSync(posCsv, 'utf8').trim().split('\n').slice(1);
  const rows = lines.map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '')));
  // KiCad: Ref,Val,Package,PosX,PosY,Rot,Side
  return csv([['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation'], ...rows.map((r) => [r[0], `${r[3]}mm`, `${r[4]}mm`, r[6] === 'bottom' ? 'Bottom' : 'Top', r[5]])]);
}
