// Claude-powered design copilot and code assistant.
// Design: Claude turns a request into a DesignSpec (the same structure the offline planner
// produces), the deterministic planner wires it, and — when the request needs custom behaviour —
// Claude writes main.py. Code: Claude edits a file on request. Every firmware change is run in
// the simulator; crashes are fed back to Claude to repair (up to two rounds).
import { z } from 'zod';
import type { DesignSpec, Project, Requirements } from '../src/core/types';
import { deriveTests, partControls, type AcceptanceTest, type TestResult, type TestStep } from '../src/core/acceptance';
import { runTests } from '../src/sim/run-tests';
import { buildProject, FEATURE_LABELS } from '../src/core/planner';
import { BOARDS } from '../src/core/boards';
import { simulate } from '../src/sim/node-runner';
import { askJson, backend, MODEL, type Turn } from './llm';
import { runChecks } from '../src/core/checks';
import { registerProjectParts } from '../src/core/customParts';
import { deriveRequirements } from '../src/core/requirements';
import { buildBom, bomTotal, formatUsd } from '../src/core/bom';

/** Claude's requirements, with size and budget taken from the real parts list (one source of truth). */
function measuredRequirements(project: Project, r: Requirements): Requirements {
  try {
    const d = deriveRequirements(project);
    return { ...r, size: d.size, budget: d.budget };
  } catch {
    return r;
  }
}

/** The shopping list Sparkbench shows, so answers about what to buy match the Parts list. */
function shoppingContext(p: Project): string {
  try {
    const bom = buildBom(p);
    return `\nParts list Sparkbench shows (use exactly these items, sizes and counts when asked what to buy or what it costs; total ${formatUsd(bomTotal(bom))} at hobby-store prices):\n${bom.map((l) => `- ${l.quantity} × ${l.name}${l.value && !l.name.includes(l.value) ? ` (${l.value})` : ''}${l.kind === 'supply' ? `: ${l.description}` : ''}${l.optional ? ' (recommended)' : ''}`).join('\n')}`;
  } catch {
    return '';
  }
}

const FEATURE_KINDS = Object.keys(FEATURE_LABELS) as [string, ...string[]];

const DesignSchema = z.object({
  intent: z.enum(['new', 'edit', 'code', 'question']).describe('new design; edit of the current design (parts); code = only the program behaviour changes; question = just answer'),
  title: z.string().describe('Short friendly project name, e.g. "ESP32 Weather Station"'),
  board: z.enum(['esp32', 'pico', 'rpi4', 'none']),
  features: z
    .array(
      z.object({
        kind: z.enum(FEATURE_KINDS),
        label: z.string().nullable().describe('Optional human label, e.g. "Up button" or "Red"'),
        color: z.string().nullable().describe('LED / button colour if relevant'),
        count: z.number().nullable().describe('NeoPixel ring only: number of LEDs (8, 12, 16 or 24); null otherwise'),
        output: z.enum(['led', 'buzzer']).nullable().describe("astable555 only: 'buzzer' makes it a tone generator (piezo buzzer, ~465 Hz while a button is held), 'led' a blinker; null otherwise"),
        pin: z.string().nullable().describe('Only when the user asks for a specific pin for this part: the board pin name (e.g. "D14", "GP14", "GPIO14") or GPIO number; otherwise null'),
      }),
    )
    .describe('Every part-level feature in the FINAL design (for edits: the full updated list; for code/question: the current list unchanged)'),
  reply: z.string().describe('2-6 friendly sentences for a beginner: what you designed/changed and why. Mention anything unsupported and the alternative you chose.'),
  write_firmware: z.boolean().describe('true when the request asks for behaviour beyond simple defaults (e.g. "beep when too hot", "count steps", "show in Fahrenheit", a game, a menu)'),
  firmware_brief: z.string().nullable().describe('If write_firmware: precise description of the behaviour the firmware must implement'),
  questions: z
    .array(z.object({ question: z.string(), options: z.array(z.string()).describe('2-4 short answers; the first is your recommended default') }))
    .describe('Only for a NEW design whose request is genuinely ambiguous in a way that changes the parts (power source, kind of display, how it alerts, internet or not). At most 3. Empty otherwise — including when the user is answering earlier questions.'),
  requirements: z
    .object({
      does: z.array(z.string()).describe('3-6 short sentences: what the finished device does, in the user\'s words'),
      power: z.string().describe('How it is powered, e.g. "USB cable (5 V)" or "9 V battery"'),
      size: z.string().describe('Rough size, e.g. "fits on one breadboard; about 8 × 5 cm as a circuit board"'),
      budget: z.string().describe('Rough parts cost, e.g. "about $25 in parts"'),
    })
    .describe('The requirements card for the design (new and edit intents)'),
});

