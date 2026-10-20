// Human-readable outputs: the step-by-step build guide, the blog post, and the short
// "here's what I designed and why" explanation for the AI chat reply.
// Everything is written for a total beginner and derived from the actual design
// (parts, wires, pins, firmware), so it stays correct when the design changes.
import { planBreadboard } from './bbplace';
import type { FeatureInstance, FeatureKind, PartDef, PartInstance, PinRef, Project, Wire } from './types';
import { partDef, formatOhms, formatFarads } from './parts';
import { boardFor, boardPin, type BoardDef } from './boards';
import { buildNets, boardPart, pinKey } from './netlist';
import { buildBom, bomTotal, formatUsd, partValue, type BomLine } from './bom';
import { runChecks, checkSummary } from './checks';

// ==================================================================== small language helpers

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const numberWord = (n: number) => NUM_WORDS[n] ?? String(n);
const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// Keep acronyms and brand names (LED, OLED, NeoPixel, MicroPython) as they are.
const lowerFirst = (s: string) => (s && !/^[A-Z0-9][A-Z0-9]/.test(s) && !/^[A-Z][a-z]+[A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** "a" or "an" for a word or name ("an LED", "an ESP32", "a NeoPixel", "a 555"). */
export function an(phrase: string): string {
  const w = phrase.trim().split(/[\s-]/)[0] ?? '';
  if (!w) return 'a';
  if (/^(8|11|18)\b/.test(w) || /^8\d/.test(w)) return 'an';
  if (/^\d/.test(w)) return 'a';
  const acronym = /^[A-Z][A-Z0-9]/.test(w);
  if (acronym) return /^[AEFHILMNORSX]/.test(w) ? 'an' : 'a';
  if (/^(uni|use|usu|one|eu)/i.test(w)) return 'a';
  if (/^(hour|honest)/i.test(w)) return 'an';
  return /^[aeiou]/i.test(w) ? 'an' : 'a';
}
const withArticle = (s: string) => `${an(s)} ${s}`;

/** "a", "a and b", "a, b and c" */
export function listJoin(items: string[], conj = 'and'): string {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} ${conj} ${xs[xs.length - 1]}`;
}
/** "1 LED", "3 LEDs" (or with words: "three LEDs"). */
export function plural(n: number, word: string, opts: { words?: boolean; pluralForm?: string } = {}): string {
  const count = opts.words ? numberWord(n) : String(n);
  const form = n === 1 ? word : opts.pluralForm ?? (/(s|x|ch|sh)$/.test(word) ? `${word}es` : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`);
  return `${count} ${form}`;
}

/** Rough word count of a Markdown document, ignoring code blocks (exported for tests / UI). */
export function proseWordCount(md: string): number {
  return md.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

// ==================================================================== project analysis

interface Ctx {
  project: Project;
  board?: BoardDef;
  boardId?: string;
  features: FeatureInstance[];
  parts: Map<string, PartInstance>;
  main: string;
  settings: Record<string, number>;
  bom: BomLine[];
}

function analyze(project: Project): Ctx {
  const main = project.files?.['main.py'] ?? '';
  const settings: Record<string, number> = {};
  for (const m of main.matchAll(/^([A-Z_]+) = (-?[\d.]+)/gm)) settings[m[1]] = Number(m[2]);
  return {
    project,
    board: boardFor(project.board),
    boardId: boardPart(project)?.id,
    features: project.features ?? [],
    parts: new Map(project.parts.map((p) => [p.id, p])),
    main,
    settings,
    bom: buildBom(project),
  };
}

function safeDef(type: string): PartDef | undefined {
  try {
    return partDef(type);
  } catch {
    return undefined;
  }
}
const def = (p: PartInstance) => partDef(p.type);

const partLabel = (p: PartInstance) => p.label || safeDef(p.type)?.name || p.type;
/** "D1 Red LED" style (without repeating the ref when the label already starts with it). */
const partTag = (p: PartInstance) => {
  const label = partLabel(p);
  const ref = p.ref ?? p.id;
  return label.startsWith(ref) ? label : `${ref} ${label}`;
};

/** A feature's name for use mid-sentence: "Button A", "the red LED", "the IMU". */
function featureName(f: FeatureInstance, article = true): string {
  if (/^Button [A-Z]$/.test(f.label)) return f.label;
  let n = lowerFirst(f.label);
  if ((f.kind === 'led' || f.kind === 'rgb') && !/LED/.test(f.label)) n = `${n} LED`;
  return article ? `the ${n}` : n;
}

/** "an ESP32 DevKit V1 with a distance sensor, three LEDs and a buzzer" */
function designPhrase(c: Ctx): string {
  const counts = new Map<string, number>();
  for (const f of c.features) {
    if (f.kind === 'internet') continue;
    const n = f.kind === 'button' ? 'button' : f.kind === 'led' ? 'LED' : featureName(f, false);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const items = [...counts].map(([n, k]) => (k > 1 ? plural(k, n, { words: true }) : withArticle(n)));
  if (!c.board) return c.project.parts.some((p) => p.type === 'ne555') ? (analyze555(c.project)?.tone ? 'a classic 555 timer circuit that beeps a piezo buzzer while you hold a button, running from a 9 V battery with no microcontroller' : 'a classic 555 timer circuit that blinks an LED, running from a 9 V battery with no microcontroller') : 'a push button that switches an LED through a transistor, running from a 9 V battery with no microcontroller';
  const online = c.features.some((f) => f.kind === 'internet') ? `, connected to the internet over ${c.board.id === 'rpi4' ? 'its network' : 'Wi-Fi'}` : '';
  return `${withArticle(c.board.name)} with ${listJoin(items)}${online}`;
}

/** Board pin as printed on the board plus the physical header pin where that helps (Pi / Pico). */
function boardPinText(board: BoardDef, pin: string): string {
  const bp = boardPin(board, pin);
  const shown = pin.replace(/^(GND|3V3|5V)\.\d+$/, '$1');
  if (!bp) return shown;
  if (board.id === 'rpi4' || board.id === 'pico') return bp.physical ? `${shown} (pin ${bp.physical})` : shown;
  return bp.gpio !== undefined && shown !== `D${bp.gpio}` ? `${shown} (GPIO${bp.gpio})` : shown;
}
const fivePinName = (b: BoardDef) => (b.id === 'rpi4' ? 'a 5V header pin' : `the ${b.supply5v} pin`);

const PIN_HINT: Record<string, Record<string, string>> = {
  led: { A: 'long leg, +', C: 'short leg, −' },
  'rgb-led': { COM: 'longest leg' },
  electrolytic: { '+': 'long leg', '-': 'striped side' },
  buzzer: { '+': 'long leg' },
  servo: { GND: 'brown', 'V+': 'red', PWM: 'orange' },
  npn: { E: 'emitter', B: 'base', C: 'collector' },
};
const NE555_PINS: Record<string, number> = { GND: 1, TRIG: 2, OUT: 3, RESET: 4, CTRL: 5, THR: 6, DIS: 7, VCC: 8 };

/** Label for one end of a wire, used in the wiring table (exported so tests and UI can match rows). */
export function wireEndLabel(project: Project, ref: PinRef): string {
  const part = project.parts.find((p) => p.id === ref.part);
  if (!part) return `${ref.part}.${ref.pin}`;
  const board = boardFor(project.board);
  if (board && safeDef(part.type)?.category === 'board') return `${board.short} ${boardPinText(board, ref.pin)}`;
  const hint = PIN_HINT[part.type]?.[ref.pin];
  let pin = /^\d$/.test(ref.pin) ? `leg ${ref.pin}` : ref.pin;
  if (part.type === 'ne555') pin = `pin ${NE555_PINS[ref.pin]} (${ref.pin})`;
  else if (part.type === 'battery-9v') pin = ref.pin === '+' ? '+ (red lead)' : '− (black lead)';
  else if (hint) pin = `${pin} (${hint})`;
  return `${partTag(part)} · ${pin}`;
}

const COLOR_NAMES: [string, string][] = [
  ['#1f2328', 'black'], ['#000000', 'black'], ['#d32f2f', 'red'], ['#ef6c00', 'orange'], ['#1e88e5', 'blue'], ['#f9a825', 'yellow'],
  ['#2e7d32', 'green'], ['#8e24aa', 'purple'], ['#00838f', 'teal'], ['#c2185b', 'pink'], ['#6d4c41', 'brown'], ['#5c6bc0', 'indigo'],
  ['#7cb342', 'light green'], ['#546e7a', 'grey'], ['#ffffff', 'white'],
];
/** Nearest friendly colour name for a hex wire colour. */
export function colourName(hex?: string): string {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return 'any colour';
  const h = hex.startsWith('#') ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
  const rgb = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [r, g, b] = rgb(h);
  let best = 'any colour';
  let bd = Infinity;
  for (const [hx, name] of COLOR_NAMES) {
    const [r2, g2, b2] = rgb(hx);
    const d2 = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d2 < bd) {
      bd = d2;
      best = name;
    }
  }
  return best;
}

/** Board end last, so rows read "part pin → board pin". */
function orientWire(c: Ctx, w: Wire): [PinRef, PinRef] {
  if (w.a.part === c.boardId && w.b.part !== c.boardId) return [w.b, w.a];
  const bat = (r: PinRef) => c.parts.get(r.part)?.type === 'battery-9v';
  if (bat(w.a) && !bat(w.b) && w.a.pin === '-') return [w.b, w.a];
  return [w.a, w.b];
}

const SENSOR_KINDS: FeatureKind[] = ['dht22', 'ntc', 'mpu6050', 'hcsr04', 'pir', 'ldr', 'soil', 'pot', 'switch'];

function readingsPhrase(kinds: FeatureKind[]): string[] {
  const out: string[] = [];
  for (const k of kinds) {
    if (k === 'dht22') out.push('temperature', 'humidity');
    if (k === 'ntc' && !out.includes('temperature')) out.push('temperature');
    if (k === 'mpu6050') out.push('tilt', 'shake count');
    if (k === 'hcsr04') out.push('distance');
    if (k === 'pir') out.push('motion status');
    if (k === 'ldr') out.push('light level');
    if (k === 'soil') out.push('soil moisture');
    if (k === 'pot') out.push('knob position');
    if (k === 'switch') out.push('switch position');
  }
  return [...new Set(out)];
}

// ==================================================================== behaviour (derived from features + generated code)

interface Behaviour {
  feature?: FeatureInstance;
  /** Full sentence describing what happens. */
  does: string;
  /** How to check it on the real hardware. */
  test: string;
  /** How to try it in the Sparkbench simulator. */
  sim?: string;
}

function codeSection(main: string, name: string): string[] {
  const lines = main.split('\n');
  const start = lines.findIndex((l) => l.trim() === `# ---- ${name} ----`);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^# ---- .* ----$/.test(lines[i].trim())) break;
    out.push(lines[i]);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

function alarmPhrase(c: Ctx, label: string): string {
  const s = c.settings;
  switch (label) {
    case 'too hot':
      return `it gets hotter than ${s.TEMP_HIGH ?? 28} °C`;
    case 'tilted':
      return 'the board is tilted more than 30°';
    case 'object close':
      return `something is closer than ${s.NEAR_CM ?? 20} cm`;
    case 'motion':
      return 'motion is detected';
    case 'dark':
      return `the light level drops below ${s.DARK_PCT ?? 30} %`;
    case 'soil dry':
      return `the soil is drier than ${s.DRY_PCT ?? 30} %`;
    default:
      return label;
  }
}
function condPhrase(c: Ctx, cond: string): string {
  if (cond.includes('TEMP_HIGH')) return alarmPhrase(c, 'too hot');
  if (cond.includes('DARK_PCT')) return alarmPhrase(c, 'dark');
  if (cond.includes('DRY_PCT')) return alarmPhrase(c, 'soil dry');
  if (cond.includes('NEAR_CM')) return alarmPhrase(c, 'object close');
  if (cond.includes('abs(roll)')) return alarmPhrase(c, 'tilted');
  if (/motion/.test(cond)) return alarmPhrase(c, 'motion');
  return 'the alarm condition is met';
}
function ledAlarmTest(c: Ctx, label: string, led: string): string {
  const s = c.settings;
  switch (label) {
    case 'too hot':
      return `Warm the temperature sensor above ${s.TEMP_HIGH ?? 28} °C (hold it, or lower TEMP_HIGH in main.py to test): ${led} should switch on.`;
    case 'tilted':
      return `Tilt the board more than 30°: ${led} should switch on.`;
    case 'object close':
      return `Hold your hand closer than ${s.NEAR_CM ?? 20} cm to the distance sensor: ${led} should switch on.`;
    case 'motion':
      return `Wave at the motion sensor: ${led} should switch on.`;
    case 'dark':
      return `Cover the light sensor: ${led} should switch on.`;
    case 'soil dry':
      return `Pull the probe out of the soil: ${led} should switch on.`;
    default:
      return `${capFirst(led)} should switch on when ${label}.`;
  }
}

/** Button label → what it does, from the "# Button A: …" comments in the generated start-up section. */
function buttonActions(c: Ctx): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of codeSection(c.main, 'startup')) {
    const mm = /^# (.+?): (.+)$/.exec(l.trim());
    if (mm && c.features.some((f) => f.kind === 'button' && f.label === mm[1])) m.set(mm[1], mm[2]);
  }
  return m;
}
/** LED label → role description, from the "# Red LED: …" comments in the main loop. */
function ledRoles(c: Ctx): Map<string, string> {
  const m = new Map<string, string>();
  const lines = codeSection(c.main, 'main loop');
  lines.forEach((l, i) => {
    const mm = /^\s+# (.+?): (.+)$/.exec(l);
    if (mm && lines[i + 1]?.trim().startsWith('set_led(')) m.set(mm[1], mm[2]);
  });
  return m;
}

const SENSOR_DOES: Partial<Record<FeatureKind, string>> = {
  dht22: 'measures the air temperature and humidity every 2 seconds',
  ntc: 'measures the temperature',
  mpu6050: 'measures how the board is tilted (roll and pitch) and counts shakes',
  hcsr04: 'measures how far away the nearest object is, from about 2 cm up to 4 m',
  pir: 'watches for warm bodies (people, pets) moving in front of it',
  ldr: 'measures how bright it is, on a 0–100 % scale',
  soil: 'measures how wet the soil is, on a 0–100 % scale',
  pot: 'gives a reading from 0 to 100 % as you turn it',
  switch: 'is read as either on or off',
};

