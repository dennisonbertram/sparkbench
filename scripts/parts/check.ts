// The part check (the library's gate). For each part.json: wire it to an ESP32 and a Pico, then
// spec → wiring → design checks → breadboard → simulator (its example + test) → KiCad footprint →
// circuit board (routed, DRC 0 errors, schematic parity) → LCSC. Writes check.json next to part.json.
// Run: npx tsx scripts/parts/check.ts <part.json | skill dir>... [--no-pcb] [--no-lcsc] [--board esp32]
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { CustomPartSpec } from '../../src/core/customParts';
import { CHECK_BOARDS, exampleTest, staticStages, testProject, type CheckBoard, type StageResult } from '../../src/core/partcheck';
import { runTests } from '../../src/sim/run-tests';
import { simulate } from '../../src/sim/node-runner';

import { FP_DIR } from '../../server/pcb';

export interface PartCheck {
  type: string;
  mpn: string;
  pass: boolean;
  boards: Record<string, StageResult[]>;
  part: StageResult[];
  checkedAt: string;
}

/** Pad numbers in a KiCad footprint (mounting/unnumbered pads ignored). */
function footprintPads(fp: string): string[] | null {
  const [lib, name] = fp.split(':');
  if (!lib || !name) return null;
  const f = join(FP_DIR, `${lib}.pretty`, `${name}.kicad_mod`);
  if (!existsSync(f)) return null;
  const pads = [...readFileSync(f, 'utf8').matchAll(/\(pad "([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(pads)];
}

async function simStage(spec: CustomPartSpec, project: any): Promise<StageResult> {
  const test = exampleTest(spec, project);
  try {
    if (!test) {
      const r = await simulate(project, { untilMs: 2000 });
      const out = r.engine.serialAll.join('\n');
      const crashed = /Traceback|Error:/.test(out);
      return { stage: 'simulator', status: crashed ? 'fail' : 'skip', detail: crashed ? out.slice(-300) : 'no example program: driver loads, behaviour untested' };
    }
    const [res] = await runTests(project, [test]);
    return { stage: 'simulator', status: res.pass ? 'pass' : 'fail', detail: `${test.title}: ${res.pass ? 'passes' : res.detail}` };
  } catch (e: any) {
    return { stage: 'simulator', status: 'fail', detail: `crashed: ${e?.message ?? e}` };
  }
}

async function pcbStage(project: any): Promise<StageResult> {
  const { buildPcb } = await import('../../server/pcb');
  try {
    const r = await buildPcb(project, mkdtempSync(join(tmpdir(), 'partcheck-')));
    const errs = r.drc.errors.length;
    const ok = r.routed && errs === 0 && r.drc.unconnected === 0 && !r.problems.length;
    return { stage: 'circuit-board', status: ok ? 'pass' : 'fail', detail: ok ? `${r.widthMm}×${r.heightMm} mm, DRC clean` : [!r.routed && 'not routed', errs && `DRC: ${r.drc.errors.map((e: any) => e.description ?? e.type).slice(0, 3).join('; ')}`, r.drc.unconnected && `${r.drc.unconnected} unconnected`, ...r.problems].filter(Boolean).join('; ') };
  } catch (e: any) {
    return { stage: 'circuit-board', status: 'fail', detail: `build failed: ${String(e?.message ?? e).slice(0, 300)}` };
  }
}

async function lcscStage(spec: CustomPartSpec): Promise<StageResult> {
  const { search } = await import('../../server/sourcing');
  try {
    const want = spec.mpn.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hits = (await search(spec.mpn)).filter((p) => (p.mfr + p.description).toLowerCase().replace(/[^a-z0-9]/g, '').includes(want) && p.stock > 0);
    // Breakout modules are mostly sold by hobby shops, not LCSC: a miss is information, not a failure.
    return hits.length ? { stage: 'lcsc', status: 'pass', detail: `${hits[0].lcsc} ${hits[0].mfr} (${hits[0].stock} in stock)` } : { stage: 'lcsc', status: 'skip', detail: 'chip not found in stock at LCSC (buy the module from a hobby shop)' };
  } catch (e: any) {
    return { stage: 'lcsc', status: 'skip', detail: `lookup failed: ${e?.message ?? e}` };
  }
}

export async function checkPart(spec: CustomPartSpec, opts: { pcb?: boolean; lcsc?: boolean; boards?: CheckBoard[] } = {}): Promise<PartCheck> {
  const boards: Record<string, StageResult[]> = {};
  for (const b of opts.boards ?? CHECK_BOARDS) {
    const { project, notes } = testProject(spec, b);
    const st = staticStages(spec, project, notes);
    st.push(await simStage(spec, project));
    if (opts.pcb !== false && b === 'esp32') st.push(await pcbStage(project));
    boards[b] = st;
  }
  const part: StageResult[] = [];
  const fp = spec.footprint ?? `Connector_PinHeader_2.54mm:PinHeader_1x${String(spec.pins.length).padStart(2, '0')}_P2.54mm_Vertical`;
  const pads = footprintPads(fp);
  part.push(!pads ? { stage: 'footprint', status: 'fail', detail: `${fp} is not in KiCad's library` } : pads.length !== spec.pins.length ? { stage: 'footprint', status: 'fail', detail: `${fp} has ${pads.length} pads but the part has ${spec.pins.length} pins` } : { stage: 'footprint', status: 'pass', detail: fp });
  if (opts.lcsc !== false) part.push(await lcscStage(spec));
  // Simulator 'skip' (no example) means the part isn't fully proven: it doesn't pass.
  const all = [...Object.values(boards).flat(), ...part];
  const pass = all.every((s) => s.status === 'pass' || (s.status === 'skip' && s.stage === 'lcsc'));
  return { type: spec.type, mpn: spec.mpn, pass, boards, part, checkedAt: new Date().toISOString() };
}

function specPath(arg: string): string {
  return arg.endsWith('.json') ? arg : join(arg, 'part.json');
}

if (process.argv[1] && basename(process.argv[1]).startsWith('check')) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const bi = args.indexOf('--board');
  const boards = bi >= 0 ? [args[bi + 1] as CheckBoard] : undefined;
  let targets = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--board');
  if (flags.has('--all')) targets = readdirSync('.claude/skills').filter((d) => d.startsWith('part-')).map((d) => join('.claude/skills', d));
  let failed = 0;
  for (const t of targets) {
    const f = specPath(t);
    const spec: CustomPartSpec = JSON.parse(readFileSync(f, 'utf8'));
    const r = await checkPart(spec, { pcb: !flags.has('--no-pcb'), lcsc: !flags.has('--no-lcsc'), boards });
    writeFileSync(join(dirname(f), 'check.json'), JSON.stringify(r, null, 2));
    if (!r.pass) failed++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${spec.type}`);
    for (const [b, st] of Object.entries(r.boards)) for (const s of st) console.log(`  ${s.status === 'pass' ? '✓' : s.status === 'skip' ? '–' : '✗'} [${b}] ${s.stage}: ${s.detail}`);
    for (const s of r.part) console.log(`  ${s.status === 'pass' ? '✓' : s.status === 'skip' ? '–' : '✗'} ${s.stage}: ${s.detail}`);
  }
  process.exit(failed ? 1 : 0);
}