const StepSchema = z.object({
  kind: z.enum(['wait', 'set', 'press', 'expect']),
  part: z.string().nullable().describe('Part ref (R1, SW1, DS1, U2…) for set/press/expect'),
  control: z.string().nullable().describe("set: the part's control key (from the list)"),
  value: z.number().nullable().describe('set: the value'),
  ms: z.number().nullable().describe('wait: milliseconds; press: how long to hold'),
  what: z.enum(['screen', 'serial', 'led', 'buzzer', 'servo', 'relay', 'motor', 'pixels', 'active', 'no-error']).nullable().describe('expect: what to check'),
  text: z.string().nullable().describe('expect screen/serial: text that must appear (short, case-insensitive)'),
  on: z.boolean().nullable().describe('expect led/buzzer/relay/motor/pixels: true = on, false = off'),
  min: z.number().nullable().describe('expect servo: lowest acceptable angle'),
  max: z.number().nullable().describe('expect servo: highest acceptable angle'),
  within: z.number().nullable().describe('expect: allow this many ms for it to become true (default 1500)'),
});
const TestsSchema = z.object({
  tests: z
    .array(z.object({ title: z.string().describe('The promise in plain words, e.g. "When the soil is dry, the screen says Water me"'), steps: z.array(StepSchema) }))
    .describe('2-6 tests that check what the USER asked for (not generic boot checks)'),
  untested: z.array(z.string()).describe('Promises from the requirements list (copied word for word) that none of your tests checks, e.g. timing over an hour that the simulator cannot reach. Empty when every promise has a test, or when no requirements list was given.'),
});

const TESTS_SYSTEM = `You write acceptance tests for hardware projects in Sparkbench. Each test is a short script run in the simulator:
- set: move a sensor or switch control (e.g. part U2 control "temperature" value 31; part U3 control "moisture" value 10)
- press: press and release a button (part SW1)
- wait: let time pass
- expect: check an output, waiting up to "within" ms: screen text (OLED/LCD/e-paper, read off the display), serial text, LED on/off, buzzer on/off, servo angle range, relay, motor, NeoPixels lit, or no-error.
Test what the user asked for, using the parts and controls listed. When a requirements list is given, write a test for every promise on it that the simulator can check (buzzer beeps, LEDs, screen text, serial text), and list the ones you could not test in "untested". Prefer short words that will certainly be on screen (e.g. "Water", "31"). Allow generous "within" times when the program updates slowly (read the code). Don't test things the request didn't ask for.`;

const FileEditSchema = z.object({
  reply: z.string().describe('1-4 sentences: what you changed and why, for a beginner'),
  content: z.string().describe('The complete new content of the file'),
  behavior: z
    .array(z.object({ does: z.string().describe('One full sentence: something the finished program does'), test: z.string().describe('How to check it on the real hardware'), sim: z.string().describe('How to try it in the Sparkbench simulator (sliders, buttons, Run)') }))
    .describe('3-8 items describing what the WHOLE program (after your change) does, for the build guide and blog post'),
});

const SYSTEM = `You are the design copilot inside Sparkbench, a hardware design studio for beginners.
You turn plain-English requests into a parts-level design for ONE of these targets:
- esp32: ESP32 DevKit V1, MicroPython
- pico: Raspberry Pi Pico, MicroPython
- rpi4: Raspberry Pi 4, Python 3 + gpiozero (no analog inputs: Sparkbench adds an MCP3008 automatically)
- none: battery-powered discrete circuit (features 'astable555' or 'transistor-led' only). astable555 can blink an LED (output "led") or beep a piezo buzzer (output "buzzer").
Available feature kinds (each list entry = one physical part group; two buttons = two entries):
${Object.entries(FEATURE_LABELS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
At most one each of: oled, lcd, mpu6050, dht22, hcsr04, neopixel, relay, buzzer (I2C address / bus limits).
Pin assignment, resistors, dividers and wiring are done automatically by Sparkbench — never list resistors yourself.
Unsupported boards (Arduino Uno, STM32…) → pick the closest supported board and say so. Unsupported parts → pick the closest supported part and say so.
To move a part to another pin, keep it in the features list with its "pin" set (intent "edit"); never move a part by editing code alone — Sparkbench rewires the breadboard and keeps the code in sync. Keep the same labels for parts that stay, so their wiring is kept.
If you substitute a part or reduce a quantity, say exactly what you built instead (e.g. "a 12-LED NeoPixel ring", not "a ring").
Default to esp32 when no board is named. Keep replies short, warm and concrete.
The user can't see your tools or this schema: never say "the tool", "the schema" or "features list" in a reply; say "Sparkbench" (e.g. "Sparkbench adds the wiring and resistors for you").
The requirements card, the reply and the firmware brief must agree exactly (same number of beeps, same timings, same thresholds).
Safety: never design anything that connects to mains voltage (110–240 V AC) directly. For mains appliances, control a certified smart plug or an enclosed, certified relay module and say why. Use relays only for low-voltage loads on a breadboard build. Refuse dangerous requests (weapons, tasers, anything meant to hurt people) briefly and suggest a safe project instead. Lithium batteries need a protected cell and a proper charger module; say so when they come up.
Answer only the user's latest message — never repeat or revisit answers to earlier questions. When you give steps, use a short numbered Markdown list (one step per line).`;