function sensorTest(f: FeatureInstance): { test: string; sim?: string } {
  switch (f.kind) {
    case 'dht22':
      return { test: 'Hold the temperature sensor between your fingers or breathe on it gently: within a few seconds the temperature and humidity should rise (it\'s read every 2 seconds).', sim: 'Drag the **Temperature** and **Humidity** sliders on the DHT22.' };
    case 'ntc':
      return { test: 'Pinch the thermistor between your fingers: the temperature should climb a few degrees.', sim: 'Drag the **Temperature** slider on the thermistor.' };
    case 'mpu6050':
      return { test: 'Tilt the breadboard left/right and forward/back: roll and pitch should follow. Give it a quick shake and the shake counter goes up.', sim: 'Use the **Tilt X**, **Tilt Y** and **Shake** controls on the IMU.' };
    case 'hcsr04':
      return { test: 'Point the distance sensor at the ceiling, then hold your hand 10, 20 and 50 cm in front of it: the distance in the serial console should follow.', sim: 'Drag the **Distance** slider on the HC-SR04.' };
    case 'pir':
      return { test: 'Leave the PIR alone for about a minute after power-up (it calibrates itself), then wave your hand in front of it: "Motion YES" appears for a few seconds.', sim: 'Press the **Motion** button on the PIR sensor.' };
    case 'ldr':
      return { test: 'Cover the light sensor with your hand: the light percentage should drop. Shine a phone torch on it and it rises.', sim: 'Drag the **Light** slider on the photoresistor.' };
    case 'soil':
      return { test: 'Hold the probe in the air (dry, close to 0 %), then push it into damp soil or a glass of water up to the line (towards 100 %).', sim: 'Drag the **Soil moisture** slider on the probe.' };
    case 'pot':
      return { test: 'Turn the knob from one end to the other: its reading should sweep from 0 % to 100 %.', sim: 'Drag the **Knob** slider on the potentiometer.' };
    case 'switch':
      return { test: 'Slide the switch both ways: the serial console should show "Switch ON" and "Switch off".', sim: 'Click the slide switch to flip it.' };
    default:
      return { test: '' };
  }
}

const BUTTON_ACTION: [RegExp, string, string][] = [
  // [code description, "Pressing X …", "it should …"]
  [/^show the next screen$/, 'shows the next screen', 'show the next screen'],
  [/^arm \/ disarm the alarm$/, 'arms or disarms the alarm (with a high or low beep to tell you which)', 'arm or disarm the alarm with a beep'],
  [/^reset the shake counter$/, 'resets the shake counter', 'reset the shake counter to 0'],
  [/^beep$/, 'makes a short beep', 'beep'],
  [/^print a message$/, 'prints "button pressed" to the serial console', 'print "button pressed" in the serial console'],
];

