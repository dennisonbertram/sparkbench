// Arduino / C++ version of a project's firmware: Claude translates the MicroPython program (same
// pins, same behaviour) and arduino-cli compiles it for the real board; compiler errors go back to
// Claude until it builds. Also writes a PlatformIO project file.
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Project } from '../src/core/types';
import { askJson, type Turn } from './llm';
import { BOARDS } from '../src/core/boards';

const TARGET = {
  esp32: { fqbn: 'esp32:esp32:esp32', pio: { platform: 'espressif32', board: 'esp32dev' }, name: 'ESP32 Dev Module' },
  pico: { fqbn: 'rp2040:rp2040:rpipico', pio: { platform: 'https://github.com/maxgerhardt/platform-raspberrypi.git', board: 'pico', core: 'earlephilhower' }, name: 'Raspberry Pi Pico (Arduino-Pico core)' },
} as const;

/** Arduino libraries available to the generated code (installed with arduino-cli; PlatformIO names). */
const LIBS: { include: string; arduino: string; pio: string; boards?: ('esp32' | 'pico')[] }[] = [
  { include: 'Adafruit_SSD1306.h', arduino: 'Adafruit SSD1306', pio: 'adafruit/Adafruit SSD1306' },
  { include: 'Adafruit_GFX.h', arduino: 'Adafruit GFX Library', pio: 'adafruit/Adafruit GFX Library' },
  { include: 'DHT.h', arduino: 'DHT sensor library', pio: 'adafruit/DHT sensor library' },
  { include: 'Adafruit_MPU6050.h', arduino: 'Adafruit MPU6050', pio: 'adafruit/Adafruit MPU6050' },
  { include: 'Adafruit_Sensor.h', arduino: 'Adafruit Unified Sensor', pio: 'adafruit/Adafruit Unified Sensor' },
  { include: 'Adafruit_NeoPixel.h', arduino: 'Adafruit NeoPixel', pio: 'adafruit/Adafruit NeoPixel' },
  { include: 'ESP32Servo.h', arduino: 'ESP32Servo', pio: 'madhephaestus/ESP32Servo', boards: ['esp32'] },
  { include: 'Servo.h', arduino: 'Servo', pio: 'arduino-libraries/Servo', boards: ['pico'] },
  { include: 'LiquidCrystal_I2C.h', arduino: 'LiquidCrystal I2C', pio: 'marcoschwartz/LiquidCrystal_I2C' },
  { include: 'GxEPD2_BW.h', arduino: 'GxEPD2', pio: 'zinggjm/GxEPD2' },
  { include: 'ArduinoJson.h', arduino: 'ArduinoJson', pio: 'bblanchon/ArduinoJson' },
];

let cli: string | null | undefined;
export function arduinoCli(): string | null {
  if (cli !== undefined) return cli;
  try {
    cli = execFileSync('/bin/sh', ['-lc', 'command -v arduino-cli'], { encoding: 'utf8' }).trim() || null;
  } catch {
    cli = null;
  }
  return cli;
}

const Schema = z.object({
  sketch: z.string().describe('The complete .ino sketch'),
  notes: z.string().describe('1-3 sentences for a beginner: what differs from the MicroPython version, if anything'),
});

const SYSTEM = `You translate MicroPython firmware for Sparkbench projects into Arduino C++ for the same board and the same wiring.
Keep the behaviour identical: same pins (GPIO numbers), same thresholds, same screen text, same serial messages, same timing.
Use only these libraries (plus the Arduino core: Wire, SPI, WiFi, HTTPClient on ESP32): ${LIBS.map((l) => l.include).join(', ')}.
Write clean, commented, beginner-friendly code: constants at the top, setup(), loop() without long blocking delays (use millis() timing like the original).
Return the whole sketch. In your notes, don't say whether it compiles: Sparkbench compiles it for the board and reports that itself.`;

