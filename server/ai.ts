// Claude-powered design copilot and code assistant.
// Design: Claude turns a request into a DesignSpec (the same structure the offline planner
// produces), the deterministic planner wires it, and — when the request needs custom behaviour —
// Claude writes main.py. Code: Claude edits a file on request. Every firmware change is run in
// the simulator; crashes are fed back to Claude to repair (up to two rounds).
import { z } from 'zod';
import type { DesignSpec, Project } from '../src/core/types';
import { buildProject, FEATURE_LABELS } from '../src/core/planner';
import { BOARDS } from '../src/core/boards';
import { simulate } from '../src/sim/node-runner';
import { askJson, backend, MODEL, type Turn } from './llm';
import { runChecks } from '../src/core/checks';
import { registerProjectParts } from '../src/core/customParts';

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
});

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
- rpi4: Raspberry Pi 4, Python 3 + gpiozero (no analog inputs: the tool adds an MCP3008 automatically)
- none: battery-powered discrete circuit (features 'astable555' or 'transistor-led' only). astable555 can blink an LED (output "led") or beep a piezo buzzer (output "buzzer").
Available feature kinds (each list entry = one physical part group; two buttons = two entries):
${Object.entries(FEATURE_LABELS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
At most one each of: oled, lcd, mpu6050, dht22, hcsr04, neopixel, relay, buzzer (I2C address / bus limits).
Pin assignment, resistors, dividers and wiring are done automatically by the tool — never list resistors yourself.
Unsupported boards (Arduino Uno, STM32…) → pick the closest supported board and say so. Unsupported parts → pick the closest supported part and say so.
To move a part to another pin, keep it in the features list with its "pin" set (intent "edit"); never move a part by editing code alone — the tool rewires the breadboard and keeps the code in sync. Keep the same labels for parts that stay, so their wiring is kept.
If you substitute a part or reduce a quantity, say exactly what you built instead (e.g. "a 12-LED NeoPixel ring", not "a ring").
Default to esp32 when no board is named. Keep replies short, warm and concrete.
Answer only the user's latest message — never repeat or revisit answers to earlier questions. When you give steps, use a short numbered Markdown list (one step per line).`;

const CODE_SYSTEM = `You are the firmware assistant inside Sparkbench. You edit code for a real hardware project; the same code runs in Sparkbench's simulator and on the physical board.
MicroPython targets (ESP32, Pico) use: machine.Pin/ADC/PWM/I2C/time_pulse_us, time.sleep_ms/ticks_ms/ticks_diff, and the bundled drivers ssd1306.SSD1306_I2C (framebuf API: fill, text, pixel, hline, vline, rect, fill_rect, line, show), i2c_lcd.I2cLcd (clear, move_to, putstr), mpu6050.MPU6050 (accel(), gyro() in g and °/s), dht.DHT22 (measure(), temperature(), humidity()), neopixel.NeoPixel (np[i]=(r,g,b); np.write()).
Raspberry Pi targets use Python 3 + gpiozero (Button, PWMLED, RGBLED, PWMOutputDevice, AngularServo, DistanceSensor, MotionSensor, MCP3008, OutputDevice) and the bundled oled.OLED (same drawing API), i2c_lcd.I2cLcd, mpu6050.MPU6050, adafruit_dht.DHT22 (board.D<n>), neopixel.NeoPixel (pixels[i]=..., pixels.show()).
Rules: keep the existing pin numbers (they match the wiring), keep the program structure and helpful comments, write clear beginner-friendly code with comments, keep a main loop that sleeps (time.sleep_ms / time.sleep) so the board stays responsive, and never invent libraries that are not listed. Return the COMPLETE file.`;

export function aiStatus() {
  const b = backend();
  return b === 'none' ? { enabled: false } : { enabled: true, model: MODEL, via: b };
}

export interface AiDesignResult {
  project?: Project;
  reply: string;
  intent: 'new' | 'edit' | 'code' | 'question';
  log: string[];
}

function projectContext(p?: Project) {
  if (!p) return 'There is no current design yet.';
  return `Current design: ${JSON.stringify({ title: p.name, board: p.board, features: (p.spec?.features ?? []).map((f) => ({ kind: f.kind, label: f.label ?? null })) })}
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

export async function aiDesign(prompt: string, current?: Project, history: Turn[] = []): Promise<AiDesignResult> {
  registerProjectParts(current);
  const log: string[] = [];
  const d = await askJson(SYSTEM, [...history.slice(-6), { role: 'user', content: `${projectContext(current)}\n\nRequest: ${prompt}` }], DesignSchema);
  log.push(`Claude: intent=${d.intent}, board=${d.board}, ${d.features.length} part groups.`);
  if (d.intent === 'question') return { reply: d.reply, intent: 'question', log };
  if (d.intent === 'code' && current) {
    const r = await aiEditFile(current, 'main.py', d.firmware_brief ?? prompt);
    return finish(r.project, `${d.reply}\n\n${r.reply}`.trim(), 'code', [...log, ...r.log]);
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
  let project = buildProject(spec, { name: isEdit ? renameForBoard(current!, d.board) : d.title, prompt, previous: isEdit ? { ...current!, codeCustom: false } : undefined });
  if (isEdit && current!.codeCustom && project.board !== 'none' && current!.board === project.board) {
    // The user's (or Claude's) custom program must survive a wiring change: adapt it rather than replace it.
    const adapted = { ...project, files: { ...project.files, 'main.py': current!.files['main.py'] }, behavior: current!.behavior };
    const r = await aiEditFile(adapted, 'main.py', `The hardware design just changed (${prompt}). Update this program so it uses the new wiring listed above${d.write_firmware && d.firmware_brief ? ` and also: ${d.firmware_brief}` : ''}. Keep everything else it already does.`);
    return finish(r.project, d.reply, d.intent, [...log, ...r.log]);
  }
  if (d.write_firmware && d.firmware_brief && project.board !== 'none') {
    const r = await aiEditFile(project, 'main.py', d.firmware_brief);
    project = r.project;
    log.push(...r.log);
  }
  return finish(project, d.reply, d.intent, log, current);
}

/** Append honest notes: design-check errors and any wiring that moved. */
function finish(project: Project, reply: string, intent: AiDesignResult['intent'], log: string[], previous?: Project): AiDesignResult {
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
  return { project, reply: reply + extra, intent, log };
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
${opts.selection ? `The user selected this part of the file:\n\`\`\`python\n${opts.selection}\n\`\`\`\n` : ''}${opts.error ? `The program currently crashes with:\n${opts.error}\n` : ''}
Request: ${instruction}`,
    },
  ];
  let best: Project | null = null;
  let reply = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await askJson(CODE_SYSTEM, turns, FileEditSchema, { effort: 'medium' });
    reply = reply || out.reply;
    const candidate: Project = { ...project, files: { ...project.files, [file]: out.content }, codeCustom: file === 'main.py' ? true : project.codeCustom, behavior: file === 'main.py' ? out.behavior : project.behavior };
    best = candidate;
    if (project.board === 'none') return { project: candidate, reply, log, ok: true };
    const { engine } = await simulate(candidate, { untilMs: 4000 });
    if (!engine.error) {
      log.push(`Simulated the new code for 4 s without errors${attempt ? ` (after ${attempt} automatic fix${attempt > 1 ? 'es' : ''})` : ''}.`);
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
