// Plain-English explanation of one line of firmware, for the code editor's hover tooltip.
// Covers the MicroPython / gpiozero calls and Python constructs Sparkbench programs use, and names
// the part on any pin number ("pin 13 is Button A").
import type { Project } from './types';

type Rule = [RegExp, (m: RegExpMatchArray) => string];

const RULES: Rule[] = [
  [/^\s*#\s*(.*)/, () => 'A comment: a note for people reading the code. The board ignores it.'],
  [/^\s*(import|from)\s+([\w.]+)/, (m) => `Loads the "${m[2]}" library so the program can use what's in it.${LIB[m[2]] ? ` ${LIB[m[2]]}` : ''}`],
  [/^\s*def\s+(\w+)\s*\((.*)\)\s*:/, (m) => `Defines a function called ${m[1]}: a named recipe of steps the program can run whenever it says ${m[1]}(…).${m[2].trim() ? ` It takes: ${m[2].trim()}.` : ''}`],
  [/^\s*class\s+(\w+)/, (m) => `Defines a new kind of object called ${m[1]}, bundling some data with the functions that work on it.`],
  [/^\s*while\s+True\s*:/, () => 'Starts the main loop: everything indented below runs again and again, forever, while the board is powered.'],
  [/^\s*while\s+(.+):/, (m) => `Repeats the indented lines below for as long as ${cond(m[1])}.`],
  [/^\s*for\s+(\w+)\s+in\s+range\((\d+)\)\s*:/, (m) => `Repeats the indented lines ${m[2]} times, counting with ${m[1]} from 0 to ${Number(m[2]) - 1}.`],
  [/^\s*for\s+(.+)\s+in\s+(.+):/, (m) => `Goes through each item in ${m[2].trim()} in turn, calling it ${m[1].trim()}, and runs the indented lines for each.`],
  [/^\s*if\s+(.+):/, (m) => `Only runs the indented lines below if ${cond(m[1])}.`],
  [/^\s*elif\s+(.+):/, (m) => `Otherwise, if ${cond(m[1])}, runs the lines below instead.`],
  [/^\s*else\s*:/, () => 'Otherwise (none of the conditions above were true), runs the lines below.'],
  [/^\s*try\s*:/, () => 'Tries the indented lines; if one fails (for example a sensor doesn’t answer), the program jumps to "except" instead of crashing.'],
  [/^\s*except/, () => 'What to do if something in the "try" block failed, so the program keeps running.'],
  [/^\s*return\b(.*)/, (m) => (m[1].trim() ? `Ends this function and hands back ${words(m[1])}.` : 'Ends this function here.')],
  [/^\s*global\s+(.+)/, (m) => `Says this function changes the shared variable${m[1].includes(',') ? 's' : ''} ${m[1].trim()} (not a private copy).`],
  [/^\s*print\((.*)\)/, () => 'Prints a message to the serial console: the Serial monitor tab here, or the Shell panel in Thonny on the real board.'],
  [/time\.sleep_ms\((\w+)\)|time\.sleep\(([\d.]+)\)/, (m) => `Waits ${m[1] ? `${m[1]} milliseconds` : `${m[2]} seconds`} before carrying on.`],
  [/time\.ticks_ms\(\)/, () => 'Reads a stopwatch: the number of milliseconds since the board started. Used to time things without stopping the program.'],
  [/time\.ticks_diff\(/, () => 'Works out how many milliseconds passed between two stopwatch readings (handles the stopwatch wrapping round).'],
  [/Pin\((\d+),\s*Pin\.IN,\s*Pin\.PULL_UP\)/, () => 'Sets up a pin as an input with its built-in pull-up resistor: it reads 1 normally and 0 when a button connects it to GND.'],
  [/Pin\((\d+),\s*Pin\.IN\)/, () => 'Sets up a pin as an input, to read whether a signal is high (1) or low (0).'],
  [/Pin\((\d+),\s*Pin\.OUT/, () => 'Sets up a pin as an output the program can switch on (3.3 V) or off (0 V).'],
  [/PWM\(Pin\((\d+)\)(?:,\s*freq=(\d+))?/, (m) => `Sets up PWM on pin ${m[1]}: the pin switches on and off very fast${m[2] ? ` (${m[2]} times a second)` : ''}, so the program can set how much power it gets (not just on or off).`],
  [/ADC\(Pin\((\d+)\)\)/, (m) => `Sets up pin ${m[1]} to measure a voltage (analog input), e.g. from a knob or a light sensor.`],
  [/\.atten\(ADC\.ATTN_11DB\)/, () => 'Lets the analog input measure the full 0–3.3 V range.'],
  [/I2C\((\d+),\s*scl=Pin\((\d+)\),\s*sda=Pin\((\d+)\)/, (m) => `Sets up the I2C bus: two shared wires (clock on pin ${m[2]}, data on pin ${m[3]}) that screens and sensors use to talk to the board.`],
  [/SPI\(/, () => 'Sets up the SPI bus: a fast set of wires used by displays like the e-paper screen.'],
  [/\.duty_u16\(([^)]*)\)/, (m) => `Sets how much of each PWM cycle the pin is on: 0 = off, 65535 = fully on${/^\d+$/.test(m[1]) ? ` (here ${Math.round((Number(m[1]) / 65535) * 100)} %)` : ''}.`],
  [/\.read_u16\(\)/, () => 'Reads the analog voltage as a number from 0 (0 V) to 65535 (3.3 V).'],
  [/\.value\(\)/, () => 'Reads the pin: 1 if it is high (3.3 V), 0 if low (0 V).'],
  [/\.value\((0|1|True|False)\)/, (m) => `Switches the pin ${m[1] === '1' || m[1] === 'True' ? 'on (3.3 V)' : 'off (0 V)'}.`],
  [/\.measure\(\)/, () => 'Asks the temperature/humidity sensor to take a new reading (it can only do this every 2 seconds).'],
  [/\.temperature\(\)/, () => 'Gets the last temperature reading, in °C.'],
  [/\.humidity\(\)/, () => 'Gets the last humidity reading, in % relative humidity.'],
  [/\.accel\(\)/, () => 'Reads the accelerometer: how much gravity/acceleration the board feels along x, y and z, in g (1 g = gravity).'],
  [/\.fill\(0\)/, () => 'Clears the whole screen (in memory; show() puts it on the display).'],
  [/\.text\(([^,]+),/, (m) => `Draws the text ${m[1].trim()} on the screen at the given x, y position (in memory until show()).`],
  [/\.show\(\)/, () => 'Sends everything drawn so far to the screen, so it actually appears.'],
  [/\.write\(\)/, () => 'Sends the new colours to the NeoPixel LEDs.'],
  [/time_pulse_us\(/, () => 'Measures how long a pin stays high, in microseconds; the ultrasonic sensor’s echo time tells the distance (about 58 µs per cm).'],
  [/Button\((\d+)/, (m) => `Sets up a button on GPIO${m[1]} (gpiozero handles the pull-up and debouncing for you).`],
  [/PWMLED\((\d+)\)|LED\((\d+)\)/, (m) => `Sets up an LED on GPIO${m[1] ?? m[2]} that the program can turn on, off or dim.`],
  [/AngularServo\((\d+)/, (m) => `Sets up a servo on GPIO${m[1]}; you set its angle in degrees.`],
  [/MCP3008\(channel=(\d+)\)/, (m) => `Reads analog channel ${m[1]} of the MCP3008 chip, because the Raspberry Pi can’t measure voltages by itself.`],
  [/^\s*(\w+)\s*([-+*/])=\s*(.+)$/, (m) => augmented(m[1], m[2], m[3])],
  [/^\s*(\w+)\s*=\s*(-?[\d.]+)\s*$/, (m) => `Stores the number ${m[2]} in a variable called ${m[1]}.`],
  [/^\s*(\w+)\s*=\s*None\s*$/, (m) => `Sets ${m[1]} to nothing yet (None), so the program can tell later whether it has been filled in.`],
  [/^\s*(\w+)\s*=\s*(True|False)\s*$/, (m) => `Sets ${m[1]} to ${m[2] === 'True' ? 'yes (True)' : 'no (False)'}.`],
  [/^\s*(\w+)\s*=\s*(["'].*["'])\s*$/, (m) => `Stores the text ${m[2]} in ${m[1]}.`],
  [/^\s*(\w+)\s*=\s*not\s+\1\s*$/, (m) => `Flips ${m[1]}: yes becomes no and no becomes yes.`],
  [/^\s*(\w+(?:\s*,\s*\w+)*)\s*=\s*(.+)$/, (m) => `Works out ${words(m[2])} and stores it in ${m[1]}, so later lines can use it.`],
];

const LIB: Record<string, string> = {
  machine: 'It controls the board’s hardware: pins, PWM, analog inputs, I2C and SPI.',
  time: 'It handles waiting and timing.',
  ssd1306: 'It’s the driver for the small OLED screen.',
  dht: 'It reads the DHT22 temperature/humidity sensor.',
  mpu6050: 'It reads the MPU-6050 motion sensor.',
  neopixel: 'It controls NeoPixel colour LEDs.',
  network: 'It connects to Wi-Fi.',
  urequests: 'It fetches data from the internet (HTTP).',
  gpiozero: 'It’s the friendly Raspberry Pi library for buttons, LEDs, servos and sensors.',
  math: 'It has maths functions like sqrt and atan2.',
};

const OPS: [RegExp, string][] = [
  [/\s*<=\s*/g, ' is at most '],
  [/\s*>=\s*/g, ' is at least '],
  [/\s*==\s*/g, ' is '],
  [/\s*!=\s*/g, ' is not '],
  [/\s*<\s*/g, ' is below '],
  [/\s*>\s*/g, ' is above '],
  [/\s+not in\s+/g, ' is not one of '],
  [/\s+in\s+(?=\()/g, ' is one of '],
];

/** A short Python condition in words: "phase < 4" → "phase is below 4". */
function cond(c: string): string {
  const range = /^(-?[\w.]+)\s*<=\s*(\w+)\s*<\s*(-?[\w.]+)$/.exec(c.trim());
  if (range) return `${range[2]} is from ${range[1]} up to (but not including) ${range[3]}`;
  let t = c.trim();
  for (const [re, w] of OPS) t = t.replace(re, w);
  return t === c.trim() && !/^not\b/.test(t) ? `${t} is true` : t;
}

/** An expression in words: "1 if phase < 4 else 0" → "1 while phase is below 4, otherwise 0". */
function words(expr: string): string {
  const e = expr.trim();
  const m = /^(.+?)\s+if\s+(.+?)\s+else\s+(.+)$/.exec(e);
  if (m) return `${words(m[1])} while ${cond(m[2])}, otherwise ${words(m[3])}`;
  if (e === 'None') return 'nothing (None)';
  const cyc = /^\((\w+)\s*\/\/\s*1000\)\s*%\s*(\w+)$/.exec(e);
  if (cyc) return `which second of a repeating ${cyc[2]}-second cycle it is (${cyc[1]} in whole seconds, counted round from 0)`;
  return e.length > 70 ? `${e.slice(0, 67)}…` : e;
}

function augmented(name: string, op: string, value: string): string {
  const one = value.trim() === '1';
  if (op === '+') return one ? `Adds 1 to ${name} (counts up by one).` : `Adds ${words(value)} to ${name}.`;
  if (op === '-') return one ? `Takes 1 away from ${name} (counts down by one).` : `Takes ${words(value)} away from ${name}.`;
  return `${op === '*' ? 'Multiplies' : 'Divides'} ${name} by ${words(value)}.`;
}

/** Split a line into code and its trailing # comment (a # inside a string doesn't count). */
export function splitComment(line: string): { code: string; comment: string } {
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '\\') i++;
      else if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '#') return { code: line.slice(0, i).trimEnd(), comment: line.slice(i + 1).trim() };
  }
  return { code: line, comment: '' };
}

const TRIPLE = /"""|'''/g;

/** Functions the program defines itself, with the first line of their docstring (or the comment above). */
function ownFunctions(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = source.split('\n');
  lines.forEach((l, i) => {
    const m = /^\s*def\s+(\w+)\s*\(/.exec(l);
    if (!m) return;
    const next = (lines[i + 1] ?? '').trim();
    const doc = /^("""|''')/.test(next) ? next.replace(TRIPLE, '').trim() : '';
    const above = /^\s*#\s*(?!-)(.+)/.exec(lines[i - 1] ?? '')?.[1] ?? '';
    out.set(m[1], (doc || above).trim());
  });
  return out;
}

/** Is line n (1-based) inside a multi-line docstring? */
function inDocstring(source: string, n: number): boolean {
  let open = false;
  const lines = source.split('\n');
  for (let i = 0; i < n - 1 && i < lines.length; i++) if ((lines[i].match(TRIPLE) ?? []).length % 2) open = !open;
  return open;
}

/** Split call arguments at top-level commas. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let q: string | null = null;
  let cur = '';
  for (const ch of s) {
    if (q) {
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Why this project uses PWM on a pin, by the kind of part on it. */
const PWM_WHY: Partial<Record<string, string>> = {
  led: 'Here it sets how bright {label} is; at 0 % or 100 % it simply switches it off or fully on.',
  buzzer: 'Here the switching speed sets the pitch of {label}, so it can play different notes.',
  servo: 'Here the length of each pulse tells {label} which angle to turn to.',
  rgb: 'Here it mixes colours by setting how bright each colour inside {label} is.',
};

/** The whole file (to find the program's own functions and docstrings) and the line's number (1-based). */
export interface LineContext {
  source: string;
  line: number;
}

/** Explanation for one line, or null if there is nothing useful to say (blank lines). */
export function explainLine(line: string, project?: Project | null, ctx?: LineContext): string | null {
  if (!line.trim()) return null;
  if (/^[rbuf]?("""|''')/i.test(line.trim()) || (ctx && inDocstring(ctx.source, ctx.line))) {
    return 'A description of what this function does (a docstring), written for people reading the code. The board doesn’t run it as a step.';
  }
  const isComment = /^\s*#/.test(line);
  const { code, comment } = isComment ? { code: line, comment: '' } : splitComment(line);
  let text: string | null = null;
  const own = ctx ? ownFunctions(ctx.source) : new Map<string, string>();
  const call = isComment ? null : /^\s*(?:(\w+)\s*=\s*)?(\w+)\((.*)\)\s*$/.exec(code);
  // A call to one of the program's own functions (set_led, colour_for, …).
  if (call && own.has(call[2])) {
    const what = own.get(call[2]);
    const args = splitArgs(call[3]).map(words);
    text = `Runs ${call[2]}, a function defined earlier in this program${what ? ` (${what.replace(/\.$/, '')})` : ''}${args.length ? `, with ${args.join(' and ')}` : ''}${call[1] ? `, and stores its answer in ${call[1]}` : ''}.`;
  }
  if (!text) {
    for (const [re, f] of RULES) {
      const m = code.match(re);
      if (m) {
        text = f(m);
        break;
      }
    }
  }
  if (!text && call) {
    const args = splitArgs(call[3]).map(words);
    text = `Runs ${call[2]}${args.length ? ` with ${args.join(' and ')}` : ''}${call[1] ? ` and stores the answer in ${call[1]}` : ''}.`;
  }
  if (!text) text = 'Runs this step of the program.';
  if (comment) text += ` The note on this line says: “${comment}”.`;
  // Name the part wired to any GPIO number on this line.
  if (project?.features?.length && !isComment) {
    const nums = [...code.matchAll(/(?:Pin\(|GPIO|Button\(|LED\(|PWMLED\(|AngularServo\(|MotionSensor\(|OutputDevice\(|PWMOutputDevice\(|board\.D)(\d+)/g)].map((m) => Number(m[1]));
    const found = [...new Set(nums)]
      .map((n) => {
        const f = project.features!.find((x) => Object.values(x.gpio).includes(n));
        if (!f) return null;
        const sig = Object.entries(f.gpio).find(([, g]) => g === n)?.[0];
        return { f, text: `pin ${n} is ${f.label}${sig && sig !== 'pin' ? ` (${sig.toUpperCase()})` : ''}` };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    if (found.length) text += ` On your board, ${found.map((x) => x.text).join('; ')}.`;
    const why = /PWM\(Pin\(\d+\)/.test(code) && found[0] ? PWM_WHY[found[0].f.kind] : undefined;
    if (why) text += ` ${why.replace('{label}', found[0].f.label)}`;
  }
  return text;
}