function compile(dir: string, fqbn: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(arduinoCli()!, ['compile', '--fqbn', fqbn, '--warnings', 'none', dir], { timeout: 600_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}\n${stderr}` }));
  });
}

export interface ArduinoResult {
  files: Record<string, string>;
  ok: boolean;
  target: string;
  size: string;
  log: string[];
  notes: string;
}

export async function aiArduino(project: Project): Promise<ArduinoResult> {
  if (project.board !== 'esp32' && project.board !== 'pico') throw new Error('An Arduino version is available for ESP32 and Pico projects (a Raspberry Pi runs Python on Linux).');
  if (!arduinoCli()) throw new Error('Install arduino-cli (and the board core) on this computer to build the Arduino version.');
  const t = TARGET[project.board];
  const board = BOARDS[project.board];
  const wiring = (project.features ?? []).map((f) => `${f.label} (${f.kind}): ${Object.entries(f.gpio).map(([k, v]) => `${k}=GPIO${v}`).join(' ')}`).join('\n');
  const turns: Turn[] = [
    {
      role: 'user',
      content: `Board: ${board.name} (Arduino core FQBN ${t.fqbn}).\nWiring:\n${wiring}\n\nmain.py:\n\`\`\`python\n${project.files['main.py'] ?? ''}\n\`\`\`\n${Object.keys(project.files).filter((f) => f !== 'main.py').length ? `Other files (drivers you can replace with the Arduino libraries): ${Object.keys(project.files).filter((f) => f !== 'main.py').join(', ')}\n` : ''}Translate it to an Arduino sketch.`,
    },
  ];
  const name = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'sketch';
  const dir = join(mkdtempSync(join(tmpdir(), 'sb-arduino-')), name);
  mkdirSync(dir, { recursive: true });
  const log: string[] = [];
  let sketch = '';
  let notes = '';
  let ok = false;
  let size = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const out = await askJson(SYSTEM, turns, Schema, { effort: 'medium' });
    sketch = out.sketch;
    notes = notes || out.notes;
    writeFileSync(join(dir, `${name}.ino`), sketch);
    const c = await compile(dir, t.fqbn);
    if (c.ok) {
      ok = true;
      size = /Sketch uses ([\d,]+ bytes \(\d+%\))/.exec(c.out)?.[1] ?? '';
      log.push(`Compiled for ${t.name}${attempt ? ` after ${attempt} fix${attempt > 1 ? 'es' : ''}` : ''}${size ? `: ${size} of program memory` : ''}.`);
      break;
    }
    const errs = c.out.split('\n').filter((l) => /error|undefined reference/i.test(l)).slice(0, 25).join('\n');
    log.push(`Attempt ${attempt + 1} didn't compile: ${errs.split('\n')[0]?.slice(0, 160)}`);
    turns.push({ role: 'assistant', content: JSON.stringify(out) }, { role: 'user', content: `arduino-cli compile failed:\n${errs || c.out.slice(-3000)}\nFix it and return the whole sketch.` });
  }
  const used = LIBS.filter((l) => sketch.includes(`<${l.include}>`) && (!l.boards || l.boards.includes(project.board as 'esp32')));
  const pio = [
    '; PlatformIO project for this sketch: open the folder in VS Code with the PlatformIO extension, then Upload.',
    `[env:${t.pio.board}]`,
    `platform = ${t.pio.platform}`,
    `board = ${t.pio.board}`,
    'framework = arduino',
    ...('core' in t.pio ? [`board_build.core = ${t.pio.core}`] : []),
    'monitor_speed = 115200',
    ...(used.length ? ['lib_deps =', ...used.map((l) => `    ${l.pio}`)] : []),
    '',
  ].join('\n');
  return {
    files: { [`arduino/${name}/${name}.ino`]: sketch, 'arduino/platformio.ini': pio, 'arduino/src/main.cpp': `#include <Arduino.h>\n${sketch}` },
    ok,
    target: t.name,
    size,
    log,
    notes,
  };
}
