// The part check: before a part enters the library, it is wired to each board in a tiny test
// design and must pass every stage the real app depends on. This file holds the stages that run
// anywhere (no KiCad, no network); scripts/parts/check.ts adds the circuit board and LCSC stages.
import type { Project } from './types';
import type { AcceptanceTest } from './acceptance';
import { registerCustomPart, validateSpec, type CustomPartSpec } from './customParts';
import { autoWirePart } from './autowire';
import { annotate } from './netlist';
import { BOARDS, boardPin } from './boards';
import { runChecks } from './checks';
import { planBreadboard } from './bbplace';

export type StageStatus = 'pass' | 'fail' | 'skip';
export interface StageResult {
  stage: string;
  status: StageStatus;
  detail: string;
}

export const CHECK_BOARDS = ['esp32', 'pico'] as const;
export type CheckBoard = (typeof CHECK_BOARDS)[number];

/** A design with just the board and the part, wired the way the app wires datasheet parts. */
export function testProject(spec: CustomPartSpec, board: CheckBoard): { project: Project; notes: string[] } {
  registerCustomPart(spec);
  const def = BOARDS[board];
  const now = Date.now();
  let project: Project = annotate({
    id: `partcheck-${spec.type}-${board}`,
    name: `${spec.mpn} test`,
    summary: `Part check for the ${spec.name}`,
    board,
    parts: [
      { id: 'board', type: def.partType, props: {}, x: 40, y: 40 },
      { id: 'dut', type: spec.type, label: spec.name, props: {}, x: 420, y: 40 },
    ],
    wires: [],
    files: {},
    notes: [],
    customParts: [spec],
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  const wired = autoWirePart(project, 'dut');
  project = wired.project;
  project.files = exampleFiles(spec, project);
  return { project, notes: wired.notes };
}

/** GPIO number each part pin ended up on, plus the board's I2C pins, for the example's {PLACEHOLDERS}. */
export function pinNumbers(project: Project): Record<string, number> {
  const board = BOARDS[project.board as CheckBoard];
  const out: Record<string, number> = {};
  for (const w of project.wires) {
    const [dut, brd] = w.a.part === 'dut' ? [w.a, w.b] : w.b.part === 'dut' ? [w.b, w.a] : [null, null];
    if (!dut || !brd) continue;
    const g = boardPin(board, brd.pin)?.gpio;
    if (g !== undefined) out[dut.pin.toUpperCase().replace(/[^A-Z0-9]/g, '_')] = g;
  }
  // The UART that owns the board RX pin wired to the part's TX (ESP32: UART2 can use any pins).
  const spec = project.customParts?.find((c) => project.parts.some((p) => p.id === 'dut' && p.type === c.type));
  const txName = spec?.pins.find((p) => p.fn === 'uart.tx')?.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const rxg = txName ? out[txName] : undefined;
  out.UART_ID = project.board === 'pico' ? ([1, 13, 17, 29].includes(rxg ?? 1) ? 0 : 1) : 2;
  out.SDA = boardPin(board, board.i2c.sda)!.gpio!;
  out.SCL = boardPin(board, board.i2c.scl)!.gpio!;
  out.I2C_ID = board.i2c.id;
  return out;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{([A-Z0-9_]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

export function exampleFiles(spec: CustomPartSpec, project: Project): Record<string, string> {
  const files: Record<string, string> = {};
  if (spec.driver) files[spec.driver.filename] = spec.driver.code;
  files['main.py'] = spec.example ? fill(spec.example.code, pinNumbers(project)) : spec.driver ? `import ${spec.driver.filename.replace(/\.py$/, '')}\nprint("driver loaded")\n` : 'print("no example")\n';
  return { 'main.py': files['main.py'], ...files };
}

/** The example's test with {REF} replaced by the part's reference (e.g. U2). */
export function exampleTest(spec: CustomPartSpec, project: Project): AcceptanceTest | null {
  if (!spec.example) return null;
  const ref = project.parts.find((p) => p.id === 'dut')?.ref ?? 'dut';
  return JSON.parse(fill(JSON.stringify(spec.example.test), { REF: ref }));
}

/** Stages that need nothing but this codebase. */
export function staticStages(spec: CustomPartSpec, project: Project, notes: string[]): StageResult[] {
  const out: StageResult[] = [];
  const errs = validateSpec(spec);
  out.push({ stage: 'spec', status: errs.length ? 'fail' : 'pass', detail: errs.join('; ') || `${spec.pins.length} pins, ${spec.interface}` });

  const wiredPins = new Set(project.wires.flatMap((w) => [w.a, w.b]).filter((r) => r.part === 'dut').map((r) => r.pin));
  const missing = spec.pins.filter((p) => p.role !== 'nc' && p.required !== false && !wiredPins.has(p.name)).map((p) => p.name);
  out.push({ stage: 'wiring', status: missing.length ? 'fail' : 'pass', detail: missing.length ? `not wired: ${missing.join(', ')}${notes.length ? ` (${notes.join(' ')})` : ''}` : `${wiredPins.size} pins wired${notes.length ? `; ${notes.join(' ')}` : ''}` });

  const errors = runChecks(project).filter((c) => c.severity === 'error');
  out.push({ stage: 'design-checks', status: errors.length ? 'fail' : 'pass', detail: errors.map((e) => e.title).join('; ') || 'no errors' });

  try {
    const plan = planBreadboard(project);
    out.push({ stage: 'breadboard', status: plan.problems.length ? 'fail' : 'pass', detail: plan.problems.join('; ') || `${plan.steps.length} build steps` });
  } catch (e: any) {
    out.push({ stage: 'breadboard', status: 'fail', detail: `planner crashed: ${e?.message ?? e}` });
  }
  return out;
}