function behaviours(c: Ctx): Behaviour[] {
  if (c.project.board === 'none') return behavioursDiscrete(c);
  if (c.project.behavior?.length) {
    // Code written by the AI (or a curated example) describes itself.
    return c.project.behavior.map((b) => ({ does: b.does, test: b.test ?? `Check that: ${b.does.charAt(0).toLowerCase()}${b.does.slice(1)}`, sim: b.sim }));
  }
  const out: Behaviour[] = [];
  const fs = c.features;
  const main = c.main;
  const custom = !!c.project.codeCustom || !main;
  const actions = buttonActions(c);
  const roles = ledRoles(c);
  const sensors = fs.filter((f) => SENSOR_KINDS.includes(f.kind));
  const readings = readingsPhrase(sensors.map((f) => f.kind));
  const pages = Number(/PAGES = (\d+)/.exec(main)?.[1] ?? 1);
  const flipButton = [...actions].find(([, d]) => d === 'show the next screen')?.[0];
  const toggledBy = (what: string) => [...actions].find(([, d]) => d.toLowerCase() === `toggle the ${what}`.toLowerCase())?.[0];

  if (/starting(…|\.\.\.)/.test(main)) {
    out.push({
      does: `When it powers up, it prints "${c.project.name} starting…" to the serial console${main.includes('little start-up chirp') ? ' and plays a little three-note chirp' : ''}.`,
      test: `Open the serial console (${c.board?.id === 'rpi4' ? 'the terminal where you ran `python3 main.py`' : '`mpremote repl`'}) and restart the program: you should see "${c.project.name} starting…".`,
    });
  }
  for (const f of fs.filter((x) => x.kind === 'oled' || x.kind === 'lcd')) {
    const what = readings.length ? `the live ${listJoin(readings)}` : 'a greeting';
    const level = f.kind === 'oled' && fs.some((x) => x.kind === 'mpu6050') && main.includes('bubble level');
    let flip = '';
    if (pages > 1) flip = flipButton ? ` Press ${flipButton} to switch between its ${numberWord(pages)} screens.` : ` It switches between ${numberWord(pages)} screens on its own every 3 seconds.`;
    out.push({
      feature: f,
      does: `${capFirst(featureName(f))} shows the project name and ${what}${level ? ', plus a bubble level whose dot moves as you tilt the board' : ''}.${flip}`,
      test: `${capFirst(featureName(f))} should show "Starting..." for a moment and then ${what}${pages > 1 ? `; ${flipButton ? `press ${flipButton}` : 'wait 3 seconds'} to see the next screen` : ''}.`,
    });
  }
  for (const f of sensors) {
    const t = sensorTest(f);
    out.push({ feature: f, does: `${capFirst(featureName(f))} ${SENSOR_DOES[f.kind]}.`, test: t.test, sim: t.sim });
  }
  for (const f of fs.filter((x) => x.kind === 'button')) {
    const a = custom ? undefined : actions.get(f.label);
    let does = `${capFirst(featureName(f))} is read by the program.`;
    let test = `Press ${featureName(f)}: the program should notice it.`;
    if (a) {
      const known = BUTTON_ACTION.find(([re]) => re.test(a));
      const toggled = /^toggle the (.+)$/.exec(a)?.[1];
      const doesTxt = known ? known[1] : toggled ? `switches the ${lowerFirst(toggled)} on and off` : a;
      const testTxt = known ? known[2] : toggled ? `switch the ${lowerFirst(toggled)} on, and off again on the next press` : a;
      does = `Pressing ${featureName(f)} ${doesTxt}.`;
      test = `Press ${featureName(f)}: it should ${testTxt}${main.includes('beep(2500, 15)') ? ' (with a tiny click from the buzzer)' : ''}.`;
    }
    out.push({ feature: f, does, test, sim: `Click **${f.label}** on the breadboard.` });
  }
  // LEDs
  const leds = fs.filter((x) => x.kind === 'led');
  const isTraffic = leds.length === 3 && leds.every((l) => /traffic|amber|green for/.test(roles.get(l.label) ?? ''));
  if (isTraffic) {
    out.push({ feature: leds[0], does: 'The three LEDs run a traffic-light cycle: red for 4 seconds, amber for 1 second, green for 4 seconds, amber again, and round it goes.', test: 'Watch the LEDs for 10 seconds: red → amber → green → amber, with only one LED on at a time.', sim: 'Just press ▶ Run and watch the lights change.' });
  } else {
    const heartbeat: FeatureInstance[] = [];
    for (const f of leds) {
      const role = roles.get(f.label) ?? '';
      const name = featureName(f);
      if (role.startsWith('on when ')) {
        out.push({ feature: f, does: `${capFirst(name)} lights up when ${alarmPhrase(c, role.slice(8))}.`, test: ledAlarmTest(c, role.slice(8), name) });
      } else if (role.startsWith('toggled')) {
        const btn = toggledBy(f.label);
        out.push({ feature: f, does: `${capFirst(name)} turns on and off each time you press ${btn ?? 'its button'}.`, test: `Press ${btn ?? 'the button'} twice: ${name} should come on, then go off.` });
      } else if (role.startsWith('brightness follows')) {
        out.push({ feature: f, does: `${capFirst(name)} gets brighter as you turn the knob up.`, test: `Turn the knob slowly: ${name} should fade smoothly from off to full brightness.` });
      } else if (role.startsWith('night light')) {
        out.push({ feature: f, does: `${capFirst(name)} glows brighter the darker it gets.`, test: `Cover the light sensor: ${name} should fade up. Uncover it and it fades out.` });
      } else heartbeat.push(f);
    }
    if (heartbeat.length) {
      const names = listJoin(heartbeat.map((f) => featureName(f)));
      const many = heartbeat.length > 1;
      out.push({ feature: heartbeat[0], does: `${capFirst(names)} ${many ? 'blink' : 'blinks'} steadily to show the program is running.`, test: `${capFirst(names)} should blink about once a second.` });
    }
  }
  const buzzer = fs.find((x) => x.kind === 'buzzer');
  if (buzzer) {
    let does = 'The buzzer beeps to give feedback.';
    let test = 'You should hear a short chirp when the program starts.';
    let sim: string | undefined;
    if (main.includes('# siren')) {
      does = 'The buzzer sounds a two-tone siren when motion is detected while the alarm is armed.';
      test = 'Wave at the motion sensor: the siren should wail until the motion stops.';
      sim = 'Press **Motion** on the PIR and listen for the siren.';
    } else if (main.includes('parking sensor: beep faster')) {
      does = 'The buzzer starts beeping when something is within 1 m, and beeps faster and faster as it gets closer — just like a car parking sensor.';
      test = 'Move your hand slowly towards the distance sensor from about 1 m away: the beeps should speed up as you get closer.';
      sim = 'Slide the distance below 100 cm and keep going: the beeps speed up.';
    } else {
      const m = /if (.+?) and frame % 40 == 0:\s+# warning beep/.exec(main);
      if (m) {
        does = `The buzzer gives a warning beep every 2 seconds while ${condPhrase(c, m[1])}.`;
        test = `Make that happen (${condPhrase(c, m[1])}) and listen for a beep every 2 seconds.`;
      } else if (/if shaking:\s+beep/.test(main)) {
        does = 'The buzzer chirps while you shake the board.';
        test = 'Shake the breadboard gently: you should hear chirps.';
      }
    }
    out.push({ feature: buzzer, does, test, sim });
  }
  const servo = fs.find((x) => x.kind === 'servo');
  if (servo) {
    const m = /set_angle\(scale\(([\w.]+), (-?[\d.]+), (-?[\d.]+), 0, 180\)\)\s+# (\w+) → angle/.exec(main);
    let does = 'The servo sweeps smoothly back and forth.';
    let test = 'The servo arm should sweep from side to side every few seconds.';
    if (m) {
      const label = m[4];
      if (label === 'knob') {
        does = 'The servo follows the knob: turn the knob and the servo arm turns with it, from 0° to 180°.';
        test = 'Turn the knob from end to end: the servo arm should follow, covering half a circle.';
      } else {
        const unit = label === 'temperature' ? ' °C' : label === 'distance' ? ' cm' : label === 'tilt' ? '°' : ' %';
        does = `The servo works like a gauge needle for the ${label}: ${m[2]}${unit} points it to 0° and ${m[3]}${unit} to 180°.`;
        test = `Change the ${label} and watch the servo arm swing to match.`;
      }
    }
    out.push({ feature: servo, does, test });
  }
  const relay = fs.find((x) => x.kind === 'relay');
  if (relay) {
    const s = c.settings;
    let does: string;
    if (main.includes('# water the plant')) does = `The relay switches the pump on when the soil is drier than ${s.DRY_PCT ?? 30} % and off again once it's wetter than ${s.WET_PCT ?? 60} %.`;
    else if (main.includes("turn the fan on when it's hot")) does = `The relay switches the fan on when it's hotter than ${s.TEMP_HIGH ?? 28} °C.`;
    else if (main.includes('light on while there is motion')) does = 'The relay switches the light on while there is motion.';
    else if (main.includes("lamp on when it's dark")) does = 'The relay switches the lamp on when it gets dark.';
    else {
      const btn = toggledBy(relay.label);
      does = btn ? `The relay turns on and off each time you press ${btn}.` : 'The relay is ready for you to switch from the code (it starts off).';
    }
    out.push({ feature: relay, does, test: `Check the relay: ${lowerFirst(does.replace(/^The relay /, 'it '))} You'll hear a click and its little LED lights when it switches on.` });
  }
  const colour = fs.find((x) => x.kind === 'neopixel' || x.kind === 'rgb');
  if (colour) {
    const m = /hue = scale\([^#]+# (\w+): blue/.exec(main);
    const name = featureName(colour);
    out.push({
      feature: colour,
      does: m ? `${capFirst(name)} changes colour with the ${m[1]}: blue when it's low, through green, to red when it's high.` : `${capFirst(name)} cycles smoothly through all the colours of the rainbow.`,
      test: m ? `Change the ${m[1]} and watch the colour shift between blue and red.` : 'You should see a smooth, endless rainbow.',
    });
  }
  if (/log once a second/.test(main)) out.push({ does: 'Once a second it prints the current readings to the serial console, so you can see exactly what the board sees.', test: 'Keep the serial console open: a new line should appear every second.' });
  return out;
}

// ---------------------------------------------------------------- discrete circuits (no microcontroller)

interface Astable {
  r1: number;
  r2: number;
  c: number;
  rLed?: number;
  v: number;
  f: number;
  tHigh: number;
  tLow: number;
  /** Output drives a buzzer (tone generator) rather than an LED (blinker). */
  tone: boolean;
}

/** Find R1 (VCC–DIS), R2 (DIS–THR) and the timing capacitor (THR–GND) of a 555 astable. */
export function analyze555(project: Project): Astable | undefined {
  const u = project.parts.find((p) => p.type === 'ne555');
  if (!u) return undefined;
  const { netOf } = buildNets(project);
  const n = (part: string, pin: string) => netOf.get(pinKey({ part, pin }))?.id;
  const vcc = n(u.id, 'VCC');
  const dis = n(u.id, 'DIS');
  const thr = n(u.id, 'THR');
  const gnd = n(u.id, 'GND');
  const out = n(u.id, 'OUT');
  const res = project.parts.filter((p) => p.type === 'resistor');
  const between = (a?: string, b?: string) =>
    res.find((r) => {
      const x = n(r.id, '1');
      const y = n(r.id, '2');
      return (x === a && y === b) || (x === b && y === a);
    });
  const R1 = between(vcc, dis);
  const R2 = between(dis, thr);
  const C = project.parts.find((p) => {
    if (p.type !== 'electrolytic' && p.type !== 'capacitor') return false;
    const [a, b] = p.type === 'electrolytic' ? ['+', '-'] : ['1', '2'];
    return [n(p.id, a), n(p.id, b)].sort().join() === [thr, gnd].sort().join();
  });
  if (!R1 || !R2 || !C) return undefined;
  const r1 = Number(R1.props.ohms);
  const r2 = Number(R2.props.ohms);
  const cap = Number(C.props.farads);
  const rl = res.find((r) => n(r.id, '1') === out || n(r.id, '2') === out);
  const bat = project.parts.find((p) => p.type === 'battery-9v');
  const tone = project.parts.some((p) => p.type === 'buzzer' && n(p.id, '+') === out);
  return { tone, r1, r2, c: cap, rLed: rl ? Number(rl.props.ohms) : undefined, v: Number(bat?.props.volts ?? 9), f: 1.44 / ((r1 + 2 * r2) * cap), tHigh: 0.693 * (r1 + r2) * cap, tLow: 0.693 * r2 * cap };
}

const fmtHz = (f: number) => (f >= 100 ? `${Math.round(f)} Hz` : f >= 10 ? `${f.toFixed(1)} Hz` : `${f.toFixed(2)} Hz`);
const fmtS = (t: number) => (t >= 1 ? `${t.toFixed(2)} s` : `${Math.round(t * 1000)} ms`);
const ohm = (o: number) => `${formatOhms(o)}Ω`;

function transistorValues(project: Project) {
  const q = project.parts.find((p) => p.type === 'npn');
  if (!q) return undefined;
  const { netOf } = buildNets(project);
  const n = (part: string, pin: string) => netOf.get(pinKey({ part, pin }))?.id;
  const res = project.parts.filter((p) => p.type === 'resistor');
  const rb = res.find((r) => n(r.id, '1') === n(q.id, 'B') || n(r.id, '2') === n(q.id, 'B'));
  const rl = res.find((r) => r !== rb);
  const bat = project.parts.find((p) => p.type === 'battery-9v');
  const v = Number(bat?.props.volts ?? 9);
  const led = project.parts.find((p) => p.type === 'led');
  const vf = led && /blue|white/.test(String(led.props.color)) ? 3 : 2;
  const rbv = rb ? Number(rb.props.ohms) : 10000;
  const rlv = rl ? Number(rl.props.ohms) : 470;
  return { v, rb: rbv, rl: rlv, ib: ((v - 0.7) / rbv) * 1000, ic: ((v - vf - 0.2) / rlv) * 1000 };
}

function behavioursDiscrete(c: Ctx): Behaviour[] {
  const a = analyze555(c.project);
  if (a?.tone)
    return [
      { does: `Hold the button and the buzzer sounds a steady tone of about ${fmtHz(a.f)}; let go and it stops.`, test: 'Clip on the battery (it stays quiet), then hold the button: you should hear a clear mid-pitched beep.', sim: 'Turn Sound on, press ▶ Run and hold the button on the breadboard; the buzzer shows the frequency.' },
      { does: 'There is no program: the pitch comes entirely from the two timing resistors and the capacitor.', test: `Swap the ${ohm(a.r2)} resistor for a bigger one: the pitch drops.`, sim: `Change R2 in the properties panel and run again to hear the pitch change.` },
    ];
  if (a) {
    const smaller = ohm(Math.max(1000, Math.round(a.r2 / 2000) * 1000));
    return [
      { does: `The LED blinks by itself about ${a.f >= 1 ? `${a.f.toFixed(1)} times a second` : `once every ${fmtS(1 / a.f)}`} — on for about ${fmtS(a.tHigh)}, off for about ${fmtS(a.tLow)}.`, test: `Clip on the battery: the LED should start blinking straight away, roughly ${a.f >= 1 ? `${Math.round(a.f * 10)} times in 10 seconds` : `once every ${fmtS(1 / a.f)}`}.`, sim: 'Press ▶ Run and watch the LED blink; the solver runs the real 555 circuit, capacitor and all.' },
      { does: 'There is no program: the timing comes entirely from the two resistors and the capacitor.', test: `Swap the ${ohm(a.r2)} resistor for a smaller one (say ${smaller}): the LED should blink noticeably faster.`, sim: `Change R2 from ${ohm(a.r2)} to ${smaller} in the properties panel and simulate again — it blinks faster.` },
    ];
  }
  const t = transistorValues(c.project);
  return [
    { does: 'Press the button and the LED lights; let go and it goes out. The button only carries a tiny current — the transistor does the heavy lifting.', test: 'Clip on the battery and press the button: the LED should light at full brightness and go out as soon as you let go.', sim: 'Press ▶ Run, then click the button and watch the LED current appear.' },
    ...(t ? [{ does: `About ${t.ib.toFixed(1)} mA flows into the transistor's base, which lets about ${Math.round(t.ic)} mA flow through the LED.`, test: `If you have a multimeter, measure the LED current: it should be roughly ${Math.round(t.ic)} mA.` }] : []),
  ];
}

// ==================================================================== troubleshooting knowledge

const TROUBLE: Record<string, string[]> = {
  ssd1306: [
    '**OLED stays blank:** check VCC and GND aren\'t swapped (some modules print them in a different order), and that SDA and SCL go to the right pins. Type `i2c.scan()` in the REPL — it should list `[60]` (that\'s 0x3C).',
    '**`OSError: [Errno 19] ENODEV`:** the board can\'t see the display at all. Re-seat the four wires; a loose GND is the usual culprit.',
  ],
  lcd1602: [
    '**Backlight on but no text (or a row of blocks):** turn the small blue contrast screw on the backpack slowly with a screwdriver.',
    '**Nothing on the I2C bus:** some backpacks use address 0x3F instead of 0x27. Run an I2C scan and change the address in main.py if needed.',
  ],
  mpu6050: ['**IMU errors or all-zero readings:** an I2C scan should show 104 (0x68). If not, check VCC/GND and the SDA/SCL wires — the IMU shares them with any display.'],
  dht22: [
    '**"DHT22 read failed" now and then:** that\'s normal — the sensor is slow and the code simply tries again on its next reading.',
    '**It fails every time:** check the DATA wire, and if you have a bare 4-pin sensor (not on a little board) add a 10 kΩ resistor between DATA and VCC.',
  ],
  ntc: ['**Temperature reads nan or a crazy value:** the thermistor and its 10 kΩ partner must form a divider: thermistor from 3.3 V to the analog pin, resistor from the analog pin to GND.'],
  hcsr04: [
    '**Distance stuck at 0 or jumping around:** the HC-SR04 needs 5 V on VCC. Check TRIG and ECHO aren\'t swapped and that both divider resistors are in place.',
    '**Odd readings:** soft things (curtains, jumpers) absorb sound; test against a flat, hard surface first.',
  ],
  pir: ['**Motion detected all the time:** the PIR needs about a minute to settle after power-up. The two orange screws set sensitivity and how long the output stays on.'],
  ldr: ['**Light level always 0 % or 100 %:** check the 10 kΩ resistor completes the divider (one leg on the analog pin, the other on GND). The photoresistor itself can go either way round.'],
  soil: ['**Moisture never changes:** every probe is a little different — adjust the 2.8 V (dry) and 1.2 V (wet) numbers in `read_…_pct()` to match yours. Don\'t push the probe in deeper than the line.'],
  potentiometer: ['**Knob only works over half its turn, or jumps:** the middle leg must go to the analog pin and the two outer legs to 3.3 V and GND.'],
  pushbutton: ['**Button always (or never) pressed:** rotate it 90°. The legs on each side are already connected inside, so it must straddle the breadboard\'s centre gap.'],
  'slide-switch': ['**Switch does nothing:** the middle pin is the common one and must go to the board pin; one outer pin goes to GND.'],
  led: ['**LED doesn\'t light:** turn it round (long leg towards the resistor), make sure the resistor and LED legs share a breadboard row, and check the wire is on the right pin.'],
  'rgb-led': ['**Wrong colours or nothing at all:** you might have a common-anode RGB LED. Those need COM on 3.3 V instead of GND, and the colours are inverted.'],
  'neopixel-ring': [
    '**NeoPixels stay dark:** the data wire must go into **DIN** (data in), not DOUT. Check 5 V and GND too.',
    '**Flicker or the board resets:** too much current at once. Keep the brightness low or power the ring from a separate 5 V supply (GNDs joined).',
  ],
  buzzer: ['**Buzzer silent:** check the + leg goes to the board pin. A passive buzzer needs a changing signal (PWM); if you bought an *active* buzzer it will only make one tone.'],
  servo: [
    '**Servo jitters, or the board resets when it moves:** a servo grabs big bursts of current. Add a 470 µF capacitor across its 5 V and GND, or give it its own 5 V supply (with GNDs joined).',
    '**Servo doesn\'t move:** check the red wire gets 5 V and the orange (signal) wire goes to the right pin.',
  ],
  relay: [
    '**Relay LED lights but no click:** the relay coil needs 5 V on VCC — 3.3 V isn\'t enough.',
    '**Clicks but the load doesn\'t switch:** the load must be wired through the COM and NO (normally open) screw terminals.',
  ],
  mcp3008: ['**Analog readings always 0:** enable SPI (`sudo raspi-config` → Interface Options → SPI), check the chip\'s notch orientation, and recheck the four SPI wires.'],
  ne555: ['**LED stays on or off:** check the chip is the right way round (notch/dot = pin 1), that pin 4 (RESET) goes to + and that the timing capacitor\'s stripe faces GND.'],
  npn: ['**LED never lights:** check the transistor\'s legs. With the flat side facing you: E – B – C for a PN2222A (metal-can 2N2222s differ).'],
  electrolytic: ['**Capacitor gets warm:** it\'s in backwards — the striped (−) leg goes to GND. Replace it, as a reversed electrolytic can be damaged.'],
  'battery-9v': ['**Nothing happens at all:** check the battery (a half-dead 9 V battery can look fine but sag under load) and that the snap is pushed on firmly.'],
};

const BOARD_TROUBLE: Record<string, string[]> = {
  esp32: [
    '**Board not detected by your computer:** use a USB *data* cable, and install the USB driver for the chip on your board (CP210x or CH340). If uploading stalls on "Connecting…", hold the BOOT button until it starts.',
    '**`ImportError: no module named …`:** a driver file wasn\'t copied. Copy every `.py` file from the project, not just main.py.',
  ],
  pico: [
    '**No RPI-RP2 drive appears:** hold the BOOTSEL button *before* plugging in the USB cable, and only let go once the drive shows up.',
    '**`ImportError: no module named …`:** a driver file wasn\'t copied. Copy every `.py` file from the project, not just main.py.',
  ],
  rpi4: [
    '**`ModuleNotFoundError`:** install the missing library (see the "Load the program" steps) and run with `python3`, not `python`.',
    '**`Permission denied` or "No such file" for /dev/i2c-1:** enable I2C in `sudo raspi-config` and reboot.',
  ],
};

// ==================================================================== explanations of supporting parts

function ledCurrentMa(volts: number, ohms: number, color: string): number {
  const vf = /blue|white/.test(color) ? 2.9 : /green/.test(color) ? 2.2 : 2.0;
  return Math.max(0, ((volts - vf) / ohms) * 1000);
}

/** Plain-English "why" for a feature's wiring (resistors, pull-ups, 5 V, shared bus…). */
function featureWhy(c: Ctx, f: FeatureInstance): string[] {
  const b = c.board;
  const parts = f.parts.map((id) => c.parts.get(id)).filter((p): p is PartInstance => !!p);
  const res = parts.filter((p) => p.type === 'resistor');
  const pinT = (sig: string) => (b && f.pins[sig] ? boardPinText(b, f.pins[sig]) : '');
  const analogTo = () => (f.mcpChannel !== undefined ? `channel ${f.mcpChannel} of the MCP3008` : `analog pin ${pinT('pin')}`);
  const out: string[] = [];
  switch (f.kind) {
    case 'oled':
    case 'lcd':
    case 'mpu6050': {
      const others = c.features.filter((x) => x !== f && ['oled', 'lcd', 'mpu6050'].includes(x.kind));
      out.push(`It talks over **I2C**: two signal wires, SDA (data) to ${pinT('sda')} and SCL (clock) to ${pinT('scl')}. ${others.length ? `${capFirst(listJoin(others.map((x) => featureName(x))))} ${others.length === 1 ? 'shares' : 'share'} the very same two wires — every I2C part has its own address (like a house number), so they don't get mixed up.` : 'More I2C parts can share these same two wires later.'}`);
      if (f.kind === 'lcd') out.push(`It runs on 5 V, so its VCC goes to ${b ? fivePinName(b) : 'the 5 V pin'}.`);
      break;
    }
    case 'button':
      out.push(`One leg goes to ${pinT('pin')}, the other to GND. The code switches on the pin's built-in *pull-up* resistor, so the pin reads 1 normally and 0 while you press the button — no extra resistor needed.`);
      break;
    case 'switch':
      out.push(`The middle pin goes to ${pinT('pin')} and one side to GND; like a button, it uses the pin's built-in pull-up.`);
      break;
    case 'led': {
      const r = res[0];
      if (r) {
        const ma = ledCurrentMa(b?.logicV ?? 3.3, Number(r.props.ohms), String(f.props?.color ?? 'red'));
        out.push(`The ${ohm(Number(r.props.ohms))} resistor limits the current to about ${ma < 1 ? ma.toFixed(1) : Math.round(ma)} mA. Without it the LED would try to draw far too much and could burn out — or damage the pin.`);
      }
      break;
    }
    case 'rgb':
      out.push('Each colour inside the LED gets its own pin and its own resistor, so the code can mix any colour by dimming red, green and blue separately. The longest leg (COM) goes to GND.');
      break;
    case 'pot':
      out.push(`The two outer legs go to 3.3 V and GND and the middle leg (the wiper) to ${analogTo()}. Turning the knob slides the wiper between 0 V and 3.3 V, and the board measures that voltage.`);
      break;
    case 'ldr':
    case 'ntc': {
      const r = res[0];
      out.push(`The ${f.kind === 'ldr' ? 'photoresistor' : 'thermistor'} and a ${r ? ohm(Number(r.props.ohms)) : '10kΩ'} resistor form a *voltage divider*: as its resistance changes with ${f.kind === 'ldr' ? 'light' : 'temperature'}, the voltage in the middle changes too, and ${analogTo()} measures it.`);
      break;
    }
    case 'soil':
      out.push(`Its analog output goes to ${analogTo()}: about 2.8 V when dry, falling to about 1.2 V when wet.`);
      break;
    case 'dht22':
      out.push(`Its DATA pin goes to ${pinT('pin')}. The sensor sends its readings as a burst of short pulses on that one wire.`);
      break;
    case 'hcsr04':
      out.push(`TRIG goes to ${pinT('trig')} (the board says "chirp now") and ECHO comes back to ${pinT('echo')} (the sensor says "heard it").`, 'It runs on 5 V and its ECHO answer is 5 V too — too much for a 3.3 V pin. The 1 kΩ and 2 kΩ resistors form a *voltage divider* that scales it down to about 3.3 V.');
      break;
    case 'pir':
      out.push(`It runs on 5 V; its OUT pin gives a safe 3.3 V signal to ${pinT('pin')} when it sees movement.`);
      break;
    case 'neopixel':
      out.push(`It runs on 5 V. The data signal from ${pinT('pin')} goes through a small 330 Ω resistor into DIN, which protects the first LED from spikes on the wire.`);
      break;
    case 'buzzer':
      out.push(`The + leg goes to ${pinT('pin')} and the other leg to GND. The board switches the pin on and off thousands of times a second (PWM) to make a tone.`);
      break;
    case 'servo':
      out.push(`Servos need 5 V, so the red wire goes to ${b ? fivePinName(b) : 'the 5 V pin'}; the orange signal wire goes to ${pinT('pin')}, which sends a pulse 50 times a second — the length of the pulse sets the angle.`);
      break;
    case 'relay':
      out.push(`The relay module runs on 5 V; its IN pin goes to ${pinT('pin')}. The module has its own transistor and protection diode, so the board pin only has to supply a tiny signal.`);
      break;
  }
  return out;
}

// ==================================================================== build guide

function boardPlacement(c: Ctx): string {
  switch (c.project.board) {
    case 'esp32':
      return 'Push the ESP32 DevKit into the breadboard so it straddles the centre gap, with the USB socket hanging off one end. It\'s wide, so it only leaves one free row on each side — that\'s why a full-size breadboard (or two half-size ones side by side) is listed. Press gently and evenly; the pins bend easily.';
    case 'pico':
      return 'Push the Pico into the breadboard so it straddles the centre gap, with the USB socket at the end. Pin 1 (GP0) is the corner pin next to the USB socket; pin numbers run down the left side (1–20) and back up the right side (21–40).';
    case 'rpi4':
      return 'The Raspberry Pi stays off the breadboard. Use female-to-male jumper wires from its 40-pin header to the breadboard. Pin 1 is the corner pin nearest the SD card slot (it has a square pad underneath); odd pins are on the inner row, even pins on the outer edge. Do all the wiring with the Pi switched off.';
    default:
      return 'There\'s no microcontroller in this project — just a handful of parts and a battery. Leave the battery unclipped until the very last step. You\'ll use the breadboard\'s long edge rails for power: the red (+) rail for the battery\'s + and the blue (−) rail for its −.';
  }
}

function powerStep(c: Ctx): string[] {
  const b = c.board;
  if (!b || !c.boardId) return [];
  const wires = c.project.wires;
  const base = (p: string) => p.replace(/\.\d+$/, '');
  const touches = (name: string) => wires.some((w) => (w.a.part === c.boardId && base(w.a.pin) === base(name)) || (w.b.part === c.boardId && base(w.b.pin) === base(name)));
  const uses3 = touches(b.supply3v3);
  const uses5 = touches(b.supply5v);
  const lines: string[] = [];
  lines.push('Breadboards have long *power rails* along each edge, marked red (+) and blue (−). Every hole in a rail is connected, which makes it easy to give lots of parts power and ground.', '');
  lines.push(`- Run a **black** wire from ${b.short} **${boardPinText(b, b.gnd)}** to a blue (−) rail. This is your ground (GND).`);
  if (uses3) lines.push(`- Run a **red** wire from ${b.short} **${boardPinText(b, b.supply3v3)}** to the red (+) rail on the same side. This is your 3.3 V rail.`);
  if (uses5) lines.push(`- ${uses3 ? 'On the *other* side of the breadboard, run' : 'Run'} an **orange** wire from ${b.short} **${boardPinText(b, b.supply5v)}** to ${uses3 ? 'that side\'s' : 'the'} red (+) rail${uses3 ? ', and a black wire from GND to its blue (−) rail' : ''}. This is your 5 V rail.${uses3 ? ' Put a sticky note on it: never join the 3.3 V and 5 V rails!' : ''}`);
  const names = [`${b.short} GND`, uses3 ? base(b.supply3v3) : '', uses5 ? base(b.supply5v) : ''].filter(Boolean);
  lines.push('', `In the wiring table, any wire that goes to ${listJoin(names, 'or')} can plug into the matching rail instead of the board pin — it's the same connection, just tidier.`);
  return lines;
}

interface Step {
  title: string;
  parts: PartInstance[];
  body: string[];
  wires: Wire[];
}

function assemblySteps(c: Ctx): Step[] {
  const project = c.project;
  const steps: Step[] = [];
  const stepOf = new Map<string, number>();
  const notedTypes = new Set<string>();
  const notesFor = (ps: PartInstance[]) => {
    const out: string[] = [];
    for (const p of ps) {
      if (notedTypes.has(p.type)) continue;
      notedTypes.add(p.type);
      for (const n of safeDef(p.type)?.buildNotes ?? []) out.push(`> **Tip:** ${n}`);
    }
    return out;
  };
  const addStep = (title: string, ps: PartInstance[], body: string[]) => {
    const i = steps.length;
    for (const p of ps) if (!stepOf.has(p.id)) stepOf.set(p.id, i);
    steps.push({ title, parts: ps, body: [...body, ...notesFor(ps)], wires: [] });
  };
  if (project.board === 'none') {
    const order = [...project.parts].sort((a, b) => (a.type === 'battery-9v' ? 1 : 0) - (b.type === 'battery-9v' ? 1 : 0));
    for (const p of order) {
      const d = safeDef(p.type);
      const v = partValue(p);
      const body: string[] = [];
      if (p.type === 'ne555') body.push('Place the 555 chip across the centre gap of the breadboard with the notch (or dot) on the left. Pin 1 is then bottom-left; the pins count anticlockwise, so pin 8 is top-left.');
      else if (p.type === 'battery-9v') body.push('Last of all, connect the battery snap: red lead to the + rail, black lead to the − rail. Then clip on the battery and watch it come to life.');
      else if (d) body.push(DISCRETE_INTRO[p.type] ?? d.eli5);
      if (p.type === 'electrolytic') body.push('Mind the polarity: the stripe on the side marks the − leg.');
      const label = partLabel(p);
      addStep(p.type === 'battery-9v' ? 'Connect the battery' : `Add ${label.startsWith(p.ref ?? '#') ? label : `${p.ref} (${label})`}${v && !label.includes(v) ? `, ${v}` : ''}`, [p], body);
    }
  } else {
    // Parts that aren't part of any feature (e.g. the MCP3008 ADC on the Raspberry Pi) go first.
    const inFeature = new Set(c.features.flatMap((f) => f.parts));
    const extras = project.parts.filter((p) => p.id !== c.boardId && !inFeature.has(p.id));
    for (const p of extras) {
      const d = safeDef(p.type);
      const body = [d ? `**What it is:** ${d.eli5}` : ''];
      if (p.type === 'mcp3008') body.push('Place it across the centre gap with the notch at the top. Pins 1–8 (CH0–CH7, the analog inputs) run down the left side; the power and SPI pins are on the right. SPI is a fast four-wire link: clock (CLK), data in (DIN), data out (DOUT) and chip-select (CS).');
      addStep(`Add the ${partLabel(p)}`, [p], body.filter(Boolean));
    }
    for (const f of c.features) {
      if (f.kind === 'internet') continue; // no parts to place; Wi-Fi details are set in the program
      const ps = f.parts.map((id) => c.parts.get(id)).filter((p): p is PartInstance => !!p);
      const main = ps[0];
      const d = main ? safeDef(main.type) : undefined;
      const supporting = ps.slice(1).map((p) => `${p.ref} (${partValue(p) || partLabel(p)} ${p.type === 'resistor' ? 'resistor' : ''})`.replace(/ \)/, ')'));
      const body = [d ? `**What it is:** ${d.eli5}` : '', ...(supporting.length ? [`For this step you'll also need ${listJoin(supporting)}.`] : []), ...featureWhy(c, f)];
      addStep(`Add ${featureName(f)}`, ps, body.filter(Boolean));
    }
  }
  // Each wire goes in the step where the last of its parts is placed (the board and battery count as already there).
  const fixed = (id: string) => id === c.boardId || (project.board === 'none' && c.parts.get(id)?.type === 'battery-9v');
  for (const w of project.wires) {
    const ends = [w.a.part, w.b.part].filter((id) => !fixed(id));
    const i = ends.length ? Math.max(...ends.map((id) => stepOf.get(id) ?? -1)) : stepOf.get(w.a.part) ?? -1;
    if (i >= 0) steps[i].wires.push(w);
  }
  return steps;
}

function stepWireLabel(c: Ctx, ref: PinRef): string {
  const p = c.parts.get(ref.part);
  if (c.project.board === 'none' && p?.type === 'battery-9v') return ref.pin === '+' ? 'the + rail' : 'the − rail';
  return wireEndLabel(c.project, ref);
}

function wiringTable(c: Ctx): string[] {
  const lines = ['| # | From | To | Wire colour |', '|---|------|----|-------------|'];
  c.project.wires.forEach((w, i) => {
    const [a, b] = orientWire(c, w);
    lines.push(`| ${i + 1} | ${wireEndLabel(c.project, a)} | ${wireEndLabel(c.project, b)} | ${colourName(w.color)} |`);
  });
  return lines;
}

function fileDescription(name: string, board: BoardDef): string {
  const known: Record<string, string> = {
    'main.py': board.language === 'python' ? 'your program — run it with `python3 main.py`' : 'your program; MicroPython runs it automatically every time the board starts',
    'ssd1306.py': 'driver for the OLED display',
    'oled.py': 'driver for the OLED display',
    'mpu6050.py': 'driver for the MPU-6050 IMU',
    'i2c_lcd.py': 'driver for the I2C character LCD',
  };
  return known[name] ?? 'helper module used by main.py';
}

function piExtraLibraries(c: Ctx): string[] {
  const fs = c.features;
  const out: string[] = [];
  if (fs.some((f) => f.kind === 'dht22')) out.push('DHT22 support: `pip3 install adafruit-circuitpython-dht` and `sudo apt install libgpiod2`.');
  if (fs.some((f) => f.kind === 'neopixel')) out.push('NeoPixel support: `sudo pip3 install rpi_ws281x adafruit-circuitpython-neopixel` — and run the program with `sudo python3 main.py`, because NeoPixels need low-level hardware access.');
  return out;
}

function safetyNotes(c: Ctx): string[] {
  const kinds = new Set(c.project.parts.map((p) => p.type));
  const out = [`Build with the power **${c.board ? 'unplugged' : 'disconnected'}**. Connect it only once everything is wired and double-checked.`, 'Check every red/orange (power) and black (GND) wire twice — swapping them is the most common way to kill a part.'];
  if (c.board) out.push(`The ${c.board.name}'s pins work at **${c.board.logicV} V**. Never connect 5 V straight to a GPIO pin.`);
  if (kinds.has('relay')) out.push('**Relays can switch mains electricity, which can kill.** For this build, only switch low-voltage things (a 5 V pump, fan or LED strip). Leave mains wiring to qualified people.');
  if (kinds.has('battery-9v')) out.push('Don\'t let the 9 V battery\'s terminals touch each other, or a coin or keys in your pocket — it can get hot.');
  if (kinds.has('neopixel-ring')) out.push('NeoPixels are *bright*. Don\'t stare into them at full brightness.');
  if (kinds.has('electrolytic')) out.push('Electrolytic capacitors have a + and a − leg. Put them in backwards and they can get hot or even pop.');
  if (kinds.has('soil')) out.push('Keep water away from the board and breadboard — only the probe goes in the soil.');
  return out;
}

function toolsList(c: Ctx): string[] {
  const out: string[] = [];
  if (c.project.board === 'rpi4') out.push('A computer on the same network (to log in over SSH), or a monitor, keyboard and mouse for the Pi');
  else if (c.board) out.push('A computer with a USB port (Windows, macOS or Linux) and Python 3 installed');
  out.push('Optional: a multimeter, for checking voltages and connections');
  if (c.project.parts.some((p) => p.type === 'neopixel-ring')) out.push('A soldering iron and solder — the NeoPixel ring has bare pads, so its three wires need soldering on');
  out.push('Optional: small pliers or tweezers for pushing parts into the breadboard');
  if (c.project.parts.some((p) => p.type === 'lcd1602' || p.type === 'pir')) out.push('A small screwdriver (for the adjustment screws on the module)');
  return out;
}

function howItWorksDiscrete(c: Ctx): string[] {
  const a = analyze555(c.project);
  if (a) {
    const ledMa = a.rLed ? Math.round(((a.v - 1.7 - 2) / a.rLed) * 1000) : undefined;
    return [
      `The 555 timer charges the timing capacitor through both resistors, and discharges it through just the second one. When the capacitor reaches two-thirds of the supply voltage, the output switches off; when it drops to one-third, it switches back on. Round and round it goes — an *oscillator*.${a.tone ? ` Here it switches hundreds of times a second, which the piezo buzzer turns into a tone. The button lifts the RESET pin (4) to + to let it run; the 10 kΩ pull-down holds RESET low — and the buzzer silent — the rest of the time.` : ''}`,
      '',
      `With R1 = ${ohm(a.r1)}, R2 = ${ohm(a.r2)} and C = ${formatFarads(a.c)}:`,
      '',
      `- **Frequency:** f = 1.44 ÷ ((R1 + 2·R2) · C) = 1.44 ÷ ((${formatOhms(a.r1)} + 2 × ${formatOhms(a.r2)}) × ${formatFarads(a.c)}) ≈ **${fmtHz(a.f)}**`,
      `- **On time:** 0.693 · (R1 + R2) · C ≈ ${fmtS(a.tHigh)}`,
      `- **Off time:** 0.693 · R2 · C ≈ ${fmtS(a.tLow)}`,
      ...(ledMa ? [`- **LED current:** the output sits about 1.7 V below the battery, so (${a.v} − 1.7 − 2) V ÷ ${ohm(a.rLed!)} ≈ ${ledMa} mA`] : []),
      '',
      a.tone ? 'Want a higher pitch? Use a smaller capacitor or smaller resistors. Lower? Go bigger.' : 'Want it faster? Use a smaller capacitor or smaller resistors. Slower? Go bigger.',
    ];
  }
  const t = transistorValues(c.project);
  if (!t) return [];
  return [
    'The transistor is an electronic switch. A tiny current into its *base* lets a much bigger current flow from its *collector* to its *emitter*.',
    '',
    `- **Base current:** (${t.v} V − 0.7 V) ÷ ${ohm(t.rb)} ≈ ${t.ib.toFixed(2)} mA when you press the button.`,
    `- **LED current:** (${t.v} V − about 2 V for the LED − 0.2 V for the transistor) ÷ ${ohm(t.rl)} ≈ ${Math.round(t.ic)} mA — about ${Math.round(t.ic / t.ib)} times the base current.`,
    '',
    'That\'s the whole trick behind how microcontrollers drive motors and lamps that need more current than a pin can supply.',
  ];
}

/** Complete, printable step-by-step build instructions in Markdown. */
export function buildGuide(project: Project): string {
  const c = analyze(project);
  const b = c.board;
  const out: string[] = [];
  const nParts = project.parts.filter((p) => p.id !== c.boardId).length;
  const minutes = Math.max(20, Math.round((project.wires.length * 2 + nParts * 3) / 5) * 5);
  out.push(`# How to build: ${project.name}`, '');
  out.push(`> ${capFirst(designPhrase(c))}.`, '');
  out.push(`**Difficulty:** ${project.wires.length > 18 || project.board === 'rpi4' ? 'Intermediate' : 'Beginner'} · **Build time:** about ${minutes} minutes · **Parts:** ${nParts + (c.boardId ? 1 : 0)} · **Wires:** ${project.wires.length}`, '');

  // ---- what you need
  out.push('## What you need', '');
  out.push('| Qty | Part | Notes | Approx. price |', '|----:|------|-------|------:|');
  for (const l of c.bom) out.push(`| ${l.quantity} | ${l.name}${l.value && !l.name.includes(l.value) ? ` (${l.value})` : ''}${l.optional ? ' *(recommended)*' : ''} | ${l.references || l.note || ''} | ${formatUsd(l.linePrice)} |`);
  out.push('', `**Total: about ${formatUsd(bomTotal(c.bom))}** (rough single-quantity prices; kits and multipacks are often cheaper).`, '');
  out.push('### Tools', '', ...toolsList(c).map((t) => `- ${t}`), '');

  // ---- safety
  out.push('## Safety first', '', ...safetyNotes(c).map((s) => `- ${s}`), '');

  // ---- breadboard primer + design check
  out.push('## Before you start', '');
  out.push('A **breadboard** lets you build circuits without soldering. Under each short row of five holes is a metal strip, so anything plugged into the same row is connected. The gap down the middle separates the two halves. The long rails along the edges carry power.', '');
  const checks = runChecks(project);
  const serious = checks.filter((r) => r.severity !== 'info');
  out.push(`**Design check:** ${checkSummary(checks)}`);
  if (serious.length) {
    out.push('');
    for (const r of serious) out.push(`- **${r.severity === 'error' ? 'Fix' : 'Note'}:** ${r.title}. ${r.detail}`);
  }
  out.push('');

  // ---- wiring table
  out.push('## Wiring table', '');
  out.push(`Every connection in the project${b && b.id !== 'esp32' ? ', with the physical pin numbers on the header (counted from pin 1)' : ''}. Wire colours are only a suggestion, but sticking to red/orange for power and black for GND makes mistakes easy to spot.`, '');
  out.push(...wiringTable(c), '');

  // ---- exact layout
  const plan = planBreadboard(project);
  if (!plan.problems.length) {
    out.push('## Hole-by-hole breadboard layout', '');
    out.push(`One tested way to lay this out on a standard 830-hole breadboard. Hole names are column number plus row letter, like **j12**. Sparkbench checked that these holes and jumpers make exactly the connections in the wiring table. In the app, **Build it step by step** shows one step at a time with the holes highlighted.`, '');
    out.push('![Breadboard layout](breadboard.svg)', '');
    plan.steps.forEach((st, i) => out.push(`${i + 1}. ${st.text}`));
    out.push('');
  }

  // ---- assembly
  out.push(plan.problems.length ? '## Step-by-step assembly' : '## Step-by-step assembly (by connection)', '');
  let n = 1;
  out.push(`### Step ${n++}: ${b ? `Place the ${b.name}` : 'Get your breadboard ready'}`, '', boardPlacement(c), '');
  const power = powerStep(c);
  if (power.length) out.push(`### Step ${n++}: Set up the power rails`, '', ...power, '');
  const wireNo = new Map(project.wires.map((w, i) => [w.id, i + 1]));
  for (const s of assemblySteps(c)) {
    out.push(`### Step ${n++}: ${capFirst(s.title)}`, '');
    out.push(...s.body.flatMap((l) => [l, '']));
    if (s.wires.length) {
      out.push(s.wires.length === 1 ? 'Make this connection:' : 'Make these connections:', '');
      for (const w of s.wires) {
        const [a, bb] = orientWire(c, w);
        out.push(`- (#${wireNo.get(w.id)}) ${stepWireLabel(c, a)} → ${stepWireLabel(c, bb)} — ${colourName(w.color)} wire`);
      }
      out.push('');
    }
  }
  out.push(`### Step ${n++}: Double-check before powering up`, '');
  out.push('- Go down the wiring table and tick off each row.', '- Look for bare wire ends or leads touching each other.');
  if (project.parts.some((p) => ['led', 'rgb-led', 'electrolytic'].includes(p.type))) out.push(`- Check every ${listJoin([project.parts.some((p) => p.type === 'led' || p.type === 'rgb-led') ? 'LED' : '', project.parts.some((p) => p.type === 'electrolytic') ? 'electrolytic capacitor' : ''])} is the right way round.`);
  if (b) out.push('- Check nothing goes from a 5 V pin to a GPIO pin.');
  out.push('');

  // ---- firmware
  if (b) {
    out.push('## Load the program', '');
    out.push(b.language === 'python' ? 'The Raspberry Pi runs your program as ordinary Python 3 on Linux, using the friendly **gpiozero** library.' : `The ${b.name} runs **MicroPython** — a small version of Python made for microcontrollers. You flash MicroPython once, then copy your program onto the board.`, '');
    out.push(...netSetup(c));
    out.push('**First, get the files out of Sparkbench:** click **Export → Everything (.zip)** and unzip it — the `firmware` folder holds the program. (Or use **Download** on each file in the Code tab.)', '');
    if (b.language === 'micropython')
      out.push(
        `**Easiest way (no command line):** install [Thonny](https://thonny.org), plug in the ${b.short}, choose *Tools → Options → Interpreter → MicroPython (${b.id === 'pico' ? 'Raspberry Pi Pico' : 'ESP32'})* — Thonny can install MicroPython onto the board for you from that same screen. Then open each \`.py\` file from the \`firmware\` folder and use *File → Save as… → MicroPython device*, keeping the same name. Press the red Stop/Restart button to run \`main.py\`.`,
        '',
        '**Or from the command line:**',
        '',
      );
    const steps = [...b.flashing, ...(b.id === 'rpi4' ? piExtraLibraries(c) : [])];
    steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
    out.push('');
    const files = Object.keys(project.files ?? {});
    if (files.length) {
      out.push(`The project has ${plural(files.length, 'file', { words: true })} to copy:`, '');
      for (const f of files) out.push(`- \`${f}\` — ${fileDescription(f, b)}`);
      out.push('');
    }
  } else {
    out.push('## How it works', '', 'No programming needed — this circuit works on its own as soon as it has power.', '', ...howItWorksDiscrete(c), '');
  }

  // ---- test
  out.push('## Test it', '');
  out.push(`${b ? 'Power it up' : 'Clip on the battery'} and work through this checklist:`, '');
  for (const be of behaviours(c)) if (be.test) out.push(`- [ ] ${be.test}`);
  out.push('');

  // ---- troubleshooting
  out.push('## Troubleshooting', '');
  if (b) out.push('- **Nothing at all happens:** check the power wires first, then that the board is actually powered (most boards have a small power LED).');
  for (const t of b ? BOARD_TROUBLE[b.id] ?? [] : []) out.push(`- ${t}`);
  const seen = new Set<string>();
  for (const p of project.parts) {
    if (seen.has(p.type)) continue;
    seen.add(p.type);
    for (const t of p.type === 'ne555' && analyze555(c.project)?.tone ? ['**No sound:** check the chip is the right way round (notch/dot = pin 1), that the button really connects pin 4 (RESET) to + when pressed, and that the buzzer is a *passive* piezo (an active buzzer has its own beeper inside).'] : TROUBLE[p.type] ?? []) out.push(`- ${t}`);
  }
  out.push('- **Still stuck?** Go through the wiring table above one row at a time and check each wire really lands on the pin it names. Then compare with the breadboard picture in Sparkbench (hover a pin there to see what it should connect to).', '');
  return piify(project, out.join('\n'));
}

// ==================================================================== blog post

const HOOKS: [FeatureKind[], string][] = [
  [['hcsr04', 'buzzer'], 'Ever wondered how a car knows it\'s about to kiss the garage wall? It\'s not magic — it\'s a little sensor that shouts and listens for the echo, plus a beeper that panics more the closer you get.'],
  [['soil', 'relay'], 'Plants are terrible at telling you they\'re thirsty. By the time the leaves droop, it\'s a bit late. So let\'s build a gadget that checks the soil for you — and waters the plant by itself.'],
  [['soil'], 'Plants are terrible at telling you they\'re thirsty. By the time the leaves droop, it\'s a bit late. So let\'s give your plant a voice.'],
  [['pir', 'buzzer'], 'Someone keeps raiding the biscuit tin, and it\'s time to catch them in the act. Enter: a motion alarm you can build in an evening.'],
  [['pir'], 'Wouldn\'t it be nice if things just knew you\'d walked into the room? A cheap motion sensor makes that surprisingly easy.'],
  [['mpu6050'], 'Your phone knows which way is up. With a tiny motion sensor and a few wires, your project can too.'],
  [['dht22'], 'How warm is it, really? Your thermostat has an opinion, your phone has another. Let\'s build our own instrument and settle it.'],
  [['ntc'], 'How warm is it, really? Let\'s find out with one of the cheapest sensors in electronics: a resistor that changes with temperature.'],
  [['pot', 'servo'], 'There\'s something deeply satisfying about turning a knob and watching something move. Let\'s build exactly that.'],
  [['servo'], 'Motors that spin are fun, but motors that point exactly where you tell them are useful. Meet the servo.'],
  [['neopixel'], 'Twelve tiny lights, millions of colours, one data wire. NeoPixels are the quickest way to make a project glow.'],
  [['rgb'], 'One LED, three colours inside, and every shade in between. Let\'s build a little mood light.'],
  [['ldr'], 'Some of the best gadgets are the ones you never have to think about — like a light that knows when it\'s getting dark.'],
  [['relay'], 'A microcontroller pin can light an LED, but it can\'t run a fan or a pump. That\'s what a relay is for.'],
  [['buzzer'], 'Nothing says "I built this!" quite like a gadget that beeps at you.'],
  [['led', 'button'], 'Every maker\'s journey starts with blinking an LED and reading a button. It\'s the "hello world" of electronics — and it\'s more fun than it sounds.'],
  [['led'], 'Every maker\'s journey starts with an LED. It\'s the "hello world" of electronics — and it\'s more fun than it sounds.'],
  [['button'], 'Buttons are how people talk to gadgets. Let\'s wire some up and make them do something.'],
  [['astable555'], 'Before microcontrollers were everywhere, clever little circuits did all the work on their own. The 555 timer, designed in 1971, is still made by the billion — and it can blink an LED with no code at all.'],
  [['transistor-led'], 'Every computer ever made is built from billions of tiny switches called transistors. Let\'s play with just one of them, big enough to hold in your fingers.'],
];

const TAGLINES: [FeatureKind[], string][] = [
  [['hcsr04', 'buzzer'], 'it beeps faster as you get closer'],
  [['soil', 'relay'], 'it waters your plant by itself'],
  [['soil'], 'it tells you when your plant is thirsty'],
  [['pir', 'buzzer'], 'catch sneaky snack thieves'],
  [['mpu6050', 'oled'], 'a pocket bubble level and motion logger'],
  [['dht22', 'oled'], 'temperature and humidity at a glance'],
  [['dht22', 'lcd'], 'temperature and humidity at a glance'],
  [['dht22', 'relay'], 'a fan that turns itself on'],
  [['pot', 'servo'], 'turn a knob, move an arm'],
  [['neopixel'], 'colour-changing light from one data wire'],
  [['rgb'], 'mix any colour with three tiny lights'],
  [['ldr'], 'it knows when it\'s dark'],
  [['hcsr04'], 'measure distance like a bat'],
  [['astable555'], 'blinking an LED with zero lines of code'],
  [['transistor-led'], 'your first transistor switch'],
];

function matchByKinds<T>(list: [FeatureKind[], T][], kinds: Set<FeatureKind>): T | undefined {
  return list.find(([ks]) => ks.every((k) => kinds.has(k)))?.[1];
}

const FEATURE_IDEAS: Partial<Record<FeatureKind, string>> = {
  dht22: 'Log the temperature every few minutes and plot a graph of your room over a whole day.',
  ntc: 'Calibrate the thermistor against a kitchen thermometer and tweak the numbers in the code.',
  mpu6050: 'Turn the IMU into a step counter: count the peaks in the acceleration as you walk.',
  hcsr04: 'Mount the sensor on a servo and sweep it to make a mini radar screen.',
  pir: 'Add a timestamp and keep a log of when motion happens, so you know *when* the biscuits went missing.',
  ldr: 'Use the light level to dim a display automatically at night.',
  soil: 'Add a second probe for another plant, and show both on a display.',
  pot: 'Use the knob to set a threshold (like the alarm temperature) instead of editing the code.',
  oled: 'Draw a little graph of the last minute of readings on the OLED.',
  lcd: 'Add custom characters (a tiny thermometer or water drop) to the LCD.',
  button: 'Give each button a long-press action as well as a short press.',
  led: 'Make the LEDs fade smoothly instead of switching on and off.',
  buzzer: 'Play a short tune at start-up — the `tone()` helper makes it easy.',
  servo: 'Attach a cardboard pointer to the servo and draw a dial behind it.',
  relay: 'Add a safety timeout so the relay can never stay on for more than a few minutes.',
  neopixel: 'Animate a spinning "comet" around the ring.',
  rgb: 'Fade between colours slowly for a calm night-light effect.',
  astable555: 'Add a second LED from the output to + (with its own resistor) so the two LEDs take turns — a railway-crossing flasher.',
  'transistor-led': 'Replace the button with a light sensor divider, and the LED switches on automatically in the dark.',
};
const BOARD_IDEAS: Record<string, string> = {
  esp32: 'The ESP32 has Wi-Fi built in: send the readings to your phone, or serve a tiny web page straight from the board.',
  pico: 'Run it from a USB power bank or three AA batteries and take it anywhere.',
  rpi4: 'The Pi is a full computer: serve a live web dashboard of your readings with a few lines of Flask.',
  none: 'Replace the LED and its resistor with a small speaker and a much smaller capacitor (try 10 nF): the 555 becomes a tone generator.',
};

/** The most interesting helper function in main.py to quote in the blog, with a sentence explaining it. */
function pickHelper(main: string): { code: string; why: string } | undefined {
  const helpers = codeSection(main, 'helpers');
  const blocks: string[][] = [];
  let cur: string[] | undefined;
  for (const l of helpers) {
    if (/^(def|class) /.test(l)) {
      cur = [l];
      blocks.push(cur);
    } else if (cur && (l.startsWith(' ') || l === '')) cur.push(l);
    else cur = undefined;
  }
  const clean = (b: string[]) => b.join('\n').replace(/\n+$/, '');
  const prefs: [RegExp, string][] = [
    [/^def read_distance_cm/, 'This is how the distance sensor is read: a 10-microsecond pulse on TRIG makes it chirp, then `time_pulse_us` times how long ECHO stays high. Sound travels about 1 cm every 29 µs, and it has to go there *and back*, so dividing by 58 gives centimetres.'],
    [/^def set_angle/, 'A servo is steered by pulse length: 0.5 ms means 0°, 2.5 ms means 180°, repeated 50 times a second. This helper turns an angle into the right pulse, and `clamp` makes sure we never ask for an impossible angle.'],
    [/^def read_\w+_c\(/, 'The thermistor\'s resistance is worked out from the measured voltage, then the "B-parameter" equation turns resistance into degrees. It looks scary, but it\'s just the formula from the thermistor\'s datasheet.'],
    [/^def read_soil\w*_pct/, 'The probe gives about 2.8 V in dry air and 1.2 V in water. This helper turns the voltage into a friendlier 0–100 % scale.'],
    [/^def wheel/, 'The colour wheel turns one number (0–255) into a red/green/blue mix, sliding from red to green to blue and back to red. Feed it a slowly increasing number and you get a rainbow.'],
    [/^class Edge/, 'Buttons are surprisingly messy: the metal contacts bounce for a few milliseconds, which can look like several presses. This little class only reports a press when the value changes and at least 30 ms have passed since the last change — that\'s called *debouncing*.'],
    [/^def tone/, 'The passive buzzer only makes sound while the pin wiggles. Setting the PWM frequency picks the pitch, and a 50 % duty cycle gives the loudest tone.'],
    [/^def read_\w+_pct/, 'The analog-to-digital converter turns the voltage on the pin into a number. Dividing by the maximum gives a fraction, and multiplying by 100 gives a percentage.'],
    [/^def set_led/, 'Instead of plain on/off, each LED is driven with PWM, so it can be dimmed: 0.0 is off, 1.0 is full brightness.'],
  ];
  for (const [re, why] of prefs) {
    const b = blocks.find((x) => re.test(x[0]));
    if (b) return { code: clean(b), why };
  }
  return undefined;
}

function setupExplainers(c: Ctx, setup: string): string[] {
  const out: string[] = [];
  if (c.board?.language === 'micropython') {
    if (setup.includes('I2C(')) out.push('`I2C(...)` sets up the shared two-wire bus; the display and sensor objects are then created on top of it.');
    if (setup.includes('Pin.PULL_UP')) out.push('`Pin(..., Pin.IN, Pin.PULL_UP)` makes a pin an input with its built-in pull-up switched on — perfect for buttons wired to GND.');
    if (setup.includes('Pin.OUT')) out.push('`Pin(..., Pin.OUT)` makes a pin an output the program can switch on (3.3 V) and off (0 V).');
    if (setup.includes('ADC(')) out.push(`\`ADC(Pin(...))\` turns a pin into an analog input that can measure voltages${c.board.id === 'esp32' ? '; `ATTN_11DB` lets it measure the full 0–3.3 V range' : ''}.`);
    if (setup.includes('PWM(')) out.push('`PWM(...)` gives a pin that switches on and off very fast — used to dim LEDs, make tones and steer servos.');
    if (setup.includes('dht.DHT22')) out.push('`dht.DHT22(...)` uses MicroPython\'s built-in driver for the temperature/humidity sensor.');
    if (setup.includes('neopixel.NeoPixel')) out.push('`neopixel.NeoPixel(pin, count)` gives you a list of colours, one per LED, that you send out in one go with `write()`.');
  } else {
    if (setup.includes('Button(')) out.push('`Button(pin, pull_up=True)` is gpiozero\'s button: it switches on the pull-up resistor for you.');
    if (setup.includes('PWMLED(')) out.push('`PWMLED(pin)` is an LED you can dim by setting `.value` between 0 and 1.');
    if (setup.includes('RGBLED(')) out.push('`RGBLED(red, green, blue)` drives all three colours; set `.color` to a (red, green, blue) mix.');
    if (setup.includes('MCP3008(')) out.push('`MCP3008(channel=...)` reads one channel of the analog converter chip and gives a value from 0 to 1.');
    if (setup.includes('OutputDevice(')) out.push('`OutputDevice(pin)` is a simple on/off output — here it drives the relay.');
    if (setup.includes('AngularServo(')) out.push('`AngularServo(...)` lets you set `.angle` directly instead of thinking about pulse widths.');
    if (setup.includes('DistanceSensor(')) out.push('`DistanceSensor(echo, trigger)` does all the chirp-and-time work and gives the distance in metres.');
    if (setup.includes('MotionSensor(')) out.push('`MotionSensor(pin)` wraps the PIR; `.motion_detected` tells you whether it currently sees movement.');
    if (setup.includes('I2cLcd(') || setup.includes('OLED(') || setup.includes('MPU6050(')) out.push('The display and sensor drivers talk to I2C bus 1, which is the one on header pins 3 and 5.');
  }
  return out;
}

function quoteLoop(main: string, maxLines = 34): string {
  const lines = codeSection(main, 'main loop');
  if (!lines.length || lines[0].trim() !== 'while True:') lines.unshift('while True:');
  if (lines.length <= maxLines + 4) return lines.join('\n');
  return [...lines.slice(0, maxLines), '    # … (the rest of the loop is in main.py)'].join('\n');
}

/** Intros for parts whose catalogue text assumes a microcontroller board. */
const DISCRETE_INTRO: Record<string, string> = {
  pushbutton: 'A button. Pressing it connects its two legs, letting current through; let go and the connection breaks. A 6×6 mm momentary tactile switch.',
  led: 'A little light. Current only flows one way: in through the long leg (+, the anode) and out through the short leg (−, the cathode). It always needs a resistor to limit that current. A standard 5 mm LED.',
};

const ROLE_DISCRETE: Record<string, string> = {
  ne555: 'Here it\'s the heart of the circuit, wired as an *astable* — a free-running oscillator that never stops switching.',
  'battery-9v': 'Here it powers everything — there is no USB cable and no board.',
  led: 'Here it\'s the part you actually see doing something.',
  npn: 'Here it lets a tiny current from the button switch a much bigger current through the LED.',
  pushbutton: 'Here it feeds a small current into the transistor\'s base while you hold it down.',
};

function resistorJob(p: PartInstance): string {
  const label = partLabel(p);
  if (/RGB/.test(label)) return 'one per colour of the RGB LED, each limiting that colour\'s current';
  if (/led/i.test(label)) return 'limits the current through an LED so it doesn\'t burn out';
  if (/divider/i.test(label) && /echo/i.test(label)) return 'together scale the distance sensor\'s 5 V echo down to a safe 3.3 V';
  if (/divider/i.test(label)) return 'turns a changing resistance into a voltage the board can measure';
  if (/neopixel|data/i.test(label)) return 'protects the NeoPixels\' data input from spikes';
  if (/pull-down/i.test(label)) return 'holds the 555\'s RESET pin low, so it stays silent until you press the button';
  if (/timing|^R[12]\b/i.test(label)) return 'set how fast the 555 switches — the blink rate or the pitch';
  if (/base/i.test(label)) return 'keeps the transistor\'s base current small and safe';
  return lowerFirst(def(p).eli5.replace(/\.$/, ''));
}
function capacitorJob(p: PartInstance): string {
  const label = partLabel(p);
  if (/timing/i.test(label)) return p.type === 'electrolytic' ? 'sets the blink rate together with the two timing resistors (and must go in the right way round: stripe to −)' : 'sets the speed (here: the pitch) together with the two timing resistors; ceramic capacitors can go either way round';
  if (/control/i.test(label)) return 'keeps the 555\'s internal reference voltage (pin 5) steady, so the timing doesn\'t wobble';
  return lowerFirst(def(p).eli5.replace(/\.$/, ''));
}

function blogPartsSection(c: Ctx): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const roleOf = new Map<string, string[]>();
  for (const be of behaviours(c)) if (be.feature) roleOf.set(be.feature.parts[0], [...(roleOf.get(be.feature.parts[0]) ?? []), be.does]);
  const order = ['board', 'ic', 'display', 'sensor', 'input', 'output', 'actuator', 'power'];
  const parts = [...c.project.parts].sort((a, b) => order.indexOf(safeDef(a.type)?.category ?? 'passive') - order.indexOf(safeDef(b.type)?.category ?? 'passive'));
  for (const p of parts) {
    const d = safeDef(p.type);
    if (!d || d.category === 'passive' && p.type !== 'npn' || seen.has(p.type)) continue;
    seen.add(p.type);
    const same = c.project.parts.filter((x) => x.type === p.type);
    out.push(`### ${d.name}${same.length > 1 ? ` (× ${same.length})` : ''}`, '');
    out.push(!c.board && DISCRETE_INTRO[p.type] ? DISCRETE_INTRO[p.type] : `${d.eli5} ${d.description.replace(/\.$/, '')}.`, '');
    const roles = same.flatMap((x) => roleOf.get(x.id) ?? []);
    if (d.category === 'board' && c.board) out.push(`In this project it runs ${c.board.language === 'micropython' ? 'MicroPython' : 'Python 3'}, ${c.features.some((f) => SENSOR_KINDS.includes(f.kind) || f.kind === 'button') ? 'reads every input and decides what every output should do' : 'decides what every output should do, moment by moment'}.`, '');
    else if (!c.board && p.type === 'pushbutton' && analyze555(c.project)?.tone) out.push('Here it connects the 555\'s RESET pin to + while you hold it, letting the timer run.', '');
    else if (!c.board && p.type === 'buzzer') out.push('Here the 555\'s output pushes its piezo disc back and forth hundreds of times a second — that\'s the sound.', '');
    else if (!c.board && ROLE_DISCRETE[p.type]) out.push(ROLE_DISCRETE[p.type], '');
    else if (roles.length) out.push(`**In this project:** ${roles.slice(0, 3).join(' ')}`, '');
    else if (p.type === 'mcp3008') out.push('**In this project:** the Raspberry Pi can only read on/off signals, so this chip measures the analog voltages for it and sends the numbers over SPI.', '');
  }
  // Supporting cast: resistors and capacitors, grouped by their job.
  const passives = c.project.parts.filter((p) => ['resistor', 'capacitor', 'electrolytic', 'diode'].includes(p.type));
  if (passives.length) {
    const groups = new Map<string, number>();
    for (const p of passives) {
      const n = def(p).name.toLowerCase().replace(/ \(.*\)$/, '').replace(/ \d.*$/, '');
      groups.set(n, (groups.get(n) ?? 0) + 1);
    }
    const names = [...groups].map(([n, k]) => plural(k, n, { words: true }));
    out.push('### The supporting cast', '');
    out.push(`There ${passives.length === 1 ? 'is' : 'are'} also ${listJoin(names)}. They're cheap and easy to overlook, but each one has a job:`, '');
    const jobs = new Map<string, string[]>();
    for (const p of passives) {
      const job = p.type === 'resistor' ? resistorJob(p) : p.type === 'diode' ? lowerFirst(def(p).eli5) : capacitorJob(p);
      const v = partValue(p);
      const what = p.type === 'resistor' ? v : `${v} ${p.type === 'electrolytic' ? 'electrolytic capacitor' : 'capacitor'}`.trim();
      const list = jobs.get(job) ?? [];
      if (!list.includes(what)) list.push(what);
      jobs.set(job, list);
    }
    for (const [job, whats] of jobs) {
      const isRes = whats.every((w) => /Ω$/.test(w));
      const count = passives.filter((p) => (p.type === 'resistor' ? resistorJob(p) : p.type === 'diode' ? lowerFirst(def(p).eli5) : capacitorJob(p)) === job).length;
      const label = isRes ? `${listJoin(whats)} resistor${count > 1 ? 's' : ''}` : listJoin(whats);
      const each = count > 1 && /^[a-z]+s\b/.test(job) && !/^(together|one)\b/.test(job) ? 'each ' : '';
      out.push(`- **${capFirst(label)}:** ${each}${job.replace(/\.$/, '')}.`);
    }
    out.push('');
  }
  return out;
}

function discreteDeepDive(c: Ctx): string[] {
  const a = analyze555(c.project);
  if (a) {
    const duty = Math.round((a.tHigh / (a.tHigh + a.tLow)) * 100);
    return [
      '### What\'s going on inside the 555',
      '',
      'Inside that little 8-pin chip are two *comparators* (circuits that check whether one voltage is higher than another), a *flip-flop* (a one-bit memory) and a *discharge transistor*. Three identical resistors inside the chip split the supply into thirds — legend has it they\'re 5 kΩ each, which is where the name comes from.',
      '',
      a.tone ? 'While the capacitor charges, the output (pin 3) is high and pushes the buzzer\'s disc one way; while it discharges, the output is low. When the voltage on pin 6 (THRESHOLD) passes two-thirds of the supply, the upper comparator flips the flip-flop: the output goes low and the discharge transistor on pin 7 switches on, draining the capacitor through R2. When the voltage on pin 2 (TRIGGER) falls below one-third, the lower comparator flips it back, and the cycle starts again — hundreds of times a second, which you hear as a tone.' : 'While the capacitor charges, the output (pin 3) is high and the LED is on. When the voltage on pin 6 (THRESHOLD) passes two-thirds of the supply, the upper comparator flips the flip-flop: the output goes low and the discharge transistor on pin 7 switches on, draining the capacitor through R2. When the voltage on pin 2 (TRIGGER) falls below one-third, the lower comparator flips it back, and the cycle starts again.',
      '',
      `${a.tone ? 'Pin 4 (RESET) is held low by a 10 kΩ resistor, which keeps the chip stopped until the button pulls it up to +. The' : 'Pin 4 (RESET) is tied to + so the chip never resets, and the'} small ${formatFarads(c.project.parts.find((p) => p.type === 'capacitor')?.props.farads ?? 1e-8)} capacitor on pin 5 (CONTROL) keeps the internal reference steady.`,
      '',
      `Where does the 1.44 come from? Charging a capacitor from one-third to two-thirds of the supply through a resistor takes ln 2 ≈ 0.693 "time constants" (resistance × capacitance). One full cycle is therefore 0.693 · (R1 + 2·R2) · C, and 1 ÷ 0.693 ≈ 1.44. Because the capacitor charges through R1 *and* R2 but discharges only through R2, the output is high a little longer than it's low — here about ${duty} % of the time.`,
      '',
    ];
  }
  const t = transistorValues(c.project);
  if (!t) return [];
  return [
    '### What\'s going on inside the transistor',
    '',
    'An NPN transistor has three legs: the collector (C), the base (B) and the emitter (E). Think of it as a tap: a trickle of current into the base opens the tap and lets a much bigger current pour from collector to emitter. The ratio is called the *gain* — typically 100 or more for a PN2222A.',
    '',
    `Here, pressing the button connects the base resistor to +${t.v} V, so about ${t.ib.toFixed(1)} mA flows into the base. That's enough to allow far more current than the LED needs, so the transistor is *saturated* — fully on, like a closed switch — and the LED's own ${ohm(t.rl)} resistor sets the current to about ${Math.round(t.ic)} mA.`,
    '',
    'Why not just put the button in series with the LED? You could! But this circuit is the same one a microcontroller uses to switch a motor, a strip of LEDs or a relay: swap the button for a GPIO pin and a pin that can only give a few milliamps can control hundreds.',
    '',
  ];
}

function circuitSection(c: Ctx, schematic: string): string[] {
  const out: string[] = [];
  const b = c.board;
  out.push('## How it all connects', '', `![Schematic](${schematic})`, '');
  if (!b) {
    const others = c.project.parts.filter((p) => p.type !== 'battery-9v');
    out.push(`The whole circuit runs from a 9 V battery — there's no microcontroller and no code. ${capFirst(plural(others.length, 'part', { words: true }))} (${listJoin(others.map((p) => p.ref ?? p.id))}) sit on one small breadboard, joined by ${plural(c.project.wires.length, 'wire')}.`, '');
    out.push(...howItWorksDiscrete(c), '', ...discreteDeepDive(c));
    return out;
  }
  const on5 = c.features.filter((f) => ['lcd', 'hcsr04', 'pir', 'servo', 'relay', 'neopixel'].includes(f.kind));
  const i2c = c.features.filter((f) => ['oled', 'lcd', 'mpu6050'].includes(f.kind));
  const on5Text = on5.length ? `, while ${listJoin(on5.map((f) => featureName(f)))} ${on5.length === 1 ? 'needs' : 'need'} 5 V and ${on5.length === 1 ? 'uses' : 'use'} ${fivePinName(b)} instead` : '';
  const uses33 = c.project.wires.some((w) => [w.a, w.b].some((r) => r.part === c.boardId && r.pin.startsWith(b.supply3v3.replace(/\.\d+$/, ''))));
  out.push(`Everything plugs into the ${b.name}. The board gets its power over USB${uses33 ? ` and passes it on: most parts use its 3.3 V pin${on5Text}` : ' — the parts here are driven straight from its pins'}. All the grounds are joined together — that shared GND is the reference every signal is measured against.`, '');
  if (i2c.length) out.push(`${capFirst(listJoin(i2c.map((f) => featureName(f))))} ${i2c.length === 1 ? 'talks' : i2c.length === 2 ? 'both talk' : 'all talk'} over **I2C**, a two-wire bus: SDA on ${boardPinText(b, b.i2c.sda)} and SCL on ${boardPinText(b, b.i2c.scl)}.${i2c.length > 1 ? ' Each part has its own address, so they can share the same two wires without getting in each other\'s way.' : ''}`, '');
  const rows = c.features
    .filter((f) => Object.keys(f.pins).length || f.mcpChannel !== undefined)
    .map((f) => {
      const pins = f.mcpChannel !== undefined ? `MCP3008 channel ${f.mcpChannel}` : Object.entries(f.pins).map(([s, p]) => `${s === 'pin' ? '' : `${s.toUpperCase()} → `}${boardPinText(b, p)}`).join(', ');
      return `| ${f.label} | ${pins} |`;
    });
  if (rows.length) out.push('Here\'s which pin does what:', '', '| Part | Pin(s) |', '|------|--------|', ...rows, '');
  if (b.id === 'esp32') out.push('The pins were picked to stay clear of the ESP32\'s awkward ones: GPIO 6–11 are wired to the flash memory, GPIO 34–39 can only read, and a few "strapping" pins (like GPIO 12) affect how the chip boots.', '');
  if (b.id === 'pico' && c.features.some((f) => ['pot', 'ldr', 'ntc', 'soil'].includes(f.kind))) out.push('Analog parts go on GP26–GP28, the only Pico pins that can measure voltages; everything else uses plain GPIO pins near the top of the board.', '');
  if (b.id === 'pico' && !c.features.some((f) => ['pot', 'ldr', 'ntc', 'soil'].includes(f.kind))) out.push('Any Pico GPIO can do on/off and PWM, so the parts simply take the first free pins near the top of the board, leaving GP0/GP1 (the serial port) alone.', '');
  if (b.id === 'rpi4') out.push('On the Raspberry Pi, I2C and SPI live on fixed pins, so those were reserved first and simple on/off parts got the plain GPIOs.', '');
  const checks = runChecks(c.project);
  const errs = checks.filter((r) => r.severity === 'error').length;
  const warns = checks.filter((r) => r.severity === 'warning');
  out.push(
    errs
      ? `Sparkbench's design checker still flags ${plural(errs, 'problem', { words: true })} — see the build guide before you power up.`
      : warns.length
        ? `Sparkbench's design checker found no errors, and ${plural(warns.length, 'thing', { words: true })} worth knowing about: ${listJoin(warns.map((w) => `“${w.title}”`))}. The build guide explains ${warns.length === 1 ? 'it' : 'them'}.`
        : 'Sparkbench\'s design checker went over every connection — voltages, pin capabilities, resistor values and the current budget — and found nothing to fix.',
    '',
  );
  return out;
}

function codeSectionBlog(c: Ctx): string[] {
  const out: string[] = [];
  const b = c.board!;
  const files = Object.keys(c.project.files ?? {});
  out.push('## The code', '');
  const extra = files.filter((f) => f !== 'main.py');
  out.push(`The firmware is written in ${b.language === 'micropython' ? 'MicroPython, a version of Python that runs directly on the microcontroller' : 'Python 3 with the gpiozero library, which turns pins into friendly objects like `Button` and `LED`'}. ${extra.length ? `It's split into ${plural(files.length, 'file', { words: true })}: \`main.py\` is the program itself, and ${listJoin(extra.map((f) => `\`${f}\``))} ${extra.length === 1 ? 'is a driver that knows' : 'are drivers that know'} how to talk to the hardware.` : 'Everything lives in a single file, `main.py`.'}`, '');
  const main = c.main;
  if (c.project.codeCustom || !main.includes('# ---- main loop ----')) {
    out.push('This project\'s main.py has been customised, so here is how it starts:', '', '```python', main.split('\n').slice(0, 40).join('\n'), '```', '');
    return out;
  }
  const setup = codeSection(main, 'hardware setup').join('\n');
  out.push('### Setting up the hardware', '', 'The first job is to tell the program what is connected where. Each line creates an object for one part, using the pin numbers from the wiring:', '', '```python', setup, '```', '');
  const ex = setupExplainers(c, setup);
  if (ex.length) out.push(...ex.map((x) => `- ${x}`), '');
  const settings = codeSection(main, 'settings you can tweak').filter((l) => l.trim());
  if (settings.length > 1) out.push(`Near the top there's also a small block of settings (${listJoin(settings.map((l) => `\`${l.split('=')[0].trim()}\``))}) so you can change thresholds without digging through the code.`, '');
  const helper = pickHelper(main);
  if (helper) out.push('### A closer look at a helper', '', helper.why, '', '```python', helper.code, '```', '');
  const loopMs = c.settings.LOOP_MS ?? 50;
  out.push('### The main loop', '', `Microcontroller programs usually end in a \`while True:\` loop that runs forever. This one goes round roughly ${Math.round(1000 / (loopMs + 5))} times a second: read the inputs, decide what to do, update the outputs, then sleep for ${loopMs} ms.`, '', '```python', quoteLoop(main), '```', '');
  const notes: string[] = [];
  if (!c.project.codeCustom && /ticks_diff|now_ms\(\) -/.test(main)) notes.push('Instead of sleeping for seconds at a time, the loop checks the clock to decide when to do slow jobs (like printing once a second). That keeps everything else responsive.');
  if (main.includes('last_dht')) notes.push('The DHT22 is only read every 2 seconds, because asking it more often just returns errors.');
  if (main.includes('_edge.pressed()')) notes.push('Button presses come through the `Edge` helper, so one press is one action, no matter how long you hold the button down.');
  if (main.includes('frame % 5 == 0')) notes.push('The LCD only gets refreshed every fifth time round the loop — character LCDs are slow, and redrawing them constantly makes them flicker.');
  if ((main.match(/scale\(/g) ?? []).length > 1) notes.push('`scale()` works like Arduino\'s `map()`: it converts a reading from one range (say 0–100 %) to another (say 0–180°).');
  if (notes.length) out.push(...notes.map((x) => `- ${x}`), '');
  return out;
}

