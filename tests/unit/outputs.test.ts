import { describe, it, expect } from 'vitest';
import type { CheckResult, FixAction, PinRef, Project } from '../../src/core/types';
import { planFromPrompt } from '../../src/core/planner';
import { partDef } from '../../src/core/parts';
import { BOARDS } from '../../src/core/boards';
import { buildBom, bomToCsv, bomTotal, BOM_CSV_HEADER } from '../../src/core/bom';
import { runChecks } from '../../src/core/checks';
import { buildGuide, buildBlogPost, explainDesign, wireEndLabel, proseWordCount, an, listJoin, plural } from '../../src/core/docs';

const PROMPTS = [
  'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU',
  'raspberry pi plant monitor with soil moisture, relay pump and lcd',
  'pico servo controlled by a knob',
  '555 blinker',
  'esp32 parking sensor with ultrasonic distance, buzzer and 3 leds',
  'transistor button light without microcontroller',
  'Pico traffic light',
  'ESP32 motion alarm with a PIR sensor, a buzzer, a red LED and a button',
  'Raspberry Pi thermostat with a DHT22 temperature sensor, an OLED display and a relay for a fan',
  'Pico RGB mood light with an RGB LED and a knob',
  'ESP32 with a neopixel ring that shows the temperature from a DHT22',
  'raspberry pi with a knob, light sensor and 2 leds',
];

const projects = new Map<string, Project>(PROMPTS.map((p) => [p, planFromPrompt(p)]));
const plan = (p: string) => structuredClone(projects.get(p) ?? planFromPrompt(p));

