// Design eval: natural-language requests → Claude designs → independent checks (expected parts,
// design checks, runs in the simulator, hidden behaviour tests written here, not by Claude).
// Run: npx tsx scripts/evals/design-eval.mts  (writes test-results/evals/design.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { aiDesign } from '../../server/ai';
import { runChecks } from '../../src/core/checks';
import { runTests } from '../../src/sim/run-tests';
import type { AcceptanceTest, TestStep } from '../../src/core/acceptance';
import type { Project } from '../../src/core/types';

type Hidden = (p: Project) => AcceptanceTest | null;
const ref = (p: Project, type: string, color?: string) => p.parts.find((x) => x.type === type && (!color || x.props?.color === color))?.ref;
const T = (title: string, steps: (TestStep | null)[]): AcceptanceTest | null => (steps.some((s) => !s) ? null : { id: title, title, source: 'user', steps: steps as TestStep[] });

const CASES: { prompt: string; must: string[]; hidden: Hidden[] }[] = [
  { prompt: 'A Raspberry Pi Pico that blinks a red LED once a second', must: ['pi-pico', 'led'], hidden: [(p) => T('LED goes on and off', [{ kind: 'expect', what: 'led', part: ref(p, 'led'), on: true, within: 2500 }, { kind: 'expect', what: 'led', part: ref(p, 'led'), on: false, within: 2500 }])] },
  { prompt: 'ESP32 thermometer: show the temperature on a small OLED screen', must: ['esp32-devkit', 'ssd1306', 'dht22'], hidden: [(p) => T('Screen shows 31 when it is 31 °C', [{ kind: 'set', part: ref(p, 'dht22')!, control: 'temperature', value: 31 }, { kind: 'wait', ms: 3000 }, { kind: 'expect', what: 'screen', part: ref(p, 'ssd1306'), text: '31', within: 4000 }])] },
  { prompt: 'A doorbell: when I press a button, a buzzer beeps', must: ['pushbutton', 'buzzer'], hidden: [(p) => T('Pressing the button beeps', [{ kind: 'wait', ms: 1500 }, { kind: 'press', part: ref(p, 'pushbutton')!, ms: 300 }, { kind: 'expect', what: 'buzzer', part: ref(p, 'buzzer'), on: true, within: 1500 }])] },
  { prompt: 'Plant monitor on a Pico: a soil moisture sensor, and a red LED that lights when the soil is dry', must: ['pi-pico', 'soil', 'led'], hidden: [(p) => T('Dry soil lights the LED', [{ kind: 'set', part: ref(p, 'soil')!, control: 'moisture', value: 5 }, { kind: 'expect', what: 'led', part: ref(p, 'led', 'red') ?? ref(p, 'led'), on: true, within: 4000 }]), (p) => T('Wet soil keeps it off', [{ kind: 'set', part: ref(p, 'soil')!, control: 'moisture', value: 90 }, { kind: 'wait', ms: 3000 }, { kind: 'expect', what: 'led', part: ref(p, 'led', 'red') ?? ref(p, 'led'), on: false, within: 3000 }])] },
  { prompt: 'Parking sensor: an ultrasonic distance sensor and a buzzer that beeps when something is closer than 20 cm', must: ['hcsr04', 'buzzer'], hidden: [(p) => T('Close object beeps', [{ kind: 'set', part: ref(p, 'hcsr04')!, control: 'distance', value: 8 }, { kind: 'expect', what: 'buzzer', part: ref(p, 'buzzer'), on: true, within: 4000 }])] },
  { prompt: 'Night light: turn a white LED on when it gets dark', must: ['ldr', 'led'], hidden: [(p) => T('Dark turns the LED on', [{ kind: 'set', part: ref(p, 'ldr')!, control: 'lux', value: 2 }, { kind: 'expect', what: 'led', part: ref(p, 'led'), on: true, within: 4000 }])] },
  { prompt: 'A servo that follows a knob (potentiometer)', must: ['servo', 'potentiometer'], hidden: [(p) => T('Knob at the end turns the servo far', [{ kind: 'set', part: ref(p, 'potentiometer')!, control: 'position', value: 100 }, { kind: 'expect', what: 'servo', part: ref(p, 'servo'), min: 150, max: 181, within: 4000 }])] },
  { prompt: 'A 555 timer circuit that blinks an LED, no microcontroller', must: ['ne555', 'led'], hidden: [(p) => T('LED blinks on its own', [{ kind: 'expect', what: 'led', part: ref(p, 'led'), on: true, within: 3000 }, { kind: 'expect', what: 'led', part: ref(p, 'led'), on: false, within: 3000 }])] },
];

const rows: any[] = [];
for (const c of CASES) {
  const t0 = Date.now();
  try {
    const r = await aiDesign(c.prompt, undefined, []);
    const p = r.project!;
    const types = p.parts.map((x) => x.type);
    const missing = c.must.filter((t) => !types.includes(t));
    const errors = runChecks(p).filter((x) => x.severity === 'error');
    const hidden = c.hidden.map((h) => h(p)).filter((x): x is AcceptanceTest => !!x);
    const hres = await runTests(p, hidden);
    const own = r.results ?? [];
    rows.push({ prompt: c.prompt, ok: !missing.length && !errors.length && hres.length === c.hidden.length && hres.every((x) => x.pass), missing, checkErrors: errors.map((e) => e.title), hidden: hres.map((x) => ({ title: x.title, pass: x.pass, detail: x.detail })), hiddenSkipped: c.hidden.length - hidden.length, ownTests: `${own.filter((x) => x.pass).length}/${own.length}`, seconds: Math.round((Date.now() - t0) / 1000) });
  } catch (e: any) {
    rows.push({ prompt: c.prompt, ok: false, error: String(e?.message ?? e) });
  }
  const last = rows[rows.length - 1];
  console.log(`${last.ok ? '✓' : '✗'} ${c.prompt} (${last.seconds ?? '-'} s) ${last.error ?? ''}${last.missing?.length ? ` missing ${last.missing}` : ''}${last.checkErrors?.length ? ` errors ${last.checkErrors}` : ''} hidden ${(last.hidden ?? []).map((h: any) => (h.pass ? '✓' : `✗ ${h.detail}`)).join(' ')} own ${last.ownTests ?? ''}`);
}
mkdirSync('test-results/evals', { recursive: true });
writeFileSync('test-results/evals/design.json', JSON.stringify(rows, null, 1));
console.log(`DESIGN EVAL: ${rows.filter((r) => r.ok).length}/${rows.length} pass`);