const CODE_SYSTEM = `You are the firmware assistant inside Sparkbench. You edit code for a real hardware project; the same code runs in Sparkbench's simulator and on the physical board.
MicroPython targets (ESP32, Pico) use: machine.Pin/ADC/PWM/I2C/time_pulse_us, time.sleep_ms/ticks_ms/ticks_diff, and the bundled drivers ssd1306.SSD1306_I2C (framebuf API: fill, text, pixel, hline, vline, rect, fill_rect, line, show), i2c_lcd.I2cLcd (clear, move_to, putstr), mpu6050.MPU6050 (accel(), gyro() in g and °/s), dht.DHT22 (measure(), temperature(), humidity()), neopixel.NeoPixel (np[i]=(r,g,b); np.write()).
Raspberry Pi targets use Python 3 + gpiozero (Button, PWMLED, RGBLED, PWMOutputDevice, AngularServo, DistanceSensor, MotionSensor, MCP3008, OutputDevice) and the bundled oled.OLED (same drawing API), i2c_lcd.I2cLcd, mpu6050.MPU6050, adafruit_dht.DHT22 (board.D<n>), neopixel.NeoPixel (pixels[i]=..., pixels.show()).
Rules: keep the existing pin numbers (they match the wiring); in comments write pins as GPIO32 (board pin D32), never with leading zeros; keep the program structure and helpful comments, write clear beginner-friendly code with comments, keep a main loop that sleeps (time.sleep_ms / time.sleep) so the board stays responsive, and never invent libraries that are not listed. Return the COMPLETE file.`;

export function aiStatus() {
  const b = backend();
  return b === 'none' ? { enabled: false } : { enabled: true, model: MODEL, via: b };
}

export interface AiDesignResult {
  project?: Project;
  reply: string;
  intent: 'new' | 'edit' | 'code' | 'question' | 'clarify';
  log: string[];
  questions?: { question: string; options: string[] }[];
  requirements?: Requirements;
  results?: TestResult[];
}

function projectContext(p?: Project) {
  if (!p) return 'There is no current design yet.';
  return `Current design: ${JSON.stringify({ title: p.name, board: p.board, features: (p.spec?.features ?? []).map((f) => ({ kind: f.kind, label: f.label ?? null })) })}${shoppingContext(p)}
Current main.py:
\`\`\`python
${p.files['main.py'] ?? '(none)'}
\`\`\``;
}