function simSection(c: Ctx): string[] {
  const out: string[] = ['## Try it in the Sparkbench simulator', ''];
  out.push(`You don't need any hardware to play with this design. Open it in Sparkbench and press **▶ Run**${c.board ? ' — the simulator runs the very same main.py, so anything you change in the code shows up immediately.' : ' — the circuit solver works out every voltage and current in real time.'}`, '');
  const bs = behaviours(c);
  const items = [...new Set(bs.map((be) => be.sim).filter(Boolean) as string[])];
  if (items.length) out.push(...items.map((x) => `- ${x}`), '');
  const outputs = bs.filter((be) => be.feature && !SENSOR_KINDS.includes(be.feature.kind) && be.feature.kind !== 'button').map((be) => be.does);
  if (c.board && outputs.length) out.push(`As you play, watch the outputs react. ${outputs.slice(0, 2).join(' ')}`, '');
  if (c.board) {
    const knob = Object.keys(c.settings).find((k) => k !== 'LOOP_MS');
    out.push(`Keep an eye on the serial console too: ${c.project.codeCustom ? 'it shows everything the program prints' : 'once a second it prints what the board is seeing'}. Then try editing ${knob ? `a setting such as \`${knob}\`` : 'the code'} and running it again — it's the quickest way to learn what each line does.`, '');
  }
  return out;
}

