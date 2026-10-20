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
- none: battery-powered discrete circuit (features 'astable555' or 'transistor-led' only)
Available feature kinds (each list entry = one physical part group; two buttons = two entries):
${Object.entries(FEATURE_LABELS)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
At most one each of: oled, lcd, mpu6050, dht22, hcsr04, neopixel, relay, buzzer (I2C address / bus limits).
Pin assignment, resistors, dividers and wiring are done automatically by the tool — never list resistors yourself.
Unsupported boards (Arduino Uno, STM32…) → pick the closest supported board and say so. Unsupported parts → pick the closest supported part and say so.
If you substitute a part or reduce a quantity, say exactly what you built instead (e.g. "a 12-LED NeoPixel ring", not "a ring").
Default to esp32 when no board is named. Keep replies short, warm and concrete.`;

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

export async function aiDesign(prompt: string, current?: Project, history: Turn[] = []): Promise<AiDesignResult> {
  const log: string[] = [];
  const d = await askJson(SYSTEM, [...history.slice(-6), { role: 'user', content: `${projectContext(current)}\n\nRequest: ${prompt}` }], DesignSchema);
  log.push(`Claude: intent=${d.intent}, board=${d.board}, ${d.features.length} part groups.`);
  if (d.intent === 'question') return { reply: d.reply, intent: 'question', log };
  if (d.intent === 'code' && current) {
    const r = await aiEditFile(current, 'main.py', d.firmware_brief ?? prompt);
    return { project: r.project, reply: `${d.reply}\n\n${r.reply}`.trim(), intent: 'code', log: [...log, ...r.log] };
  }
  const spec: DesignSpec = {
    board: d.board,
    title: d.title,
    features: d.features.map((f) => ({
      kind: f.kind as DesignSpec['features'][number]['kind'],
      label: f.label ?? undefined,
      props: f.color || f.count ? { ...(f.color ? { color: f.color } : {}), ...(f.count && f.kind === 'neopixel' ? { pixels: f.count } : {}) } : undefined,
    })),
  };
  const isEdit = d.intent === 'edit' && !!current;
  let project = buildProject(spec, { name: isEdit ? current!.name : d.title, prompt, previous: isEdit ? { ...current!, codeCustom: false } : undefined });
  if (d.write_firmware && d.firmware_brief && project.board !== 'none') {
    const r = await aiEditFile(project, 'main.py', d.firmware_brief);
    project = r.project;
    log.push(...r.log);
  }
  // Be upfront about anything the design checker flags (e.g. too much current for USB power).
  const problems = runChecks(project).filter((x) => x.severity === 'error');
  const warn = problems.length ? `\n\nHeads up — the design checker found ${problems.length === 1 ? 'one problem' : `${problems.length} problems`}: ${problems.map((x) => `${x.title}${x.detail ? ` (${x.detail.split('. ')[0]})` : ''}`).join('; ')}. See the Problems tab for details and fixes.` : '';
  return { project, reply: d.reply + warn, intent: d.intent, log };
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
Wiring (feature → GPIO numbers): ${JSON.stringify(wiring)}
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