/** Skills of datasheet-defined parts in the project, so Claude codes against the real datasheet. */
function partSkills(p: Project): string {
  const specs = p.customParts ?? [];
  if (!specs.length) return '';
  return `\nDatasheet-defined parts in this project (their pins are wired as shown in the wiring list; use their drivers if present):\n${specs
    .map((s) => {
      const part = p.parts.find((x) => x.type === s.type);
      const wires = p.wires.filter((w) => w.a.part === part?.id || w.b.part === part?.id).map((w) => (w.a.part === part?.id ? `${w.a.pin}→${w.b.pin}` : `${w.b.pin}→${w.a.pin}`));
      return `### ${s.name} (${s.mpn}) — ${part?.ref ?? ''} wired ${wires.join(', ')}${s.driver ? `; driver file ${s.driver.filename}` : ''}\n${(s.skill ?? s.description).slice(0, 7000)}`;
    })
    .join('\n\n')}\n`;
}

/** What the design request is doing right now, streamed to the waiting screen. */
export type DesignPhase = 'read' | 'wire' | 'code' | 'tests' | 'fix';

export async function aiDesign(prompt: string, current?: Project, history: Turn[] = [], images: { data: string; mediaType: string }[] = [], onPhase: (p: DesignPhase) => void = () => {}): Promise<AiDesignResult> {
  registerProjectParts(current);
  const log: string[] = [];
  onPhase('read');
  const pictured = images.length ? `\n\nThe user attached ${images.length === 1 ? 'a photo or sketch' : `${images.length} photos or sketches`}: work out what the gadget does (screens, buttons, lights, sensors, sounds, motors, how it's powered) and design the closest version Sparkbench can build. Say in your reply what you saw and anything you substituted.` : '';
  const d = await askJson(SYSTEM, [...history.slice(-6), { role: 'user', content: `${projectContext(current)}\n\nRequest: ${prompt}${pictured}` }], DesignSchema, { images: images as any });
  if (images.length) log.push(`Read ${images.length} image${images.length > 1 ? 's' : ''} you attached.`);
  log.push(`Claude: intent=${d.intent}, board=${d.board}, ${d.features.length} part groups.`);
  if (d.intent === 'question') return { reply: d.reply, intent: 'question', log };
  if (d.intent === 'new' && d.questions.length && !history.some((t) => t.role === 'assistant')) {
    return { reply: d.reply, intent: 'clarify', log, questions: d.questions.slice(0, 3), requirements: d.requirements };
  }
  if (d.intent === 'code' && current) {
    onPhase('code');
    const r = await aiEditFile(current, 'main.py', d.firmware_brief ?? prompt);
    const t = await testAndRepair(r.project, prompt, log, onPhase);
    return finish(t.project, `${d.reply}\n\n${r.reply}`.trim(), 'code', [...log, ...r.log], undefined, t.results);
  }
  const boardDef = d.board === 'none' ? undefined : BOARDS[d.board];
  const pinName = (p: string | null) => {
    if (!p || !boardDef) return undefined;
    const num = /(\d+)\s*$/.exec(p)?.[1];
    const byName = boardDef.pins.find((x) => x.name.toLowerCase() === p.trim().toLowerCase());
    return byName?.name ?? (num !== undefined ? boardDef.pins.find((x) => x.gpio === Number(num))?.name : undefined);
  };
  const spec: DesignSpec = {
    board: d.board,
    title: d.title,
    features: d.features.map((f) => ({
      ...(pinName(f.pin) ? { pins: { pin: pinName(f.pin)! } } : {}),
      kind: f.kind as DesignSpec['features'][number]['kind'],
      label: f.label ?? undefined,
      props:
        f.color || f.count || f.output
          ? { ...(f.color ? { color: f.color } : {}), ...(f.count && f.kind === 'neopixel' ? { pixels: f.count } : {}), ...(f.output && f.kind === 'astable555' ? { output: f.output } : {}) }
          : undefined,
    })),
  };
  const isEdit = d.intent === 'edit' && !!current;
  onPhase('wire');
  let project = buildProject(spec, { name: isEdit ? renameForBoard(current!, d.board) : d.title, prompt, previous: isEdit ? { ...current!, codeCustom: false } : undefined });
  if (isEdit && current!.codeCustom && project.board !== 'none' && current!.board === project.board) {
    // The user's (or Claude's) custom program must survive a wiring change: adapt it rather than replace it.
    onPhase('code');
    const adapted = { ...project, files: { ...project.files, 'main.py': current!.files['main.py'] }, behavior: current!.behavior };
    const r = await aiEditFile(adapted, 'main.py', `The hardware design just changed (${prompt}). Update this program so it uses the new wiring listed above${d.write_firmware && d.firmware_brief ? ` and also: ${d.firmware_brief}` : ''}. Keep everything else it already does.`);
    const t = await testAndRepair({ ...r.project, requirements: measuredRequirements(r.project, d.requirements), tests: current!.tests }, prompt, log, onPhase);
    return finish(t.project, d.reply, d.intent, [...log, ...r.log], undefined, t.results);
  }
  if (d.write_firmware && d.firmware_brief && project.board !== 'none') {
    onPhase('code');
    const r = await aiEditFile(project, 'main.py', d.firmware_brief);
    project = r.project;
    log.push(...r.log);
  }
  project = { ...project, requirements: measuredRequirements(project, d.requirements), tests: isEdit ? current!.tests : undefined };
  onPhase('tests');
  const t = project.board === 'none' ? { project, results: await runTests(project, deriveTests(project)) } : await testAndRepair(project, `${history.filter((x) => x.role === 'user').map((x) => x.content).join('\n')}\n${prompt}`, log, onPhase);
  return finish(t.project, d.reply, d.intent, log, current, t.results);
}

/** Turn a flat AI step into a typed test step. */
function toStep(s: z.infer<typeof StepSchema>): TestStep | null {
  if (s.kind === 'wait') return { kind: 'wait', ms: s.ms ?? 1000 };
  if (s.kind === 'press' && s.part) return { kind: 'press', part: s.part, ...(s.ms ? { ms: s.ms } : {}) };
  if (s.kind === 'set' && s.part && s.control && s.value !== null) return { kind: 'set', part: s.part, control: s.control, value: s.value };
  if (s.kind === 'expect' && s.what) return { kind: 'expect', what: s.what, ...(s.part ? { part: s.part } : {}), ...(s.text ? { text: s.text } : {}), ...(s.on !== null ? { on: s.on } : {}), ...(s.min !== null ? { min: s.min } : {}), ...(s.max !== null ? { max: s.max } : {}), ...(s.within ? { within: s.within } : {}) };
  return null;
}

/** Claude writes acceptance tests for what the user asked for (A4). */
export async function aiWriteTests(project: Project, request: string, source: AcceptanceTest['source'] = 'ai'): Promise<AcceptanceTest[]> {
  return (await aiWriteTestsFor(project, request, source)).tests;
}

