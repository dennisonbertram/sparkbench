// Code eval: change requests on working projects → Claude edits the program (with its simulator
// repair loop) → a hidden acceptance test written here decides pass/fail.
// Run: npx tsx scripts/evals/code-eval.mts  (writes test-results/evals/code.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { aiEditFile } from '../../server/ai';
import { buildExample } from '../../src/core/examples';
import { runTests } from '../../src/sim/run-tests';
import type { AcceptanceTest, TestStep } from '../../src/core/acceptance';
import type { Project } from '../../src/core/types';

const ref = (p: Project, type: string, n = 0) => p.parts.filter((x) => x.type === type)[n]?.ref ?? '';
const T = (title: string, steps: TestStep[]): AcceptanceTest => ({ id: title, title, source: 'user', steps });

const CASES: { example: string; ask: string; hidden: (p: Project) => AcceptanceTest }[] = [
  { example: 'pico-traffic-light', ask: 'Print the colour name (RED, YELLOW or GREEN) on the serial console every time the light changes.', hidden: () => T('serial says GREEN', [{ kind: 'expect', what: 'serial', text: 'GREEN', within: 9000 }]) },
  { example: 'esp32-weather-imu', ask: 'Show the temperature in Fahrenheit instead of Celsius on the screen.', hidden: (p) => T('screen shows 86 F at 30 C', [{ kind: 'set', part: ref(p, 'dht22'), control: 'temperature', value: 30 }, { kind: 'wait', ms: 3000 }, { kind: 'expect', what: 'screen', part: ref(p, 'ssd1306'), text: '86', within: 5000 }]) },
  { example: 'pico-night-light', ask: 'Make the LED turn fully off when it is bright (more than 500 lux), with no dimming in between.', hidden: (p) => T('bright = off', [{ kind: 'set', part: ref(p, 'ldr'), control: 'lux', value: 1500 }, { kind: 'wait', ms: 2000 }, { kind: 'expect', what: 'led', part: ref(p, 'led'), on: false, within: 3000 }]) },
  { example: 'esp32-parking-sensor', ask: 'Also print the distance in cm on the serial console, like "Distance: 42 cm".', hidden: (p) => T('prints distance', [{ kind: 'set', part: ref(p, 'hcsr04'), control: 'distance', value: 42 }, { kind: 'expect', what: 'serial', text: 'Distance: 42', within: 4000 }]) },
  { example: 'pico-servo-dial', ask: 'Reverse the servo: knob at 0 % should point the servo to 180 degrees.', hidden: (p) => T('reversed', [{ kind: 'set', part: ref(p, 'potentiometer'), control: 'position', value: 0 }, { kind: 'expect', what: 'servo', part: ref(p, 'servo'), min: 150, max: 181, within: 4000 }]) },
  { example: 'esp32-motion-alarm', ask: 'When motion is detected, print "INTRUDER" on the serial console.', hidden: (p) => T('prints INTRUDER', [{ kind: 'wait', ms: 1500 }, { kind: 'set', part: ref(p, 'pir'), control: 'motion', value: 1 }, { kind: 'expect', what: 'serial', text: 'INTRUDER', within: 4000 }]) },
];

const rows: any[] = [];
for (const c of CASES) {
  const t0 = Date.now();
  const p0 = buildExample(c.example);
  try {
    const r = await aiEditFile(p0, 'main.py', c.ask);
    const [res] = await runTests(r.project, [c.hidden(r.project)]);
    rows.push({ example: c.example, ask: c.ask, ok: res.pass, detail: res.detail, repaired: r.log.filter((l) => /crashed/.test(l)).length, seconds: Math.round((Date.now() - t0) / 1000) });
  } catch (e: any) {
    rows.push({ example: c.example, ask: c.ask, ok: false, detail: String(e?.message ?? e) });
  }
  const last = rows[rows.length - 1];
  console.log(`${last.ok ? '✓' : '✗'} ${c.example}: ${c.ask} (${last.seconds} s) ${last.ok ? '' : last.detail}`);
}
mkdirSync('test-results/evals', { recursive: true });
writeFileSync('test-results/evals/code.json', JSON.stringify(rows, null, 1));
console.log(`CODE EVAL: ${rows.filter((r) => r.ok).length}/${rows.length} pass`);