function mistakesSection(c: Ctx): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const p of c.project.parts) {
    if (seen.has(p.type)) continue;
    seen.add(p.type);
    const t = p.type === 'ne555' && analyze555(c.project)?.tone ? '**No sound:** check the chip\'s notch/dot (pin 1), that the button connects pin 4 (RESET) to + when pressed, and that the buzzer is a passive piezo.' : TROUBLE[p.type]?.[0];
    if (t) items.push(t);
  }
  if (c.board) items.push(BOARD_TROUBLE[c.board.id]?.[0] ?? '');
  const picked = items.filter(Boolean).slice(0, 4);
  if (!picked.length) return [];
  return ['## If it doesn\'t work first time', '', 'It almost never does — that\'s normal, and finding the problem is half the fun. These are the usual suspects:', '', ...picked.map((x) => `- ${x}`), ''];
}

function buildTipsSection(c: Ctx): string[] {
  const out: string[] = ['## Building it for real', ''];
  const nWires = c.project.wires.length;
  out.push(`All the parts together cost around ${formatUsd(bomTotal(c.bom))}, and the whole thing fits on ${c.project.board === 'esp32' ? 'one full-size breadboard' : 'a breadboard'} with ${plural(nWires, 'jumper wire')}. No soldering is needed. The build guide has a numbered wiring table${c.board && c.board.id !== 'esp32' ? ' with physical header pin numbers' : ''} and step-by-step instructions, but here are the tips that save the most head-scratching:`, '');
  const tips: string[] = ['Wire the power rails first, and stick to red/orange for power and black for ground.'];
  const seen = new Set<string>();
  for (const p of c.project.parts) {
    if (seen.has(p.type)) continue;
    seen.add(p.type);
    const n = safeDef(p.type)?.buildNotes?.[0];
    if (n) tips.push(n);
  }
  if (c.board) tips.push(c.board.id === 'rpi4' ? 'Do all the wiring with the Pi shut down and unplugged.' : 'Use a proper USB *data* cable; charge-only cables are the number one reason a board "isn\'t detected".');
  out.push(...tips.slice(0, 6).map((t) => `- ${t}`), '');
  if (c.board) out.push(c.board.language === 'micropython' ? `To load the code, flash MicroPython onto the ${c.board.short} once, then copy the project files across with \`mpremote\`. From then on, main.py runs every time the board powers up.` : 'To run the code, copy the project folder onto the Pi and start it with `python3 main.py`.', '');
  return out;
}