/** Tests for the request (and each promise on the requirements card), plus the promises no test covers. */
async function aiWriteTestsFor(project: Project, request: string, source: AcceptanceTest['source'] = 'ai', requirements?: string[]): Promise<{ tests: AcceptanceTest[]; untested: string[] }> {
  const out = await askJson(
    TESTS_SYSTEM,
    [
      {
        role: 'user',
        content: `Project: ${project.name}\nParts and their simulator controls: ${JSON.stringify(partControls(project))}\nmain.py:\n\`\`\`python\n${project.files['main.py'] ?? ''}\n\`\`\`\n\nWhat the user asked for:\n${request}${requirements?.length ? `\n\nRequirements list (what the device promises to do):\n${requirements.map((d) => `- ${d}`).join('\n')}` : ''}`,
      },
    ],
    TestsSchema,
    { effort: 'low' },
  );
  const tests = out.tests.map((t, i) => ({ id: `${source}-${Date.now().toString(36)}-${i}`, title: t.title, source, steps: t.steps.map(toStep).filter((x): x is TestStep => !!x) })).filter((t) => t.steps.length);
  return { tests, untested: requirements?.length ? out.untested.filter((u) => u.trim()) : [] };
}

/**
 * Write tests for the request, run them with the derived ones, and if the program fails them,
 * let Claude change the program until they pass (two rounds max). Results are reported honestly.
 */
async function testAndRepair(project: Project, request: string, log: string[], onPhase: (p: DesignPhase) => void = () => {}): Promise<{ project: Project; results: TestResult[] }> {
  onPhase('tests');
  let tests = project.tests?.length ? project.tests : [];
  try {
    if (!tests.length) {
      const w = await aiWriteTestsFor(project, request, 'ai', project.requirements?.does);
      tests = w.tests;
      if (project.requirements) project = { ...project, requirements: { ...project.requirements, untested: w.untested } };
    }
  } catch (e: any) {
    log.push(`Couldn't write acceptance tests: ${e.message}`);
  }
  let current: Project = { ...project, tests };
  let results = await runTests(current, [...deriveTests(current), ...tests]);
  log.push(`Acceptance tests: ${results.filter((r) => r.pass).length}/${results.length} pass in the simulator.`);
  // The exact steps (values set, waits, time allowed), so the program can be made to meet them.
  const stepsOf = (title: string) => {
    const t = tests.find((x) => x.title === title);
    return t ? `\n  steps: ${JSON.stringify(t.steps)}` : '';
  };
  for (let round = 0; round < 2 && results.some((r) => !r.pass); round++) {
    onPhase('fix');
    const failing = results.filter((r) => !r.pass);
    const r = await aiEditFile(current, 'main.py', `Make the program do what the user asked: ${request}\nThese acceptance tests fail in the simulator:\n${failing.map((f) => `- ${f.title}: ${f.detail}${stepsOf(f.title)}`).join('\n')}\nThe tests read the screen text as drawn, the serial output, and LED/buzzer/servo states. Change the program so they pass, keeping everything else it does.`);
    const next = await runTests(r.project, [...deriveTests(r.project), ...tests]);
    log.push(`Fix round ${round + 1}: ${next.filter((x) => x.pass).length}/${next.length} pass.`);
    if (next.filter((x) => x.pass).length >= results.filter((x) => x.pass).length) {
      current = { ...r.project, tests };
      results = next;
    }
  }
  return { project: current, results };
}

/** Append honest notes: design-check errors and any wiring that moved. */
function finish(project: Project, reply: string, intent: AiDesignResult['intent'], log: string[], previous?: Project, results?: TestResult[]): AiDesignResult {
  const problems = runChecks(project).filter((x) => x.severity === 'error');
  let extra = problems.length ? `\n\nHeads up — the design checker found ${problems.length === 1 ? 'one problem' : `${problems.length} problems`}: ${problems.map((x) => `${x.title}${x.detail ? ` (${x.detail.split('. ')[0]})` : ''}`).join('; ')}. See the Problems tab for details and fixes.` : '';
  if (previous?.features && previous.board === project.board) {
    const moved: string[] = [];
    for (const f of project.features ?? []) {
      const old = previous.features.find((g) => g.kind === f.kind && g.label === f.label);
      if (old && old.pins.pin && f.pins.pin && old.pins.pin !== f.pins.pin) moved.push(`${f.label} ${old.pins.pin} → ${f.pins.pin}`);
    }
    if (moved.length) extra += `\n\nWiring moved: ${moved.join(', ')}.`;
  }
  if (results?.length) {
    const passed = results.filter((r) => r.pass).length;
    extra += passed === results.length ? `\n\nI checked it in the simulator: all ${results.length} acceptance tests pass (see the Tests tab).` : `\n\n${passed} of ${results.length} acceptance tests pass in the simulator. The Tests tab shows what still fails and why.`;
    const untested = project.requirements?.untested ?? [];
    if (untested.length) extra += ` No test checks ${untested.length === 1 ? 'this promise' : 'these promises'} yet, so try ${untested.length === 1 ? 'it' : 'them'} yourself: ${untested.map((u) => `“${u.replace(/\.$/, '')}”`).join('; ')}.`;
  }
  return { project, reply: reply + extra, intent, log, results, requirements: project.requirements };
}

