// Acceptance tests: what the user asked for, as executable checks ("press Button A → the LED comes
// on", "set the soil sensor to dry → the screen says Water me"). They run in the simulator on every
// change, and the same steps become the hands-on test checklist for the real board.
import type { Project } from './types';
import { partDef } from './parts';

export type TestStep =
  | { kind: 'wait'; ms: number }
  | { kind: 'set'; part: string; control: string; value: number }
  | { kind: 'press'; part: string; ms?: number }
  | {
      kind: 'expect';
      what: 'screen' | 'serial' | 'led' | 'buzzer' | 'servo' | 'relay' | 'motor' | 'pixels' | 'no-error';
      part?: string;
      text?: string;
      on?: boolean;
      min?: number;
      max?: number;
      /** Give the program this long to make it true (default 1500 ms). */
      within?: number;
    };

export interface AcceptanceTest {
  id: string;
  /** Plain-English promise, e.g. "When the soil is dry, the screen says Water me". */
  title: string;
  steps: TestStep[];
  /** Where it came from: derived from the generated code, written by the AI from the request, or by the user. */
  source: 'auto' | 'ai' | 'user';
}

export interface TestResult {
  id: string;
  title: string;
  pass: boolean;
  /** Plain-English reason when it fails. */
  detail: string;
  ms: number;
}

/** Controls a part offers (slider keys etc.), for the AI prompt and validation. */
export function partControls(project: Project): { ref: string; type: string; controls: { key: string; label: string; min?: number; max?: number; kind: string }[] }[] {
  return project.parts
    .filter((p) => partDef(p.type).category !== 'board')
    .map((p) => ({
      ref: p.ref ?? p.id,
      type: p.type,
      controls: (partDef(p.type).controls ?? []).map((c: any) => ({ key: c.key, label: c.label, min: c.min, max: c.max, kind: c.kind })),
    }));
}

/** Problems with a test (unknown parts or controls) — empty when it can run. */
export function validateTest(project: Project, t: AcceptanceTest): string[] {
  const refs = new Map(project.parts.map((p) => [p.ref ?? p.id, p]));
  const out: string[] = [];
  for (const s of t.steps) {
    if ('part' in s && s.part) {
      const p = refs.get(s.part);
      if (!p) out.push(`unknown part ${s.part}`);
      else if (s.kind === 'set' && !(partDef(p.type).controls ?? []).some((c: any) => c.key === s.control)) out.push(`${s.part} has no control "${s.control}"`);
      else if (s.kind === 'press' && !(partDef(p.type).controls ?? []).some((c: any) => c.key === 'pressed')) out.push(`${s.part} can't be pressed`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ tests derived from generated code

const ref = (p: Project, type: string, n = 0) => {
  const x = p.parts.filter((q) => q.type === type)[n];
  return x ? (x.ref ?? x.id) : undefined;
};

/**
 * Tests Sparkbench can derive from a design whose code it generated: it boots cleanly, the screen
 * shows something, live readings reach the screen, buttons toggle their LEDs, a traffic light cycles.
 */
export function deriveTests(project: Project): AcceptanceTest[] {
  const tests: AcceptanceTest[] = [];
  const main = project.files['main.py'] ?? '';
  if (project.board === 'none') {
    const led = ref(project, 'led');
    const sw0 = ref(project, 'pushbutton');
    if (led && ref(project, 'ne555')) tests.push({ id: 'blinks', source: 'auto', title: `${led} blinks on its own`, steps: [{ kind: 'expect', what: 'led', part: led, on: true, within: 3000 }, { kind: 'expect', what: 'led', part: led, on: false, within: 3000 }] });
    if (led && sw0 && ref(project, 'npn')) tests.push({ id: 'switch', source: 'auto', title: `Holding ${sw0} lights ${led}`, steps: [{ kind: 'expect', what: 'led', part: led, on: false }, { kind: 'set', part: sw0, control: 'pressed', value: 1 }, { kind: 'expect', what: 'led', part: led, on: true, within: 500 }, { kind: 'set', part: sw0, control: 'pressed', value: 0 }, { kind: 'expect', what: 'led', part: led, on: false, within: 500 }] });
    const bz = ref(project, 'buzzer');
    const sw = sw0;
    if (bz && sw) tests.push({ id: 'tone', source: 'auto', title: `Holding ${sw} makes ${bz} beep`, steps: [{ kind: 'set', part: sw, control: 'pressed', value: 1 }, { kind: 'expect', what: 'buzzer', part: bz, on: true, within: 1000 }, { kind: 'set', part: sw, control: 'pressed', value: 0 }, { kind: 'expect', what: 'buzzer', part: bz, on: false, within: 1000 }] });
    return tests;
  }
  if (!main) return tests;
  tests.push({ id: 'boots', source: 'auto', title: 'The program starts and keeps running without errors', steps: [{ kind: 'wait', ms: 3000 }, { kind: 'expect', what: 'no-error' }] });
  if (/starting(…|\.\.\.)/.test(main)) tests.push({ id: 'hello', source: 'auto', title: 'It says it is starting on the serial console', steps: [{ kind: 'expect', what: 'serial', text: 'starting', within: 2000 }] });
  const display = ref(project, 'ssd1306') ?? ref(project, 'lcd1602');
  if (display && !project.codeCustom) {
    tests.push({ id: 'screen', source: 'auto', title: `${display} shows text after start-up`, steps: [{ kind: 'wait', ms: 2500 }, { kind: 'expect', what: 'screen', part: display, text: '', within: 1000 }] });
    const dht = ref(project, 'dht22');
    if (dht && /temperature\(\)/.test(main) && !/PAGES = [2-9]/.test(main))
      tests.push({ id: 'temp-on-screen', source: 'auto', title: `Changing the temperature at ${dht} updates ${display}`, steps: [{ kind: 'set', part: dht, control: 'temperature', value: 31.5 }, { kind: 'wait', ms: 2500 }, { kind: 'expect', what: 'screen', part: display, text: '31', within: 3000 }] });
  }
  // Buttons that toggle an LED (generated code says so in a comment).
  for (const m of main.matchAll(/# (.+?): toggle the (.+)/g)) {
    const btn = project.parts.find((p) => p.type === 'pushbutton' && (p.label ?? '') === m[1]);
    const led = project.parts.find((p) => p.type === 'led' && (p.label ?? '').toLowerCase() === m[2].trim().toLowerCase());
    if (btn && led) {
      const b = btn.ref ?? btn.id;
      const l = led.ref ?? led.id;
      tests.push({ id: `toggle-${b}`, source: 'auto', title: `Pressing ${b} switches ${l} on, pressing again switches it off`, steps: [{ kind: 'wait', ms: 1500 }, { kind: 'press', part: b }, { kind: 'expect', what: 'led', part: l, on: true }, { kind: 'press', part: b }, { kind: 'expect', what: 'led', part: l, on: false }] });
    }
  }
  const leds = project.parts.filter((p) => p.type === 'led');
  if (leds.length === 3 && /traffic/i.test(main)) {
    const [r, , g] = leds.map((p) => p.ref ?? p.id);
    tests.push({ id: 'traffic', source: 'auto', title: 'The lights cycle red, then green', steps: [{ kind: 'expect', what: 'led', part: r, on: true, within: 2000 }, { kind: 'expect', what: 'led', part: g, on: true, within: 8000 }] });
  }
  return tests;
}