function ideasSection(c: Ctx): string[] {
  const kinds = [...new Set(c.features.map((f) => f.kind))];
  // Custom programs may already do the stock ideas, so only suggest hardware additions for them.
  const ideas = c.project.codeCustom ? [] : (kinds.map((k) => FEATURE_IDEAS[k]).filter(Boolean) as string[]);
  const tone = !!analyze555(c.project)?.tone;
  const picked = tone
    ? ['Swap R2 for a 100 kΩ potentiometer (wired as a variable resistor) to make a pitch knob — a tiny synthesiser.', 'Add a second 555 running slowly (like the 555 blinker) and use its output to drive this one\'s RESET pin: the beeper turns into a pulsing alarm.', 'Add an LED and 470 Ω resistor from the output to GND so you can see when it is sounding.']
    : [...ideas.slice(0, 3), c.board || kinds.includes('astable555') ? BOARD_IDEAS[c.project.board] : ''].filter(Boolean);
  if (c.board && !kinds.includes('buzzer')) picked.push('Add a buzzer so it can tell you when something happens — just ask Sparkbench to "add a buzzer".');
  if (c.board && !kinds.some((k) => k === 'oled' || k === 'lcd')) picked.push('Add a small OLED screen to show what\'s going on without a computer attached.');
  if (!c.board) picked.push(`Build the same thing with a microcontroller: ask Sparkbench for ${tone ? '"a Pico with a button and a buzzer"' : kinds.includes('astable555') ? '"a Pico LED blinker"' : '"a Pico with a button and an LED"'} and compare the two approaches.`);
  return ['## Ideas to take it further', '', ...picked.slice(0, 5).map((x) => `- ${x}`), ''];
}

