// Claude-powered design copilot. Claude turns a request into a DesignSpec (the same structure
// the offline planner produces) and may write custom firmware; we then build the project with
// the deterministic planner, run the firmware in the simulator, and feed any crash back to
// Claude to fix (up to two repair rounds).
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { DesignSpec, Project } from '../src/core/types';
import { buildProject, FEATURE_LABELS } from '../src/core/planner';
import { BOARDS } from '../src/core/boards';
import { simulate } from '../src/sim/node-runner';

const MODEL = 'claude-opus-5-5';

const FEATURE_KINDS = Object.keys(FEATURE_LABELS) as [string, ...string[]];

const DesignSchema = z.object({
  intent: z.enum(['new', 'edit', 'question']).describe('new design, edit of the current design, or just a question'),
  title: z.string().describe('Short friendly project name, e.g. "ESP32 Weather Station"'),
  board: z.enum(['esp32', 'pico', 'rpi4', 'none']),
  features: z
    .array(
      z.object({
        kind: z.enum(FEATURE_KINDS),
        label: z.string().nullable().describe('Optional human label, e.g. "Up button" or "Red"'),
        color: z.string().nullable().describe('LED / button colour if relevant'),
      }),
    )
    .describe('Every part-level feature in the FINAL design (for edits: the full updated list)'),
  reply: z.string().describe('2-6 friendly sentences for a beginner: what you designed/changed and why. Mention anything impossible and the alternative.'),
  write_firmware: z.boolean().describe('true if the request needs custom behaviour beyond the default generated firmware'),
  firmware_brief: z.string().nullable().describe('If write_firmware: the behaviour the firmware should implement'),
});

const FirmwareSchema = z.object({
  main_py: z.string().describe('Complete main.py'),
  notes: z.string().describe('One or two sentences on what the code does'),
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
Pin assignment, resistors, dividers and wiring are done automatically by the tool — never list resistors yourself.
If the user asks for something unsupported, pick the closest supported parts and say so in the reply.
Default to esp32 when no board is named. Keep replies short, warm and concrete.`;

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export interface AiDesignResult {
  project?: Project;
  reply: string;
  intent: 'new' | 'edit' | 'question';
  log: string[];
}

export async function aiDesign(prompt: string, current?: Project): Promise<AiDesignResult> {
  const client = new Anthropic();
  const log: string[] = [];
  const context = current
    ? `Current design: ${JSON.stringify({ title: current.name, board: current.board, features: current.spec?.features ?? [] })}`
    : 'There is no current design yet.';
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    ...({ fallbacks: 'default' } as object),
    output_config: { effort: 'medium', format: betaZodOutputFormat(DesignSchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `${context}\n\nRequest: ${prompt}` }],
  });
  if (res.stop_reason === 'refusal' || !res.parsed_output) {
    return { reply: "I can't help design that one. Try describing a different gadget.", intent: 'question', log };
  }
  const d = res.parsed_output;
  log.push(`Claude planned ${d.features.length} features on ${d.board}.`);
  if (d.intent === 'question') return { reply: d.reply, intent: 'question', log };
  const spec: DesignSpec = {
    board: d.board,
    title: d.title,
    features: d.features.map((f) => ({ kind: f.kind as DesignSpec['features'][number]['kind'], label: f.label ?? undefined, props: f.color ? { color: f.color } : undefined })),
  };
  let project = buildProject(spec, { name: d.title, prompt, previous: d.intent === 'edit' ? current : undefined });
  if (d.write_firmware && d.firmware_brief && project.board !== 'none') {
    project = await writeFirmware(client, project, d.firmware_brief, log);
  }
  return { project, reply: d.reply, intent: d.intent, log };
}

/** Ask Claude for custom firmware, simulate it, and repair crashes (agent loop). */
async function writeFirmware(client: Anthropic, project: Project, brief: string, log: string[]): Promise<Project> {
  const board = BOARDS[project.board as 'esp32' | 'pico' | 'rpi4'];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: `Write main.py for this ${board.name} project (${board.language === 'python' ? 'Python 3 + gpiozero; drivers: oled.OLED, i2c_lcd.I2cLcd, mpu6050.MPU6050, adafruit_dht, neopixel' : 'MicroPython; drivers: ssd1306, i2c_lcd.I2cLcd, mpu6050.MPU6050, dht, neopixel'}).
Behaviour wanted: ${brief}
Use exactly these pin assignments (from the wiring): ${JSON.stringify(project.features?.map((f) => ({ label: f.label, kind: f.kind, gpio: f.gpio, mcpChannel: f.mcpChannel })))}
Here is the tool's default firmware for reference — keep its structure, comments and driver usage:
\`\`\`python
${project.files['main.py']}
\`\`\``,
    },
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      ...({ fallbacks: 'default' } as object),
      output_config: { effort: 'medium', format: betaZodOutputFormat(FirmwareSchema) },
      messages,
    });
    const out = res.parsed_output;
    if (!out) break;
    const candidate: Project = { ...project, files: { ...project.files, 'main.py': out.main_py }, codeCustom: true };
    const { engine } = await simulate(candidate, { untilMs: 4000 });
    if (!engine.error) {
      log.push(`Custom firmware passed a 4 s simulation (attempt ${attempt + 1}).`);
      return candidate;
    }
    log.push(`Attempt ${attempt + 1} crashed in simulation: ${engine.error.message}`);
    messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: `Running it in the simulator crashed:\n${engine.error.raw}\nFix it and return the full main.py.` });
  }
  log.push('Kept the generated firmware because the custom version did not run cleanly.');
  return project;
}