/** Minimal RFC 4180 parser (quoted fields, doubled quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') continue;
    else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const BAD_TEXT = /undefined|NaN|\[object|null\b/;

describe('BOM', () => {
  for (const prompt of PROMPTS) {
    it(`prices and groups "${prompt}"`, () => {
      const p = plan(prompt);
      const bom = buildBom(p);
      expect(bomTotal(bom)).toBeGreaterThan(0);
      expect(bomTotal(bom, { supplies: false })).toBeLessThan(bomTotal(bom));
      // every part is counted exactly once
      const counted = bom.filter((l) => l.kind === 'part').reduce((s, l) => s + l.quantity, 0);
      expect(counted).toBe(p.parts.length);
      if (p.board !== 'none') expect(bom.some((l) => l.type === BOARDS[p.board as 'esp32'].partType)).toBe(true);
      for (const l of bom) {
        expect(l.linePrice).toBeCloseTo(l.unitPrice * l.quantity, 5);
        expect(l.suppliers.length).toBeGreaterThanOrEqual(4);
        expect(l.suppliers.map((s) => s.name)).toEqual(expect.arrayContaining(['DigiKey', 'Mouser', 'AliExpress']));
        for (const s of l.suppliers) expect(s.url).toMatch(/^https:\/\/[^\s]+$/);
        if (l.kind === 'part') expect(l.references).toBe(l.refs.join(', '));
      }
      // CSV round-trips
      const rows = parseCsv(bomToCsv(bom));
      expect(rows[0]).toEqual(BOM_CSV_HEADER);
      expect(rows.length).toBe(bom.length + 1);
      for (const r of rows) expect(r.length).toBe(BOM_CSV_HEADER.length);
      expect(rows.slice(1).map((r) => r[2])).toEqual(bom.map((l) => l.name));
      // Optional extras are listed in the CSV but not counted in the "must buy" total.
      expect(rows.slice(1).reduce((s, r) => s + Number(r[8]), 0)).toBeCloseTo(bomTotal(bom, { optional: true }), 2);
      expect(rows.slice(1).filter((r) => !/optional/.test(r.join(','))).reduce((s, r) => s + Number(r[8]), 0)).toBeCloseTo(bomTotal(bom), 2);
    });
  }
  it('groups identical resistors and lists their references', () => {
    const bom = buildBom(plan('Pico traffic light'));
    const r = bom.find((l) => l.type === 'resistor' && l.value === '220Ω')!;
    expect(r.quantity).toBe(3);
    expect(r.references).toMatch(/^R\d+, R\d+, R\d+$/);
    expect(r.suppliers[0].url).toContain(encodeURIComponent('220 ohm resistor'));
    // LEDs of different colours are separate lines
    expect(bom.filter((l) => l.type === 'led').length).toBe(3);
  });
  it('adds the beginner supplies each board needs', () => {
    const keys = (p: string) => buildBom(plan(p)).filter((l) => l.kind === 'supply').map((l) => l.key);
    expect(keys('pico servo controlled by a knob')).toEqual(expect.arrayContaining(['supply:breadboard', 'supply:jumpers-mm', 'supply:usb-micro']));
    expect(keys('raspberry pi plant monitor with soil moisture, relay pump and lcd')).toEqual(expect.arrayContaining(['supply:usb-c-psu', 'supply:microsd', 'supply:jumpers-fm']));
    expect(keys('555 blinker')).toEqual(expect.arrayContaining(['supply:9v-snap', 'supply:breadboard']));
    expect(keys('555 blinker')).not.toContain('supply:usb-micro');
    const esp = buildBom(plan('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU'));
    expect(esp.find((l) => l.key === 'supply:breadboard')!.name).toMatch(/830/);
  });
});

describe('build guide, blog post and explanation', () => {
  for (const prompt of PROMPTS) {
    it(`reads well for "${prompt}"`, () => {
      const p = plan(prompt);
      const guide = buildGuide(p);
      const blog = buildBlogPost(p);
      const explain = explainDesign(p);
      for (const text of [guide, blog, explain]) expect(text).not.toMatch(BAD_TEXT);
      // a wiring-table row for every wire, with both ends
      const wiring = guide.slice(guide.indexOf('## Wiring table'), guide.indexOf('## Step-by-step assembly'));
      const rows = wiring.split('\n').filter((l) => /^\| \d+ \|/.test(l));
      expect(rows.length).toBe(p.wires.length);
      p.wires.forEach((w, i) => {
        const row = rows.find((r) => r.startsWith(`| ${i + 1} |`))!;
        expect(row).toBeTruthy();
        expect(row).toContain(wireEndLabel(p, w.a));
        expect(row).toContain(wireEndLabel(p, w.b));
      });
      // physical header pins for the Pi / Pico
      if (p.board === 'rpi4' || p.board === 'pico') expect(rows.some((r) => /\(pin \d+\)/.test(r))).toBe(true);
      // guide sections
      for (const h of ['## What you need', '## Safety first', '## Wiring table', '## Step-by-step assembly', '## Test it', '## Troubleshooting']) expect(guide).toContain(h);
      if (p.board === 'none') expect(guide).toContain('## How it works');
      else {
        expect(guide).toContain('## Load the program');
        for (const f of Object.keys(p.files)) expect(guide).toContain(`\`${f}\``);
      }
      // blog: every part type mentioned by name, schematic, code, sensible length
      for (const type of new Set(p.parts.map((x) => x.type))) expect(blog).toContain(partDef(type).name);
      expect(blog).toContain('![Schematic](schematic.svg)');
      if (p.board !== 'none') expect(blog).toContain('```python');
      const words = proseWordCount(blog);
      expect(words).toBeGreaterThan(1000);
      expect(words).toBeLessThan(2400);
      expect(blog).not.toMatch(/\b(a|an) (a|an|the)\b/i);
      expect(blog).not.toMatch(/\b(\w+) \1\b/i); // doubled words ("the the", "while while")
      expect(blog).not.toMatch(/\ba (?!one|use|uni|eu)[aeiou]\w*\b/); // "a IMU" / "a LED" style article mistakes (lower-case words)
      // explanation: 3–6 sentences
      const sentences = explain.split(/(?<=[.!?])\s+(?=[A-Z])/);
      expect(sentences.length).toBeGreaterThanOrEqual(3);
      expect(sentences.length).toBeLessThanOrEqual(6);
      expect(explain).toContain(p.name);
    });
  }
  it('uses the actual 555 component values', () => {
    const p = plan('555 blinker');
    expect(buildGuide(p)).toMatch(/≈ \*\*1\.38 Hz\*\*/);
    const r2 = p.parts.find((x) => x.label === 'R2 (timing)')!;
    r2.props.ohms = 22000;
    expect(buildGuide(p)).toMatch(/≈ \*\*2\.67 Hz\*\*/);
    expect(explainDesign(p)).toContain('22kΩ');
  });
  it('takes a custom schematic path', () => {
    expect(buildBlogPost(plan('pico servo controlled by a knob'), { schematicSvgPath: 'img/s.svg' })).toContain('![Schematic](img/s.svg)');
  });
  it('language helpers', () => {
    expect(an('LED')).toBe('an');
    expect(an('ESP32 DevKit V1')).toBe('an');
    expect(an('NeoPixel ring')).toBe('a');
    expect(an('IMU')).toBe('an');
    expect(an('Raspberry Pi Pico')).toBe('a');
    expect(an('555 LED Blinker')).toBe('a');
    expect(an('OLED display')).toBe('an');
    expect(listJoin(['a', 'b', 'c'])).toBe('a, b and c');
    expect(plural(1, 'LED')).toBe('1 LED');
    expect(plural(3, 'switch', { words: true })).toBe('three switches');
  });
});