function conceptsLearned(c: Ctx): string[] {
  const kinds = new Set(c.features.map((f) => f.kind));
  const out: string[] = [];
  if (['oled', 'lcd', 'mpu6050'].some((k) => kinds.has(k as FeatureKind))) out.push('the I2C bus');
  if (kinds.has('led') || kinds.has('rgb')) out.push('current-limiting resistors');
  if (['pot', 'ldr', 'ntc', 'soil'].some((k) => kinds.has(k as FeatureKind))) out.push('analog inputs');
  if (kinds.has('hcsr04') || kinds.has('ldr') || kinds.has('ntc')) out.push('voltage dividers');
  if (kinds.has('button')) out.push('pull-up resistors', 'debouncing');
  if (['led', 'buzzer', 'servo', 'rgb'].some((k) => kinds.has(k as FeatureKind))) out.push('PWM');
  out.push('the read–decide–act loop at the heart of almost every gadget');
  return out;
}

/** A full, friendly blog post (Markdown) about the project. */
export function buildBlogPost(project: Project, opts: { schematicSvgPath?: string } = {}): string {
  const c = analyze(project);
  const kinds = new Set<FeatureKind>(c.features.map((f) => f.kind));
  const schematic = opts.schematicSvgPath ?? 'schematic.svg';
  const tone555 = !!analyze555(project)?.tone;
  const tag = tone555 ? 'a beeper made from a 555 timer, a button and a piezo — no code at all' : project.codeCustom ? undefined : matchByKinds(TAGLINES, kinds);
  const total = formatUsd(bomTotal(c.bom));
  const out: string[] = [];
  out.push(`# Build ${withArticle(project.name)}${tag ? `: ${tag}` : ''}`, '');
  out.push(`*${capFirst(designPhrase(c))} — designed with Sparkbench, with ${c.board ? 'schematic, code and simulation' : 'schematic and simulation'} included.*`, '');
  const hook = (tone555 ? 'Before microcontrollers were everywhere, clever little circuits did all the work on their own. The 555 timer, designed in 1971, is still made by the billion — and with two resistors and a capacitor it will sing.' : undefined) ?? matchByKinds(HOOKS, kinds) ?? (c.board ? 'There\'s a special kind of joy in building a gadget that actually does something.' : 'Before microcontrollers were everywhere, clever little circuits did all the work on their own. They still can.');
  const others = project.parts.filter((p) => p.id !== c.boardId).length;
  out.push(hook, '');
  out.push(
    c.board
      ? `In this post we'll build ${withArticle(project.name)} around ${withArticle(c.board.name)}. Besides the board it uses ${plural(others, 'part', { words: others <= 12 })}, a breadboard and some jumper wires — no soldering, and about ${total} in parts. I'll explain what every part does, how it's all wired, and walk through the code, so even if you've never touched electronics before you'll know exactly what's going on by the end.`
      : `In this post we'll build ${withArticle(project.name)} from just ${plural(others, 'part', { words: others <= 12 })} and a breadboard, for about ${total}. No microcontroller, no code — just a battery and a little bit of physics. I'll explain what every part does and how to work out the numbers yourself.`,
    '',
  );
  out.push('## What it does', '', ...behaviours(c).map((be) => `- ${be.does}`), '');
  out.push('## Meet the parts', '', ...blogPartsSection(c));
  out.push(...circuitSection(c, schematic));
  const net = netSetup(c);
  if (net.length) out.push('## Connecting it to the internet', '', ...net);
  out.push('## Parts list', '', '| Qty | Part | Approx. price |', '|----:|------|------:|');
  for (const l of c.bom) out.push(`| ${l.quantity} | ${l.name}${l.value && !l.name.includes(l.value) ? ` (${l.value})` : ''}${l.optional ? ' *(recommended)*' : ''} | ${formatUsd(l.linePrice)} |`);
  out.push(`| | **Total** | **${total}** |`, '');
  out.push('Prices are rough single-unit estimates; a starter kit with a breadboard, jumpers, resistors and LEDs usually works out cheaper. The Sparkbench parts list has supplier search links for every line.', '');
  if (c.board) out.push(...codeSectionBlog(c));
  else {
    out.push('## Look, no code!', '');
    out.push(`There's nothing to flash and nothing to install. The behaviour comes entirely from the values of the parts, which makes this a great way to understand what microcontrollers do for us: everything this circuit does with a handful of components, a microcontroller would do with ${kinds.has('astable555') ? 'a timer and a few lines of code' : 'an `if` statement and a GPIO pin'}. Knowing both ways makes you a better builder.`, '');
  }
  out.push(...simSection(c));
  out.push(...buildTipsSection(c));
  out.push(...mistakesSection(c));
  out.push(...ideasSection(c));
  out.push('## Wrapping up', '');
  out.push(
    c.board
      ? `That's it: ${withArticle(project.name)} for about ${total}, built around ${designPhrase(c)}. Along the way you've met ${listJoin(conceptsLearned(c))}. Once it works, change something: tweak a threshold, swap a part, add a feature. That's where the real learning happens — and if you build one, I'd love to see it.`
      : `That's it: ${withArticle(project.name)} for about ${total}, with no code at all. Try changing the ${c.project.parts.some((p) => p.type === 'capacitor' || p.type === 'electrolytic') ? 'resistor and capacitor values' : 'resistor values'} and predicting what will happen before you power it up — it's the best way to build an intuition for electronics.`,
    '',
  );
  return piify(project, out.join('\n').replace(/\n{3,}/g, '\n\n'));
}