function renameForBoard(prev: Project, board: Project['board']) {
  if (board === prev.board) return prev.name;
  const short: Record<string, string> = { esp32: 'ESP32', pico: 'Pico', rpi4: 'Raspberry Pi', none: '' };
  const old = short[prev.board];
  return old && prev.name.startsWith(old) ? prev.name.replace(old, short[board]) : prev.name;
}

export interface AiCodeResult {
  project: Project;
  reply: string;
  log: string[];
  ok: boolean;
}

/**
 * Edit one file with Claude, then run the project in the simulator for a few seconds.
 * If it crashes, show Claude the traceback and let it repair (two rounds max).
 */
export async function aiEditFile(project: Project, file: string, instruction: string, opts: { error?: string; selection?: string } = {}): Promise<AiCodeResult> {
  registerProjectParts(project);
  const log: string[] = [];
  const board = project.board === 'none' ? null : BOARDS[project.board];
  const wiring = (project.features ?? []).map((f) => ({ label: f.label, kind: f.kind, gpio: f.gpio, mcpChannel: f.mcpChannel }));
  const others = Object.entries(project.files)
    .filter(([n]) => n !== file)
    .map(([n, src]) => `--- ${n} (read-only, first lines) ---\n${src.split('\n').slice(0, 25).join('\n')}`)
    .join('\n\n');
  const turns: Turn[] = [
    {
      role: 'user',
      content: `Project: ${project.name} on ${board?.name ?? 'no microcontroller'} (${board?.language === 'python' ? 'Python 3 + gpiozero' : 'MicroPython'}).
Wiring (feature → GPIO numbers): ${JSON.stringify(wiring)}${partSkills(project)}
${others ? `Other project files:\n${others}\n` : ''}
File to edit: ${file}
\`\`\`python
${project.files[file] ?? ''}
\`\`\`
${project.requirements?.does?.length ? `The project's requirements card promises:\n${project.requirements.does.map((d) => `- ${d}`).join('\n')}\nKeep the program and your behaviour list consistent with these promises (same counts, timings and thresholds) unless the request changes them.\n` : ''}${opts.selection ? `The user selected this part of the file:\n\`\`\`python\n${opts.selection}\n\`\`\`\n` : ''}${opts.error ? `The program currently crashes with:\n${opts.error}\n` : ''}
Request: ${instruction}`,
    },
  ];
  let best: Project | null = null;
  let reply = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await askJson(CODE_SYSTEM, turns, FileEditSchema, { effort: 'medium' });
    reply = reply || out.reply;
    const content = out.content.replace(/\bGPIO0+(\d)/g, 'GPIO$1');
    const candidate: Project = { ...project, files: { ...project.files, [file]: content }, codeCustom: file === 'main.py' ? true : project.codeCustom, behavior: file === 'main.py' ? out.behavior : project.behavior };
    best = candidate;
    if (project.board === 'none') return { project: candidate, reply, log, ok: true };
    const { engine } = await simulate(candidate, { untilMs: 4000 });
    if (!engine.error) {
      log.push(`Ran the new code in the simulator for 4 s: it starts and runs without crashing${attempt ? ` (after ${attempt} automatic fix${attempt > 1 ? 'es' : ''})` : ''}. That doesn't prove the new behaviour yet: the Tests tab checks that.`);
      const errs = engine.allWarnings.filter((w) => w.severity === 'error');
      if (errs.length) log.push(`Simulator warnings: ${errs.map((w) => w.text).join(' ')}`);
      return { project: candidate, reply, log, ok: true };
    }
    log.push(`Attempt ${attempt + 1} crashed in the simulator: ${engine.error.message}${engine.error.line ? ` (line ${engine.error.line})` : ''}`);
    turns.push({ role: 'assistant', content: JSON.stringify(out) }, { role: 'user', content: `I ran your file in the simulator and it crashed:\n${engine.error.raw}\nFix it and return the complete file.` });
  }
  log.push('The change still crashes in the simulator — review it before accepting.');
  return { project: best!, reply, log, ok: false };
}

// ---------- Photo wiring check ----------