// ---------------------------------------------------------------- design checks

const ids = (rs: CheckResult[]) => rs.map((r) => r.id);
const errors = (p: Project) => runChecks(p).filter((r) => r.severity === 'error');
const findWire = (p: Project, part: string, pin: string) => p.wires.find((w) => (w.a.part === part && w.a.pin === pin) || (w.b.part === part && w.b.pin === pin))!;
/** Point the end of `wire` that is NOT (part, pin) somewhere else. */
function moveOtherEnd(p: Project, part: string, pin: string, to: PinRef) {
  const w = findWire(p, part, pin);
  if (w.a.part === part && w.a.pin === pin) w.b = to;
  else w.a = to;
}
function removePart(p: Project, id: string) {
  p.parts = p.parts.filter((x) => x.id !== id);
  p.wires = p.wires.filter((w) => w.a.part !== id && w.b.part !== id);
}
let wn = 1000;
const addWire = (p: Project, a: PinRef, b: PinRef) => p.wires.push({ id: `wx${wn++}`, a, b });

/** Apply a fix the way the UI would, so tests can prove the fix actually fixes the problem. */
function applyFix(p: Project, action: FixAction) {
  switch (action.kind) {
    case 'add-wire':
      addWire(p, action.a, action.b);
      break;
    case 'remove-wire':
      p.wires = p.wires.filter((w) => w.id !== action.wireId);
      break;
    case 'move-wire-end': {
      const w = p.wires.find((x) => x.id === action.wireId)!;
      w[action.end] = action.to;
      break;
    }
    case 'insert-resistor': {
      const w = p.wires.find((x) => x.id === action.wireId)!;
      const id = `rfix${wn++}`;
      p.parts.push({ id, type: 'resistor', ref: 'R99', props: { ohms: action.ohms }, x: 0, y: 0 });
      const b = w.b;
      w.b = { part: id, pin: '1' };
      addWire(p, { part: id, pin: '2' }, b);
      break;
    }
  }
}
function expectFlagged(p: Project, idPrefix: string, severity: CheckResult['severity'] = 'error'): CheckResult {
  const r = runChecks(p).find((x) => x.id.startsWith(idPrefix));
  expect(r, `expected a check starting with ${idPrefix}; got ${ids(runChecks(p)).join(', ')}`).toBeTruthy();
  expect(r!.severity).toBe(severity);
  expect(r!.title.length).toBeGreaterThan(10);
  expect(r!.detail.length).toBeGreaterThan(30);
  expect(r!.title + r!.detail).not.toMatch(BAD_TEXT);
  return r!;
}
function expectFixWorks(p: Project, r: CheckResult) {
  expect(r.fix, `no fix offered for ${r.id}`).toBeTruthy();
  applyFix(p, r.fix!.action);
  expect(ids(runChecks(p))).not.toContain(r.id);
}