// ==================================================================== AI chat summary

/** 3–6 sentence plain-English explanation of what was designed and why (for the AI reply). */
export function explainDesign(project: Project): string {
  const c = analyze(project);
  const b = c.board;
  const s: string[] = [];
  const checkLine = () => {
    const sum = checkSummary(runChecks(project));
    return sum === 'No wiring problems found.' ? 'The design checks found no wiring problems.' : `The design checks found ${lowerFirst(sum)}`;
  };
  if (!b) {
    const a = analyze555(project);
    if (a) {
      s.push(`I designed ${withArticle(project.name)}: a 555 timer circuit running from a 9 V battery, with no microcontroller and no code.`);
      if (a.tone) s.push(`The ${ohm(a.r1)} and ${ohm(a.r2)} resistors and the ${formatFarads(a.c)} capacitor make it oscillate at about ${fmtHz(a.f)}, which the piezo buzzer plays as a tone while you hold the button (the button lifts the 555's RESET pin).`);
      else s.push(`The ${ohm(a.r1)} and ${ohm(a.r2)} resistors and the ${formatFarads(a.c)} capacitor set the timing, so the LED blinks at about ${fmtHz(a.f)} (on for ${fmtS(a.tHigh)}, off for ${fmtS(a.tLow)}).`);
      if (a.rLed) s.push(`A ${ohm(a.rLed)} resistor limits the LED current to a safe ${Math.round(((a.v - 1.7 - 2) / a.rLed) * 1000)} mA or so.`);
      s.push(a.tone ? 'For a higher pitch, use a smaller capacitor or smaller resistors.' : 'To make it blink faster, use a smaller capacitor or smaller resistors.');
    } else {
      const t = transistorValues(project);
      s.push(`I designed ${withArticle(project.name)}: a push button that switches an LED through an NPN transistor, powered by a 9 V battery.`);
      if (t) s.push(`The ${ohm(t.rb)} base resistor lets only about ${t.ib.toFixed(1)} mA into the transistor, which switches roughly ${Math.round(t.ic)} mA through the LED and its ${ohm(t.rl)} resistor.`);
      s.push('This is the same trick microcontrollers use to drive things that need more current than a pin can give.');
    }
    s.push(checkLine());
    return s.slice(0, 6).join(' ');
  }
  const fs = c.features;
  s.push(`I designed ${withArticle(project.name)}: ${designPhrase(c)}.`);
  const i2c = fs.filter((f) => ['oled', 'lcd', 'mpu6050'].includes(f.kind));
  if (i2c.length) s.push(`${capFirst(listJoin(i2c.map((f) => featureName(f))))} ${i2c.length > 1 ? 'share' : 'uses'} the I2C bus: SDA on ${boardPinText(b, b.i2c.sda)} and SCL on ${boardPinText(b, b.i2c.scl)}${i2c.length > 1 ? ', each at its own address' : ''}.`);
  const pinBits = fs
    .filter((f) => !['oled', 'lcd', 'mpu6050'].includes(f.kind))
    .map((f) => {
      if (f.mcpChannel !== undefined) return `${featureName(f)} on MCP3008 channel ${f.mcpChannel}`;
      const pins = Object.entries(f.pins);
      if (!pins.length) return '';
      return `${featureName(f)}${pins.length === 1 ? ` on ${boardPinText(b, pins[0][1])}` : ' with ' + listJoin(pins.map(([sig, p]) => `${sig.toUpperCase()} on ${boardPinText(b, p)}`))}`;
    })
    .filter(Boolean);
  if (pinBits.length) {
    const why = b.id === 'esp32' ? ', steering clear of the ESP32\'s boot-strapping and input-only pins where possible' : b.id === 'pico' && fs.some((f) => ['pot', 'ldr', 'ntc', 'soil'].includes(f.kind)) ? ', with analog parts on the Pico\'s ADC pins (GP26–28)' : '';
    const list = pinBits.length > 5 ? `${pinBits.slice(0, 5).join(', ')} and ${plural(pinBits.length - 5, 'more part', { words: true })} on the next free pins` : listJoin(pinBits);
    s.push(`I put ${list}${why}.`);
  }
  const why: string[] = [];
  const leds = fs.filter((f) => f.kind === 'led');
  if (leds.length) {
    const ohms = [...new Set(leds.map((f) => Number(c.parts.get(f.parts[1])?.props.ohms)).filter(Boolean))];
    why.push(leds.length > 1 ? `each LED has its own resistor (${listJoin(ohms.map(ohm), 'or')}${ohms.length > 1 ? ', depending on the colour' : ''}) to keep its current to a few milliamps` : `the LED has a ${ohms.map(ohm).join('')} resistor to keep its current to a few milliamps`);
  }
  if (fs.some((f) => f.kind === 'hcsr04')) why.push('the HC-SR04\'s 5 V echo goes through a 1 kΩ/2 kΩ divider so it can\'t harm the 3.3 V pin');
  if (fs.some((f) => f.kind === 'ldr' || f.kind === 'ntc')) why.push(`the ${fs.some((f) => f.kind === 'ldr') ? 'light' : 'temperature'}-sensitive resistor sits in a divider with a 10 kΩ resistor so the board can measure it as a voltage`);
  if (fs.some((f) => f.kind === 'button')) why.push(`the button${fs.filter((f) => f.kind === 'button').length > 1 ? 's use' : ' uses'} the board's internal pull-up, so no extra resistor is needed`);
  if (project.parts.some((p) => p.type === 'mcp3008')) why.push('an MCP3008 converter was added because the Raspberry Pi has no analog inputs');
  if (why.length) s.push(`${capFirst(listJoin(why.slice(0, 3)))}.`);
  const on5 = fs.filter((f) => ['lcd', 'hcsr04', 'pir', 'servo', 'relay', 'neopixel'].includes(f.kind));
  if (on5.length) s.push(`${capFirst(listJoin(on5.map((f) => featureName(f))))} ${on5.length > 1 ? 'run' : 'runs'} from 5 V (${fivePinName(b)}); everything else uses 3.3 V.`);
  s.push(checkLine());
  while (s.length > 6) s.splice(s.length - 2, 1);
  return s.join(' ');
}

/** Raspberry Pi programs run on Linux: swap MicroPython-specific advice for the Pi equivalents. */
function piify(project: Project, md: string): string {
  if (project.board !== 'rpi4') return md;
  return md
    .replace(/Type `i2c\.scan\(\)` in the REPL — it should list `\[60\]` \(that's 0x3C\)\./g, 'Run `i2cdetect -y 1` in a terminal — the display should show up as `3c`.')
    .replace(/Run an I2C scan/g, 'Run `i2cdetect -y 1`')
    .replace(/an I2C scan should show 104 \(0x68\)/g, '`i2cdetect -y 1` should show `68`')
    .replace(/`OSError: \[Errno 19\] ENODEV`/g, '`OSError: [Errno 121] Remote I/O error`')
    .replace(/MicroPython's driver also enables the internal pull-up\./g, '')
    .replace(/`mpremote repl`/g, 'the terminal where you ran `python3 main.py`');
}

/** Getting an internet project online: only mentions the settings this project's main.py really has. */
function netSetup(c: Ctx): string[] {
  const b = c.board;
  const main = c.main;
  if (!b || !c.features.some((f) => f.kind === 'internet')) return [];
  const has = (name: string) => new RegExp(`^${name}\\s*=`, 'm').test(main);
  const out: string[] = [];
  if (b.id === 'rpi4') out.push('**Get the Pi online:** the easiest way is to enter your Wi-Fi name and password in Raspberry Pi Imager when you flash the SD card (*Edit settings → Wireless LAN*). On a Pi that is already running, use `sudo raspi-config` → *System Options → Wireless LAN*.');
  else if (has('WIFI_SSID')) out.push('**Enter your Wi-Fi details:** open `main.py` and change `WIFI_SSID` and `WIFI_PASSWORD` near the top to your network name and password. The ESP32 only works with 2.4 GHz Wi-Fi.');
  const extras: string[] = [];
  if (has('LATITUDE')) extras.push('`LATITUDE` and `LONGITUDE` to your town (look them up on open-meteo.com — the weather comes from there, free and without an account)');
  if (has('UTC_OFFSET_H')) extras.push('`UTC_OFFSET_H` to your time zone (hours ahead of or behind UTC, e.g. 1 for Paris in winter, −5 for New York)');
  if (has('CITY_NAME') || has('CITY')) extras.push('the city name shown on screen');
  if (extras.length) out.push(`Also set ${listJoin(extras)}.`);
  return out.length ? [...out.map((x) => x), ''] : [];
}