const PhotoCheckSchema = z.object({
  verdict: z.enum(['looks-right', 'problems', 'cant-tell']).describe("'cant-tell' when the photo is too blurry, dark, cropped or angled to check the wiring"),
  summary: z.string().describe('1-3 friendly sentences for a beginner: the overall result'),
  issues: z
    .array(
      z.object({
        parts: z.array(z.string()).describe('Part refs (R1, D1…), board pins and/or breadboard holes involved'),
        problem: z.string().describe('What is wrong, as seen in the photo'),
        fix: z.string().describe('Exactly what to move, turn round or add'),
        confidence: z.enum(['high', 'medium', 'low']),
      }),
    )
    .describe('Wiring mistakes visible in the photo; empty when it looks right'),
  could_not_check: z.array(z.string()).describe('Short items you could NOT verify from the photo (e.g. "which way round D1–D3 are", "the GND wire under the Pico"); empty if everything was visible'),
  photo_tips: z.string().nullable().describe('If parts of the build could not be checked: how to take a better photo (closer, from straight above, better light); otherwise null'),
});
export type PhotoCheckResult = z.infer<typeof PhotoCheckSchema>;

const PHOTO_SYSTEM = `You check beginners' breadboard builds from a photo inside Sparkbench, a hardware design studio.
You get the intended design (parts and every connection) and one or more photos of the real build.
Breadboard facts: in each numbered column, holes a–e are connected together and f–j are connected together; the centre gap separates the halves. The long power rails along the edges (+ red line, − blue line) run the length of the board (some boards split them in the middle).
Trace every leg and jumper end to the hole it actually sits in. Typical mistakes: LED in backwards (the longer leg / anode must face the resistor or the GPIO; the flat edge is the cathode), electrolytic capacitor reversed (striped leg is −), a leg one hole off, a jumper on the neighbouring board pin, a missing wire, a wire on the wrong rail, both legs of a part in the same column (shorted), a board not straddling the centre gap.
Only report what you can actually see. Anything you can't verify (hidden legs, polarity you can't make out, blurry areas) goes in could_not_check, with photo tips; never guess and never invent problems. 'looks-right' means no problems were seen, not that unseen things are fine. Be warm, short and concrete.`;

export async function aiCheckPhoto(project: Project, images: { data: string; mediaType: string }[], note?: string): Promise<PhotoCheckResult> {
  const { wireEndLabel, buildGuide } = await import('../src/core/docs');
  const parts = project.parts.map((p) => `- ${p.ref ?? p.id}: ${p.label ?? p.type}${p.props?.value ? ` (${p.props.value})` : ''}${p.props?.color ? `, ${p.props.color}` : ''}`).join('\n');
  const conns = project.wires.map((w) => `- ${wireEndLabel(project, w.a)} → ${wireEndLabel(project, w.b)}`).join('\n');
  const { planBreadboard } = await import('../src/core/bbplace');
  const plan = planBreadboard(project);
  const layout = plan.problems.length ? '' : `\n\nThe hole-by-hole layout Sparkbench gave them (hole = row letter + column number; check each leg and jumper end against it, but a different layout that makes the same connections is also fine — judge connections, not exact holes):\n${plan.steps.map((st, i) => `${i + 1}. ${st.text}`).join('\n')}`;
  const guide = layout ? '' : `\n\nThe build guide the user followed:\n${buildGuide(project).slice(0, 14000)}`;
  const prompt = `Project: ${project.name}\n\nParts:\n${parts}\n\nEvery connection the build must make:\n${conns}${layout}${guide}\n\n${note ? `The user says: ${note}\n\n` : ''}Check the photo${images.length > 1 ? 's' : ''} of their build against this design.`;
  return askJson(PHOTO_SYSTEM, [{ role: 'user', content: prompt }], PhotoCheckSchema, { effort: 'medium', images: images as any });
}

// ---------- Debugging a real build ----------

const DebugSchema = z.object({
  summary: z.string().describe('1-2 friendly sentences: what is most likely wrong'),
  causes: z
    .array(
      z.object({
        cause: z.string().describe('A likely cause, most likely first'),
        check: z.string().describe('How to check it (look at hole X, measure Y, run Z)'),
        fix: z.string().describe('Exactly what to change'),
        confidence: z.enum(['high', 'medium', 'low']),
      }),
    )
    .describe('1-4 likely causes, most likely first'),
  next_step: z.string().describe('The single next thing to do'),
});
export type DebugResult = z.infer<typeof DebugSchema>;

const DEBUG_SYSTEM = `You help beginners debug a real electronics build in Sparkbench. You get the design (parts, every connection, the exact breadboard layout, the program), what the user says is wrong, and whatever evidence there is: the board's serial output, the self-test output from the real board, the same self-test's output in the simulator (what a correct build prints), and photos.
Reason from the evidence: a self-test FAIL line or a difference from the simulator's output is the strongest clue; an I2C device missing usually means swapped SDA/SCL, a loose wire or no power; a reading stuck at 0 % or 100 % means an open or shorted divider; tracebacks name the line. Be concrete (hole names, pin names, part refs). Never invent evidence. Keep it short and kind.`;