describe('design checks', () => {
  for (const prompt of PROMPTS) {
    it(`finds no errors in the planner's design for "${prompt}"`, () => {
      const rs = runChecks(plan(prompt));
      expect(rs.filter((r) => r.severity === 'error')).toEqual([]);
      // sorted errors → warnings → info
      const order = { error: 0, warning: 1, info: 2 };
      for (let i = 1; i < rs.length; i++) expect(order[rs[i].severity]).toBeGreaterThanOrEqual(order[rs[i - 1].severity]);
    });
  }

  it('flags an LED wired straight to a GPIO, and the fix inserts a resistor', () => {
    const p = plan('Pico traffic light');
    const led = p.parts.find((x) => x.type === 'led')!;
    const res = findWire(p, led.id, 'A');
    const rId = res.a.part === led.id ? res.b.part : res.a.part;
    const gpio = findWire(p, rId, '1');
    const gpioPin = gpio.a.part === rId ? gpio.b : gpio.a;
    removePart(p, rId);
    addWire(p, gpioPin, { part: led.id, pin: 'A' });
    const r = expectFlagged(p, `led-no-resistor:${led.id}`);
    expect(r.fix!.action.kind).toBe('insert-resistor');
    expectFixWorks(p, r);
    expect(errors(p)).toEqual([]);
  });

  it('flags a backwards LED', () => {
    const p = plan('Pico traffic light');
    const led = p.parts.find((x) => x.type === 'led')!;
    for (const w of p.wires)
      for (const end of ['a', 'b'] as const) if (w[end].part === led.id) w[end] = { part: led.id, pin: w[end].pin === 'A' ? 'C' : 'A' };
    expectFlagged(p, `led-reversed:${led.id}`);
  });

  it('flags a 5 V module (HC-SR04) on 3.3 V, and the fix moves it to 5 V', () => {
    const p = plan('esp32 parking sensor with ultrasonic distance, buzzer and 3 leds');
    const board = p.parts.find((x) => x.type === 'esp32-devkit')!;
    moveOtherEnd(p, 'hcsr041', 'VCC', { part: board.id, pin: '3V3' });
    const r = expectFlagged(p, 'supply-range:hcsr041:VCC');
    expect(r.title).toMatch(/4\.5 V/);
    expectFixWorks(p, r);
  });

  it('flags a module getting more than its maximum voltage', () => {
    const p = plan('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
    const board = p.parts.find((x) => x.type === 'esp32-devkit')!;
    p.parts.push({ id: 'bat9', type: 'battery-9v', ref: 'BT1', props: { volts: 9 }, x: 0, y: 0 });
    addWire(p, { part: 'bat9', pin: '-' }, { part: board.id, pin: 'GND.2' });
    moveOtherEnd(p, 'ssd13061', 'VCC', { part: 'bat9', pin: '+' });
    const r = expectFlagged(p, 'supply-range:ssd13061:VCC');
    expect(r.title).toMatch(/maximum/);
  });

  it('flags the HC-SR04 5 V echo going straight into a 3.3 V pin', () => {
    const p = plan('esp32 parking sensor with ultrasonic distance, buzzer and 3 leds');
    const board = p.parts.find((x) => x.type === 'esp32-devkit')!;
    removePart(p, 'resistor1');
    removePart(p, 'resistor2');
    addWire(p, { part: 'hcsr041', pin: 'ECHO' }, { part: board.id, pin: 'D13' });
    expectFlagged(p, 'overvoltage:D13:hcsr041');
  });

  it('flags missing ground and unconnected I2C pins, with working add-wire fixes', () => {
    const p = plan('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
    p.wires = p.wires.filter((w) => w !== findWire(p, 'ssd13061', 'GND') && w !== findWire(p, 'ssd13061', 'SDA'));
    const g = expectFlagged(p, 'no-ground:ssd13061:GND');
    const s = expectFlagged(p, 'unconnected:ssd13061:SDA');
    expectFixWorks(p, g);
    expectFixWorks(p, s);
    expect(errors(p)).toEqual([]);
  });

  it('flags a module with no power', () => {
    const p = plan('pico servo controlled by a knob');
    p.wires = p.wires.filter((w) => w !== findWire(p, 'servo1', 'V+'));
    const r = expectFlagged(p, 'no-power:servo1:V+');
    expectFixWorks(p, r);
  });

  it('flags input-only ESP32 pins used for outputs and for buttons without a pull-up', () => {
    const p = plan('esp32 parking sensor with ultrasonic distance, buzzer and 3 leds');
    const led = p.parts.find((x) => x.type === 'led')!;
    const ra = findWire(p, led.id, 'A');
    const rId = ra.a.part === led.id ? ra.b.part : ra.a.part;
    const board = p.parts.find((x) => x.type === 'esp32-devkit')!;
    moveOtherEnd(p, rId, '1', { part: board.id, pin: 'D34' });
    const r = expectFlagged(p, `input-only:D34:${led.id}`);
    expect(r.fix!.action.kind).toBe('move-wire-end');
    expectFixWorks(p, r);

    const q = plan('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
    moveOtherEnd(q, 'pushbutton1', '1', { part: 'esp32devkit1', pin: 'D35' });
    const b = expectFlagged(q, 'no-pullup:D35');
    expectFixWorks(q, b);
  });

  it('warns about strapping pins', () => {
    const p = plan('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
    moveOtherEnd(p, 'pushbutton1', '1', { part: 'esp32devkit1', pin: 'D12' });
    expectFlagged(p, 'caution-pin:D12', 'warning');
  });

  it('flags GPIOs shorted to GND or to each other, and 3V3 shorted to GND', () => {
    const p = plan('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
    addWire(p, { part: 'esp32devkit1', pin: 'D25' }, { part: 'esp32devkit1', pin: 'GND.2' });
    addWire(p, { part: 'esp32devkit1', pin: 'D26' }, { part: 'esp32devkit1', pin: 'D27' });
    expectFlagged(p, 'gpio-to-rail:D25');
    expectFlagged(p, 'gpio-short:');
    const q = plan('pico servo controlled by a knob');
    addWire(q, { part: 'pipico1', pin: '3V3' }, { part: 'pipico1', pin: 'GND.3' });
    const s = expectFlagged(q, 'short:');
    expectFixWorks(q, s);
  });

  it('flags an I2C address clash and fixes an MPU-6050 clash via AD0', () => {
    // The planner refuses to add a second OLED, so build the clash by hand.
    const o = plan('esp32 with an oled screen');
    o.parts.push({ id: 'oled2', type: 'ssd1306', ref: 'DS9', label: 'Second OLED', props: {}, x: 0, y: 0 });
    addWire(o, { part: 'oled2', pin: 'VCC' }, { part: 'esp32devkit1', pin: '3V3' });
    addWire(o, { part: 'oled2', pin: 'GND' }, { part: 'esp32devkit1', pin: 'GND.1' });
    addWire(o, { part: 'oled2', pin: 'SDA' }, { part: 'esp32devkit1', pin: 'D21' });
    addWire(o, { part: 'oled2', pin: 'SCL' }, { part: 'esp32devkit1', pin: 'D22' });
    expectFlagged(o, 'i2c-clash:60');
    const p = plan('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
    p.parts.push({ id: 'imu2', type: 'mpu6050', ref: 'U9', label: 'Second IMU', props: {}, x: 0, y: 0 });
    addWire(p, { part: 'imu2', pin: 'VCC' }, { part: 'esp32devkit1', pin: '3V3' });
    addWire(p, { part: 'imu2', pin: 'GND' }, { part: 'esp32devkit1', pin: 'GND.1' });
    addWire(p, { part: 'imu2', pin: 'SDA' }, { part: 'esp32devkit1', pin: 'D21' });
    addWire(p, { part: 'imu2', pin: 'SCL' }, { part: 'esp32devkit1', pin: 'D22' });
    const r = expectFlagged(p, 'i2c-clash:104');
    expectFixWorks(p, r);
  });

  it('flags I2C on the wrong Raspberry Pi pins, and swapped SDA/SCL', () => {
    const p = plan('raspberry pi plant monitor with soil moisture, relay pump and lcd');
    moveOtherEnd(p, 'lcd16021', 'SDA', { part: 'rpi41', pin: 'GPIO17' });
    const r = expectFlagged(p, 'i2c-pin:lcd16021:SDA');
    expectFixWorks(p, r);
    const q = plan('ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
    moveOtherEnd(q, 'ssd13061', 'SDA', { part: 'esp32devkit1', pin: 'D22' });
    moveOtherEnd(q, 'ssd13061', 'SCL', { part: 'esp32devkit1', pin: 'D21' });
    expectFlagged(q, 'i2c-swapped:ssd13061');
  });

  it('flags analog sensors on pins without an ADC', () => {
    const p = plan('pico servo controlled by a knob');
    moveOtherEnd(p, 'potentiometer1', 'SIG', { part: 'pipico1', pin: 'GP5' });
    const r = expectFlagged(p, 'not-adc:GP5:potentiometer1');
    expectFixWorks(p, r);
    const q = plan('raspberry pi with a knob, light sensor and 2 leds');
    const pot = q.parts.find((x) => x.type === 'potentiometer')!;
    moveOtherEnd(q, pot.id, 'SIG', { part: 'rpi41', pin: 'GPIO26' });
    expectFlagged(q, `not-adc:GPIO26:${pot.id}`);
  });

  it('warns about the USB current budget with a big NeoPixel strip', () => {
    const p = plan('ESP32 with a neopixel ring that shows the temperature from a DHT22');
    const ring = p.parts.find((x) => x.type === 'neopixel-ring')!;
    ring.props.pixels = 60;
    const r = expectFlagged(p, 'budget:5v', 'warning');
    expect(r.detail).toMatch(/mA/);
  });

  it('flags floating parts, dangling wires and a reversed electrolytic', () => {
    const p = plan('pico servo controlled by a knob');
    p.parts.push({ id: 'lonely', type: 'led', ref: 'D9', props: { color: 'red' }, x: 0, y: 0 });
    p.wires.push({ id: 'ghost', a: { part: 'gone', pin: '1' }, b: { part: 'pipico1', pin: 'GP9' } });
    expectFlagged(p, 'floating:lonely', 'warning');
    const d = expectFlagged(p, 'dangling-wire:ghost', 'warning');
    expectFixWorks(p, d);
    const q = plan('555 blinker');
    for (const w of q.wires) for (const end of ['a', 'b'] as const) if (w[end].part === 'electrolytic1') w[end] = { part: 'electrolytic1', pin: w[end].pin === '+' ? '-' : '+' };
    expectFlagged(q, 'cap-reversed:electrolytic1');
  });
});
