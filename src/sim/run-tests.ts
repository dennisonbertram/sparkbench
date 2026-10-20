// Run acceptance tests in the simulator (fast virtual time). Each test is its own simulation run,
// starting from power-on, so tests can't affect each other.
import type { Project } from '../core/types';
import type { AcceptanceTest, TestResult, TestStep } from '../core/acceptance';
import { validateTest } from '../core/acceptance';
import { simulate, type ScriptedInput } from './node-runner';
import { screenText } from './ocr';
import type { SimFrame } from './engine';

const SAMPLE = 100; // ms between checks while waiting for an expectation

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function check(step: Extract<TestStep, { kind: 'expect' }>, f: SimFrame, id: string | undefined, serial: string): { ok: boolean; saw: string } {
  const v = id ? f.parts[id] : undefined;
  switch (step.what) {
    case 'no-error':
      return { ok: !f.error, saw: f.error ? `error: ${f.error.message}` : 'no error' };
    case 'serial':
      return { ok: norm(serial).includes(norm(step.text ?? '')), saw: `serial: "${serial.split('\n').slice(-3).join(' / ').slice(0, 120)}"` };
    case 'screen': {
      const lines = screenText(v).filter((l) => !/^[\s"'_|.,`-]+$/.test(l));
      const all = lines.join(' ');
      return { ok: step.text ? norm(all).includes(norm(step.text)) : all.trim().length > 0, saw: lines.length ? `screen: "${all.slice(0, 120)}"` : 'screen: blank' };
    }
    case 'led': {
      const b = v?.rgb ? Math.max(...v.rgb) / 255 : (v?.led ?? 0);
      return { ok: step.on === false ? b < 0.05 : b > 0.2, saw: `${step.part} brightness ${Math.round(b * 100)}%` };
    }
    case 'buzzer':
      return { ok: step.on === false ? !v?.tone : !!v?.tone, saw: v?.tone ? `${step.part} sounding at ${Math.round(v.tone)} Hz` : `${step.part} silent` };
    case 'servo': {
      const a = v?.angle ?? NaN;
      return { ok: a >= (step.min ?? -1e9) && a <= (step.max ?? 1e9), saw: `${step.part} at ${Math.round(a)}°` };
    }
    case 'relay':
      return { ok: step.on === false ? !v?.relay : !!v?.relay, saw: `${step.part} ${v?.relay ? 'on' : 'off'}` };
    case 'motor':
      return { ok: step.on === false ? !(v?.spin ?? 0) : (v?.spin ?? 0) > 0, saw: `${step.part} ${v?.spin ? 'spinning' : 'stopped'}` };
    case 'pixels': {
      const lit = (v?.pixels ?? []).some((x) => x > 10);
      return { ok: step.on === false ? !lit : lit, saw: `${step.part} ${lit ? 'lit' : 'dark'}` };
    }
  }
}

function describe(step: Extract<TestStep, { kind: 'expect' }>): string {
  const not = step.on === false;
  switch (step.what) {
    case 'screen': return step.text ? `${step.part} to show "${step.text}"` : `${step.part} to show some text`;
    case 'serial': return `the serial console to print "${step.text}"`;
    case 'led': return `${step.part} to be ${not ? 'off' : 'on'}`;
    case 'buzzer': return `${step.part} to be ${not ? 'silent' : 'beeping'}`;
    case 'servo': return `${step.part} to turn to ${step.min ?? 0}–${step.max ?? 180}°`;
    case 'relay': return `${step.part} to switch ${not ? 'off' : 'on'}`;
    case 'motor': return `${step.part} to ${not ? 'stop' : 'run'}`;
    case 'pixels': return `${step.part} to ${not ? 'go dark' : 'light up'}`;
    case 'no-error': return 'no errors';
  }
}

export async function runTest(project: Project, test: AcceptanceTest): Promise<TestResult> {
  const t0 = Date.now();
  const bad = validateTest(project, test);
  if (bad.length) return { id: test.id, title: test.title, pass: false, detail: `The test can't run: ${bad.join('; ')}.`, ms: 0 };
  const idOf = new Map(project.parts.map((p) => [p.ref ?? p.id, p.id]));
  // Lay the steps on a timeline; every expectation gets a window of sample times.
  const inputs: ScriptedInput[] = [];
  const windows: { step: Extract<TestStep, { kind: 'expect' }>; from: number; to: number }[] = [];
  let t = 200;
  for (const s of test.steps) {
    if (s.kind === 'wait') t += s.ms;
    else if (s.kind === 'set') {
      inputs.push({ atMs: t, part: idOf.get(s.part)!, key: s.control, value: s.value });
      t += 50;
    } else if (s.kind === 'press') {
      inputs.push({ atMs: t, part: idOf.get(s.part)!, key: 'pressed', value: 1 }, { atMs: t + (s.ms ?? 150), part: idOf.get(s.part)!, key: 'pressed', value: 0 });
      t += (s.ms ?? 150) + 100;
    } else {
      const within = s.within ?? 1500;
      windows.push({ step: s, from: t, to: t + within });
      // The next step happens once this expectation would have had its chance (checked below).
      t += Math.min(within, 400);
    }
  }
  const sampleTimes = [...new Set(windows.flatMap((w) => Array.from({ length: Math.floor((w.to - w.from) / SAMPLE) + 1 }, (_, i) => w.from + i * SAMPLE)))];
  const until = Math.max(t, ...windows.map((w) => w.to)) + 100;
  const r = await simulate(project, { untilMs: until, inputs, onFrameAt: sampleTimes });
  const at = new Map(r.snapshots.map((s) => [s.atMs, s.frame]));
  // Serial is cumulative: rebuild what had been printed by each sample time.
  for (const w of windows) {
    let last = '';
    let ok = false;
    for (let ms = w.from; ms <= w.to; ms += SAMPLE) {
      const f = at.get(ms) ?? r.final;
      const serial = r.engine.serialAll.join('\n');
      const c = check(w.step, f, w.step.part ? idOf.get(w.step.part) : undefined, w.step.what === 'serial' ? serial : '');
      last = c.saw;
      if (c.ok) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      const err = r.engine.error ? ` The program stopped with an error: ${r.engine.error.message}.` : '';
      return { id: test.id, title: test.title, pass: false, detail: `Expected ${describe(w.step)} by ${(w.to / 1000).toFixed(1)} s, but saw ${last}.${err}`, ms: Date.now() - t0 };
    }
  }
  if (r.engine.error) return { id: test.id, title: test.title, pass: false, detail: `The program stopped with an error: ${r.engine.error.message}.`, ms: Date.now() - t0 };
  return { id: test.id, title: test.title, pass: true, detail: 'Passed in the simulator.', ms: Date.now() - t0 };
}

export async function runTests(project: Project, tests: AcceptanceTest[]): Promise<TestResult[]> {
  const out: TestResult[] = [];
  for (const t of tests) out.push(await runTest(project, t));
  return out;
}