export async function aiDebug(project: Project, input: { symptom: string; serial?: string; selftest?: string; images?: { data: string; mediaType: string }[] }): Promise<DebugResult> {
  const { wireEndLabel } = await import('../src/core/docs');
  const { planBreadboard } = await import('../src/core/bbplace');
  const { simulateSelfTest } = await import('../src/sim/selftest-sim');
  const conns = project.wires.map((w) => `- ${wireEndLabel(project, w.a)} → ${wireEndLabel(project, w.b)}`).join('\n');
  const plan = planBreadboard(project);
  const expected = project.board === 'none' ? '' : await simulateSelfTest(project).catch(() => '');
  const content = [
    `Project: ${project.name} (${project.board})`,
    `Connections:\n${conns}`,
    plan.problems.length ? '' : `Breadboard layout:\n${plan.steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}`,
    `main.py:\n\`\`\`python\n${(project.files['main.py'] ?? '').slice(0, 12000)}\n\`\`\``,
    `What the user says: ${input.symptom}`,
    input.serial ? `Serial output from the real board (latest):\n${input.serial.slice(-6000)}` : 'No serial output captured.',
    input.selftest ? `Self-test output from the real board:\n${input.selftest.slice(-4000)}` : 'The self-test has not been run on the real board.',
    expected ? `The same self-test in the simulator (correct build):\n${expected}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return askJson(DEBUG_SYSTEM, [{ role: 'user', content }], DebugSchema, { effort: 'medium', images: input.images as any });
}

// ---------- Explain a line of code ----------

const ExplainSchema = z.object({ explanation: z.string().describe('2-4 plain sentences for a beginner: what this line does in this program, why it is there, and what would change if you edited it') });

export async function aiExplainLine(project: Project, file: string, line: number): Promise<string> {
  const src = project.files[file] ?? '';
  const lines = src.split('\n');
  const ctx = lines.slice(Math.max(0, line - 12), line + 8).map((l, i) => `${Math.max(1, line - 11) + i}${Math.max(1, line - 11) + i === line ? '>' : ' '} ${l}`).join('\n');
  const wiring = (project.features ?? []).map((f) => `${f.label}: ${Object.entries(f.gpio).map(([k, v]) => `${k}=GPIO${v}`).join(' ')}`).join('; ');
  const out = await askJson('You explain firmware to complete beginners in Sparkbench. Be concrete about this project\'s hardware. No jargon without a short explanation.', [{ role: 'user', content: `Project: ${project.name} (${project.board}). Wiring: ${wiring}\nFile ${file}, around line ${line} (marked >):\n${ctx}\n\nExplain line ${line}.` }], ExplainSchema, { effort: 'low' });
  return out.explanation;
}

// ---------- Strict grading of one classroom requirement ----------

const GradeSchema = z.object({
  applies: z.boolean().describe('Does this design contain the hardware the requirement names (same kind AND colour/role, e.g. "the red LED" needs an LED whose colour is red)? false if anything named is missing or different.'),
  why: z.string().describe('One sentence: which parts satisfy the requirement, or what is missing'),
  tests: z.array(z.object({ title: z.string(), steps: z.array(StepSchema) })).describe('1-2 tests that check the requirement LITERALLY on this design (empty if applies is false)'),
});

const GRADE_SYSTEM = `${TESTS_SYSTEM}
You are grading a student's project against a teacher's requirement. Be strict and literal: never reinterpret the requirement to fit the design. If the requirement mentions a part (by kind, colour or role) that the design doesn't have, set applies=false. Otherwise write tests that check exactly what the requirement says.`;

export async function aiGradeRequirement(project: Project, requirement: string): Promise<{ applies: boolean; why: string; tests: AcceptanceTest[] }> {
  const parts = project.parts.map((p) => ({ ref: p.ref ?? p.id, type: p.type, label: p.label ?? null, color: p.props?.color ?? null }));
  const out = await askJson(
    GRADE_SYSTEM,
    [{ role: 'user', content: `Project: ${project.name}\nParts (with colours): ${JSON.stringify(parts)}\nSimulator controls: ${JSON.stringify(partControls(project))}\nmain.py:\n\`\`\`python\n${project.files['main.py'] ?? ''}\n\`\`\`\n\nRequirement: ${requirement}` }],
    GradeSchema,
    { effort: 'low' },
  );
  const tests = out.tests.map((t, i) => ({ id: `grade-${Date.now().toString(36)}-${i}`, title: t.title, source: 'ai' as const, steps: t.steps.map(toStep).filter((x): x is TestStep => !!x) })).filter((t) => t.steps.length);
  return { applies: out.applies, why: out.why, tests };
}
