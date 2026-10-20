// The offline design planner: natural language → DesignSpec → wired Project.
// The LLM path (server/ai.ts) produces the same DesignSpec, so both share this builder.
import type { BoardId, DesignSpec, FeatureInstance, FeatureKind, FeatureReq, PartInstance, PinRef, Project, Wire } from './types';
import { BOARDS, type BoardDef, type BoardPin, type Cap } from './boards';
import { defaultProps, partDef } from './parts';
import { annotate } from './netlist';
import { autoLayout, type Group } from './layout';
import { generateFiles } from './codegen';

export class PlanError extends Error {}

// ------------------------------------------------------------------ intent parsing

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, single: 1, two: 2, pair: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, several: 3, few: 3 };

interface KindRule {
  kind: FeatureKind;
  re: RegExp;
  plural?: RegExp;
  defaultPlural?: number;
}

// Order matters: more specific phrases first.
const RULES: KindRule[] = [
  { kind: 'oled', re: /\b(oled|ssd1306|screen|display|monitor)\b/ },
  { kind: 'lcd', re: /\b(lcd|16x2|1602|character display|text display)\b/ },
  { kind: 'mpu6050', re: /\b(imu|accelerometer|accel|gyro|gyroscope|mpu-?6050|tilt sensor|orientation|motion tracking|step counter|pedometer|shake)\b/ },
  { kind: 'dht22', re: /\b(temperature|temp|humidity|dht\d*|thermometer|weather|climate|hygrometer)\b/ },
  { kind: 'hcsr04', re: /\b(distance|ultrasonic|hc-?sr04|sonar|parking|range ?finder|proximity)\b/ },
  { kind: 'pir', re: /\b(pir|motion sensor|motion detector|movement|presence|intruder|occupancy)\b/ },
  { kind: 'ldr', re: /\b(light sensor|ldr|photoresistor|photocell|brightness sensor|ambient light|dark|night ?light|daylight|sunlight)\b/ },
  { kind: 'ntc', re: /\b(thermistor|ntc)\b/ },
  { kind: 'soil', re: /\b(soil|moisture|plant|watering|irrigation|garden)\b/ },
  { kind: 'neopixel', re: /\b(neopixels?|ws2812b?|addressable|led ring|rgb ring|led strip|rainbow)\b/ },
  { kind: 'rgb', re: /\b(rgb led|colou?r led|mood light|rgb)\b/ },
  { kind: 'led', re: /\b(leds?|lights?|indicators?|lamps?|traffic light|blink\w*)\b/, plural: /\bleds|lights|indicators|lamps\b/, defaultPlural: 3 },
  { kind: 'button', re: /\b(buttons?|push ?buttons?|keys?|press)\b/, plural: /\bbuttons|keys\b/, defaultPlural: 2 },
  { kind: 'switch', re: /\b(slide switch|toggle switch|on\/off switch|mode switch)\b/ },
  { kind: 'pot', re: /\b(potentiometer|pot|knob|dial|volume)\b/ },
  { kind: 'buzzer', re: /\b(buzzer|beep\w*|sound|alarm|tone|speaker|melody|piezo|music)\b/ },
  { kind: 'servo', re: /\b(servo|sg90|robot arm|pan|angle|gauge needle|lock)\b/ },
  { kind: 'relay', re: /\b(relay|pump|fan|heater|mains|appliance)\b/ },
];

const DISCRETE_RE = /\b(555|ne555|no (micro ?controller|mcu)|without (a )?(micro ?controller|mcu)|discrete|astable|analog blinker)\b/;

export function detectBoard(text: string): BoardId {
  const t = text.toLowerCase();
  if (DISCRETE_RE.test(t) && !/\b(esp32|pico|raspberry)\b/.test(t)) return 'none';
  if (/\bpico\b|rp2040/.test(t)) return 'pico';
  if (/raspberry ?pi|\brpi\b|\bpi ?[345]\b|\bpi zero\b/.test(t)) return 'rpi4';
  if (/esp-?32/.test(t)) return 'esp32';
  return 'esp32';
}

function countNear(t: string, idx: number): number | undefined {
  const before = t.slice(Math.max(0, idx - 18), idx).trim().split(/\s+/);
  for (let i = before.length - 1; i >= Math.max(0, before.length - 3); i--) {
    const w = before[i].replace(/[^a-z0-9]/g, '');
    if (/^\d+$/.test(w)) return Math.min(12, Number(w));
    if (w in NUMBER_WORDS) return NUMBER_WORDS[w];
  }
  return undefined;
}

export function parseIntent(prompt: string): DesignSpec {
  const t = ` ${prompt.toLowerCase().replace(/[,.;!?]/g, ' ')} `;
  const board = detectBoard(t);
  const features: FeatureReq[] = [];
  if (board === 'none') {
    if (/transistor/.test(t) && !/555/.test(t)) features.push({ kind: 'transistor-led' });
    else features.push({ kind: 'astable555' });
    return { board, features, title: titleFrom(prompt) };
  }
  const taken: [number, number][] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, 'g');
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(t))) {
      const s = m.index;
      const e = s + m[0].length;
      if (taken.some(([a, b]) => s < b && e > a)) continue; // phrase already claimed by a more specific rule
      taken.push([s, e]);
      const n = countNear(t, s) ?? (rule.plural && rule.plural.test(m[0]) ? rule.defaultPlural ?? 2 : 1);
      count = Math.max(count, n);
    }
    if (rule.kind === 'rgb' && features.some((f) => f.kind === 'neopixel')) count = 0;
    for (let i = 0; i < count; i++) features.push({ kind: rule.kind });
  }
  // "traffic light" → red, yellow, green LEDs
  if (/traffic light/.test(t)) {
    const others = features.filter((f) => f.kind !== 'led');
    features.length = 0;
    features.push(...others, { kind: 'led', props: { color: 'red' }, label: 'Red' }, { kind: 'led', props: { color: 'yellow' }, label: 'Yellow' }, { kind: 'led', props: { color: 'green' }, label: 'Green' });
  }
  // Disambiguate: "temperature" with a thermistor mentioned → NTC only
  if (features.some((f) => f.kind === 'ntc')) removeKind(features, 'dht22');
  // LCD mentioned explicitly → it is the display
  if (features.some((f) => f.kind === 'lcd') && !/\boled\b/.test(t)) removeKind(features, 'oled');
  // "alarm" alone shouldn't add a buzzer if a buzzer is already there; "light sensor" isn't an LED
  if (/light sensor|night ?light|ambient light/.test(t) && !/\bleds?\b/.test(t)) {
    removeKind(features, 'led');
    if (/night ?light/.test(t)) features.push({ kind: 'led', props: { color: 'white' }, label: 'Night light' });
  }
  if (features.length === 0) features.push({ kind: 'led', label: 'Status' }, { kind: 'button' });
  // LED colours for multiples
  const leds = features.filter((f) => f.kind === 'led' && !f.props?.color);
  const palette = ['red', 'green', 'blue', 'yellow', 'white', 'orange'];
  leds.forEach((f, i) => (f.props = { ...(f.props ?? {}), color: palette[i % palette.length] }));
  return { board, features, title: titleFrom(prompt) };
}

function removeKind(features: FeatureReq[], kind: FeatureKind) {
  for (let i = features.length - 1; i >= 0; i--) if (features[i].kind === kind) features.splice(i, 1);
}

function titleFrom(prompt: string): string {
  const p = prompt.trim().replace(/^(build|make|create|design|i want|i'd like|please)\s+(me\s+)?(an?\s+)?/i, '');
  const s = p.split(/[.\n]/)[0].slice(0, 60);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ------------------------------------------------------------------ pin allocation

type Need = 'out' | 'pwm' | 'in-pullup' | 'in' | 'adc';

class PinAllocator {
  used = new Set<string>();
  constructor(public board: BoardDef, reserved: string[]) {
    for (const r of reserved) this.used.add(r);
  }
  take(need: Need, what: string): BoardPin {
    const caps: Cap[] = need === 'adc' ? ['adc'] : need === 'out' || need === 'pwm' ? ['out'] : ['in'];
    let candidates = this.board.pins.filter((p) => p.role === 'gpio' && !this.used.has(p.name) && caps.every((c) => p.caps?.includes(c)));
    if (need === 'in-pullup' || need === 'out' || need === 'pwm') candidates = candidates.filter((p) => p.caps?.includes('out')); // input-only pins have no pull-ups
    const score = (p: BoardPin) => {
      let s = p.rank ?? 5;
      // Save ADC-capable pins for analog uses, and use input-only pins for analog first.
      if (need !== 'adc' && p.caps?.includes('adc')) s += 2;
      if (need === 'adc' && !p.caps?.includes('out')) s -= 3;
      return s * 100 + (p.gpio ?? 0) / 100;
    };
    candidates.sort((a, b) => score(a) - score(b));
    const pin = candidates[0];
    if (!pin) {
      const kind = need === 'adc' ? 'analog-capable (ADC)' : 'free GPIO';
      throw new PlanError(`The ${this.board.name} has run out of ${kind} pins for ${what}. Try fewer parts or a bigger board.`);
    }
    this.used.add(pin.name);
    return pin;
  }
}

// ------------------------------------------------------------------ builder

const WIRE_COLORS = { gnd: '#1f2328', v33: '#d32f2f', v5: '#ef6c00', sda: '#1e88e5', scl: '#f9a825', sig: ['#2e7d32', '#8e24aa', '#00838f', '#c2185b', '#6d4c41', '#5c6bc0', '#7cb342', '#546e7a'] };

const NAMES: Record<FeatureKind, string> = {
  oled: 'oled', lcd: 'lcd', button: 'btn', switch: 'switch', pot: 'knob', dht22: 'dht_sensor', mpu6050: 'imu', hcsr04: 'sonar',
  pir: 'pir', ldr: 'light', ntc: 'thermistor', soil: 'soil', led: 'led', rgb: 'rgb', neopixel: 'pixels', buzzer: 'buzzer',
  servo: 'servo', relay: 'relay', astable555: 'timer', 'transistor-led': 'switch_q',
};
const LABELS: Record<FeatureKind, string> = {
  oled: 'OLED display', lcd: 'LCD display', button: 'Button', switch: 'Slide switch', pot: 'Knob', dht22: 'Temperature/humidity sensor',
  mpu6050: 'IMU', hcsr04: 'Distance sensor', pir: 'Motion sensor', ldr: 'Light sensor', ntc: 'Thermistor', soil: 'Soil moisture sensor',
  led: 'LED', rgb: 'RGB LED', neopixel: 'NeoPixel ring', buzzer: 'Buzzer', servo: 'Servo', relay: 'Relay', astable555: '555 blinker', 'transistor-led': 'Transistor switch',
};

class Builder {
  parts: PartInstance[] = [];
  wires: Wire[] = [];
  groups: Group[] = [];
  features: FeatureInstance[] = [];
  notes: string[] = [];
  alloc?: PinAllocator;
  board?: BoardDef;
  boardId?: string;
  private sigColor = 0;
  private counters = new Map<string, number>();
  private mcp?: { id: string; next: number };
  private nameCount = new Map<string, number>();

  constructor(public spec: DesignSpec) {
    if (spec.board !== 'none') {
      this.board = BOARDS[spec.board];
      this.boardId = this.addPart(this.board.partType, {}, this.board.name);
      const reserved: string[] = [];
      const needsI2C = spec.features.some((f) => ['oled', 'lcd', 'mpu6050'].includes(f.kind));
      if (needsI2C) reserved.push(this.board.i2c.sda, this.board.i2c.scl);
      const needsAnalog = spec.features.some((f) => ['pot', 'ldr', 'ntc', 'soil'].includes(f.kind));
      if (spec.board === 'rpi4' && needsAnalog && this.board.spi) reserved.push(this.board.spi.sck, this.board.spi.mosi, this.board.spi.miso, this.board.spi.cs);
      // Never auto-assign the Pi's HAT EEPROM or serial pins for plain I/O unless needed.
      this.alloc = new PinAllocator(this.board, reserved);
    }
  }

  addPart(type: string, props: Record<string, any> = {}, label?: string): string {
    const def = partDef(type);
    const base = type.replace(/[^a-z0-9]/g, '');
    const n = (this.counters.get(base) ?? 0) + 1;
    this.counters.set(base, n);
    const id = `${base}${n}`;
    this.parts.push({ id, type, label: label ?? def.name, props: { ...defaultProps(type), ...props }, x: 0, y: 0 });
    return id;
  }

  wire(a: PinRef, b: PinRef, color?: string) {
    this.wires.push({ id: `w${this.wires.length + 1}`, a, b, color: color ?? this.nextColor() });
  }
  nextColor() {
    return WIRE_COLORS.sig[this.sigColor++ % WIRE_COLORS.sig.length];
  }
  bp(pin: string): PinRef {
    return { part: this.boardId!, pin };
  }
  gnd(part: string, pin = 'GND') {
    if (this.board) this.wire({ part, pin }, this.bp(this.board.gnd), WIRE_COLORS.gnd);
  }
  v33(part: string, pin = 'VCC') {
    if (this.board) this.wire({ part, pin }, this.bp(this.board.supply3v3), WIRE_COLORS.v33);
  }
  v5(part: string, pin = 'VCC') {
    if (this.board) this.wire({ part, pin }, this.bp(this.board.supply5v), WIRE_COLORS.v5);
  }
  gpio(part: string, pin: string, need: Need, what: string): BoardPin {
    const bpin = this.alloc!.take(need, what);
    this.wire({ part, pin }, this.bp(bpin.name));
    return bpin;
  }
  varName(kind: FeatureKind, label?: string): string {
    let base = NAMES[kind];
    const short = label && /^button ([a-z])$/i.exec(label);
    if (short) return `btn_${short[1].toLowerCase()}`;
    if (label) {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (slug && !/^(button|led|status)$/.test(slug)) base = `${NAMES[kind]}_${slug}`.slice(0, 24);
    }
    const n = (this.nameCount.get(base) ?? 0) + 1;
    this.nameCount.set(base, n);
    return n === 1 ? base : `${base}${n}`;
  }
  /** Analog input: direct ADC pin, or an MCP3008 channel on the Raspberry Pi. */
  analog(part: string, pin: string, what: string): { pin?: BoardPin; ch?: number } {
    if (this.board?.id === 'rpi4') {
      if (!this.mcp) {
        const id = this.addPart('mcp3008', {}, 'MCP3008 ADC');
        const spi = this.board.spi!;
        this.v33(id, 'VDD');
        this.v33(id, 'VREF');
        this.gnd(id, 'AGND');
        this.gnd(id, 'DGND');
        this.wire({ part: id, pin: 'CLK' }, this.bp(spi.sck), '#5c6bc0');
        this.wire({ part: id, pin: 'DOUT' }, this.bp(spi.miso), '#00838f');
        this.wire({ part: id, pin: 'DIN' }, this.bp(spi.mosi), '#8e24aa');
        this.wire({ part: id, pin: 'CS' }, this.bp(spi.cs), '#6d4c41');
        this.mcp = { id, next: 0 };
        this.groups.push({ main: id, parts: [id], side: 'right' });
        this.notes.push('The Raspberry Pi has no analog inputs, so an MCP3008 ADC chip was added on the SPI bus (GPIO8–11).');
      }
      if (this.mcp.next > 7) throw new PlanError('The MCP3008 only has 8 analog channels.');
      const ch = this.mcp.next++;
      this.wire({ part, pin }, { part: this.mcp.id, pin: `CH${ch}` });
      return { ch };
    }
    return { pin: this.gpio(part, pin, 'adc', what) };
  }

  feature(req: FeatureReq) {
    const b = this.board;
    const kind = req.kind;
    const label = req.label ?? LABELS[kind];
    const name = this.varName(kind, req.label);
    const fi: FeatureInstance = { kind, name, label, parts: [], pins: {}, gpio: {}, props: req.props };
    const setPin = (sig: string, p: BoardPin) => {
      fi.pins[sig] = p.name;
      fi.gpio[sig] = p.gpio!;
    };
    const i2c = (id: string, vcc: 'v33' | 'v5') => {
      this[vcc](id);
      this.gnd(id);
      this.wire({ part: id, pin: 'SDA' }, this.bp(b!.i2c.sda), WIRE_COLORS.sda);
      this.wire({ part: id, pin: 'SCL' }, this.bp(b!.i2c.scl), WIRE_COLORS.scl);
      const sda = b!.pins.find((p) => p.name === b!.i2c.sda)!;
      const scl = b!.pins.find((p) => p.name === b!.i2c.scl)!;
      setPin('sda', sda);
      setPin('scl', scl);
    };
    switch (kind) {
      case 'oled': {
        const id = this.addPart('ssd1306', {}, label);
        i2c(id, 'v33');
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'right' });
        break;
      }
      case 'lcd': {
        const id = this.addPart('lcd1602', {}, label);
        i2c(id, 'v5');
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'right' });
        break;
      }
      case 'mpu6050': {
        const id = this.addPart('mpu6050', {}, label);
        i2c(id, 'v33');
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'right' });
        break;
      }
      case 'button': {
        const color = req.props?.color ?? ['green', 'red', 'blue', 'yellow', 'white', 'black'][this.features.filter((f) => f.kind === 'button').length % 6];
        const id = this.addPart('pushbutton', { color, label: req.label ?? '' }, label);
        setPin('pin', this.gpio(id, '1', 'in-pullup', label));
        this.gnd(id, '2');
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'left' });
        break;
      }
      case 'switch': {
        const id = this.addPart('slide-switch', {}, label);
        setPin('pin', this.gpio(id, '2', 'in-pullup', label));
        this.gnd(id, '1');
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'left' });
        break;
      }
      case 'pot': {
        const id = this.addPart('potentiometer', {}, label);
        this.v33(id);
        this.gnd(id);
        const a = this.analog(id, 'SIG', label);
        if (a.pin) setPin('pin', a.pin);
        fi.mcpChannel = a.ch;
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'left' });
        break;
      }
      case 'dht22': {
        const id = this.addPart('dht22', {}, label);
        this.v33(id);
        this.gnd(id);
        setPin('pin', this.gpio(id, 'DATA', 'in-pullup', label));
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'right' });
        break;
      }
      case 'hcsr04': {
        const id = this.addPart('hcsr04', {}, label);
        this.v5(id);
        this.gnd(id);
        setPin('trig', this.gpio(id, 'TRIG', 'out', `${label} trigger`));
        // ECHO is a 5 V signal: divide it down to 3.3 V with 1 kΩ / 2 kΩ.
        const r1 = this.addPart('resistor', { ohms: 1000 }, 'Echo divider (top)');
        const r2 = this.addPart('resistor', { ohms: 2000 }, 'Echo divider (bottom)');
        this.wire({ part: id, pin: 'ECHO' }, { part: r1, pin: '1' });
        const echo = this.alloc!.take('in', `${label} echo`);
        this.wire({ part: r1, pin: '2' }, this.bp(echo.name));
        this.wire({ part: r2, pin: '1' }, { part: r1, pin: '2' });
        this.gnd(r2, '2');
        setPin('echo', echo);
        fi.parts.push(id, r1, r2);
        this.groups.push({ main: id, parts: [id, r1, r2], side: 'right' });
        this.notes.push('The HC-SR04 runs on 5 V and its ECHO output is 5 V, so a 1 kΩ/2 kΩ divider brings it down to a safe 3.3 V.');
        break;
      }
      case 'pir': {
        const id = this.addPart('pir', {}, label);
        this.v5(id);
        this.gnd(id);
        setPin('pin', this.gpio(id, 'OUT', 'in', label));
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'right' });
        break;
      }
      case 'ldr':
      case 'ntc': {
        const id = this.addPart(kind, {}, label);
        const r = this.addPart('resistor', { ohms: 10000 }, `${label} divider`);
        this.v33(id, '1');
        this.wire({ part: id, pin: '2' }, { part: r, pin: '1' });
        this.gnd(r, '2');
        const a = this.analog(id, '2', label);
        if (a.pin) setPin('pin', a.pin);
        fi.mcpChannel = a.ch;
        fi.parts.push(id, r);
        this.groups.push({ main: id, parts: [id, r], side: 'right' });
        break;
      }
      case 'soil': {
        const id = this.addPart('soil', {}, label);
        this.v33(id);
        this.gnd(id);
        const a = this.analog(id, 'AOUT', label);
        if (a.pin) setPin('pin', a.pin);
        fi.mcpChannel = a.ch;
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'right' });
        break;
      }
      case 'led': {
        const color = req.props?.color ?? 'red';
        const id = this.addPart('led', { color }, req.label ? `${req.label} LED` : `${color[0].toUpperCase()}${color.slice(1)} LED`);
        const ohms = color === 'blue' || color === 'white' ? 100 : 220;
        const r = this.addPart('resistor', { ohms }, `${color} LED resistor`);
        setPin('pin', this.gpio(r, '1', 'pwm', fi.label));
        this.wire({ part: r, pin: '2' }, { part: id, pin: 'A' });
        this.gnd(id, 'C');
        fi.parts.push(id, r);
        fi.props = { ...(fi.props ?? {}), color };
        if (!req.label) fi.label = `${color[0].toUpperCase()}${color.slice(1)} LED`;
        this.groups.push({ main: id, parts: [r, id], side: 'left' });
        break;
      }
      case 'rgb': {
        const id = this.addPart('rgb-led', {}, label);
        const rs: string[] = [];
        for (const ch of ['R', 'G', 'B']) {
          const r = this.addPart('resistor', { ohms: ch === 'R' ? 220 : 100 }, `RGB ${ch} resistor`);
          setPin(ch.toLowerCase(), this.gpio(r, '1', 'pwm', `${label} ${ch}`));
          this.wire({ part: r, pin: '2' }, { part: id, pin: ch });
          rs.push(r);
        }
        this.gnd(id, 'COM');
        fi.parts.push(id, ...rs);
        this.groups.push({ main: id, parts: [...rs, id], side: 'left' });
        break;
      }
      case 'neopixel': {
        const id = this.addPart('neopixel-ring', { pixels: req.props?.pixels ?? 12 }, label);
        this.v5(id);
        this.gnd(id);
        const r = this.addPart('resistor', { ohms: 330 }, 'NeoPixel data resistor');
        setPin('pin', this.gpio(r, '1', 'out', label));
        this.wire({ part: r, pin: '2' }, { part: id, pin: 'DIN' });
        fi.parts.push(id, r);
        fi.props = { pixels: req.props?.pixels ?? 12 };
        this.groups.push({ main: id, parts: [r, id], side: 'left' });
        break;
      }
      case 'buzzer': {
        const id = this.addPart('buzzer', {}, label);
        setPin('pin', this.gpio(id, '+', 'pwm', label));
        this.gnd(id, '-');
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'left' });
        break;
      }
      case 'servo': {
        const id = this.addPart('servo', {}, label);
        this.v5(id, 'V+');
        this.gnd(id);
        setPin('pin', this.gpio(id, 'PWM', 'pwm', label));
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'left' });
        break;
      }
      case 'relay': {
        const id = this.addPart('relay', {}, label);
        this.v5(id);
        this.gnd(id);
        setPin('pin', this.gpio(id, 'IN', 'out', label));
        fi.parts.push(id);
        this.groups.push({ main: id, parts: [id], side: 'left' });
        break;
      }
      case 'astable555':
        this.build555(fi);
        break;
      case 'transistor-led':
        this.buildTransistorLed(fi);
        break;
    }
    this.features.push(fi);
  }

  /** Classic 555 astable LED blinker on a 9 V battery. */
  build555(fi: FeatureInstance) {
    const bat = this.addPart('battery-9v', { volts: 9 }, '9 V battery');
    const u = this.addPart('ne555', {}, 'NE555 timer');
    const r1 = this.addPart('resistor', { ohms: 10000 }, 'R1 (timing)');
    const r2 = this.addPart('resistor', { ohms: 47000 }, 'R2 (timing)');
    const c1 = this.addPart('electrolytic', { farads: 10e-6 }, 'Timing capacitor');
    const c2 = this.addPart('capacitor', { farads: 10e-9 }, 'Control capacitor');
    const rl = this.addPart('resistor', { ohms: 470 }, 'LED resistor');
    const led = this.addPart('led', { color: 'red' }, 'LED');
    const w = (a: string, ap: string, bb: string, bpn: string, color?: string) => this.wire({ part: a, pin: ap }, { part: bb, pin: bpn }, color);
    w(bat, '+', u, 'VCC', WIRE_COLORS.v33);
    w(u, 'RESET', u, 'VCC', WIRE_COLORS.v33);
    w(bat, '-', u, 'GND', WIRE_COLORS.gnd);
    w(r1, '1', u, 'VCC', WIRE_COLORS.v33);
    w(r1, '2', u, 'DIS');
    w(r2, '1', u, 'DIS');
    w(r2, '2', u, 'THR');
    w(u, 'TRIG', u, 'THR');
    w(c1, '+', u, 'THR');
    w(c1, '-', bat, '-', WIRE_COLORS.gnd);
    w(c2, '1', u, 'CTRL');
    w(c2, '2', bat, '-', WIRE_COLORS.gnd);
    w(u, 'OUT', rl, '1');
    w(rl, '2', led, 'A');
    w(led, 'C', bat, '-', WIRE_COLORS.gnd);
    fi.parts.push(u, bat, r1, r2, c1, c2, rl, led);
    this.groups.push({ main: bat, parts: [bat], side: 'left' }, { main: u, parts: [r1, r2, u], side: 'right' }, { main: c1, parts: [c1, c2], side: 'left' }, { main: led, parts: [rl, led], side: 'right' });
    this.notes.push('f = 1.44 / ((R1 + 2·R2)·C) = 1.44 / ((10k + 94k) · 10 µF) ≈ 1.4 Hz — the LED blinks about 1.4 times per second.');
  }

  /** LED switched by an NPN transistor and a push button (no microcontroller). */
  buildTransistorLed(fi: FeatureInstance) {
    const bat = this.addPart('battery-9v', { volts: 9 }, '9 V battery');
    const sw = this.addPart('pushbutton', { color: 'green' }, 'Button');
    const rb = this.addPart('resistor', { ohms: 10000 }, 'Base resistor');
    const q = this.addPart('npn', {}, 'NPN transistor');
    const rl = this.addPart('resistor', { ohms: 470 }, 'LED resistor');
    const led = this.addPart('led', { color: 'green' }, 'LED');
    const w = (a: string, ap: string, bb: string, bpn: string, color?: string) => this.wire({ part: a, pin: ap }, { part: bb, pin: bpn }, color);
    w(bat, '+', sw, '1', WIRE_COLORS.v33);
    w(sw, '2', rb, '1');
    w(rb, '2', q, 'B');
    w(bat, '+', rl, '1', WIRE_COLORS.v33);
    w(rl, '2', led, 'A');
    w(led, 'C', q, 'C');
    w(q, 'E', bat, '-', WIRE_COLORS.gnd);
    fi.parts.push(q, bat, sw, rb, rl, led);
    this.groups.push({ main: bat, parts: [bat], side: 'left' }, { main: sw, parts: [sw, rb], side: 'left' }, { main: q, parts: [q], side: 'right' }, { main: led, parts: [rl, led], side: 'right' });
    this.notes.push('Pressing the button sends ~0.8 mA into the transistor base; with a gain of ~100+ the transistor saturates and lets ~15 mA flow through the LED.');
  }
}

/** Build a complete project from a spec. Keeps positions of parts that already existed (same id). */
export function buildProject(spec: DesignSpec, opts: { name?: string; prompt?: string; previous?: Project } = {}): Project {
  const b = new Builder(spec);
  // Group order: inputs first so buttons get the nicest pins, analog before generic I/O.
  const order: FeatureKind[] = ['oled', 'lcd', 'mpu6050', 'pot', 'ldr', 'ntc', 'soil', 'dht22', 'hcsr04', 'pir', 'button', 'switch', 'buzzer', 'servo', 'neopixel', 'rgb', 'led', 'relay', 'astable555', 'transistor-led'];
  const sorted = [...spec.features].sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
  const nButtons = sorted.filter((f) => f.kind === 'button').length;
  let bi = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].kind === 'button' && !sorted[i].label && nButtons > 1) sorted[i] = { ...sorted[i], label: `Button ${String.fromCharCode(65 + bi++)}` };
  }
  for (const f of sorted) b.feature(f);
  // Display order of features follows the user's order.
  b.features.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
  const now = Date.now();
  let project: Project = {
    id: opts.previous?.id ?? `p${now.toString(36)}`,
    name: opts.name ?? projectName(spec),
    summary: summarize(spec),
    prompt: opts.prompt,
    board: spec.board,
    parts: b.parts,
    wires: b.wires,
    files: {},
    notes: b.notes,
    spec,
    features: b.features,
    createdAt: opts.previous?.createdAt ?? now,
    updatedAt: now,
    version: 1,
  };
  project = annotate(project);
  project = autoLayout(project, b.groups);
  if (opts.previous) {
    const prevPos = new Map(opts.previous.parts.map((p) => [p.id, p]));
    project.parts = project.parts.map((p) => {
      const q = prevPos.get(p.id);
      return q && q.type === p.type ? { ...p, x: q.x, y: q.y } : p;
    });
  }
  project.notes.unshift(...pinNotes(project));
  const files = generateFiles(project);
  if (opts.previous?.codeCustom) {
    project.files = { ...files, 'main.py': opts.previous.files['main.py'] };
    project.codeCustom = true;
    project.notes.push('Your hand-edited main.py was kept. The generated version would have been different — check pin numbers in the wiring table.');
  } else project.files = files;
  return project;
}

function pinNotes(project: Project): string[] {
  const notes: string[] = [];
  if (!project.features || project.board === 'none') return notes;
  const board = BOARDS[project.board as Exclude<BoardId, 'none'>];
  for (const f of project.features) {
    const pins = Object.entries(f.pins)
      .filter(([s]) => s !== 'sda' && s !== 'scl')
      .map(([s, p]) => `${s === 'pin' ? '' : s.toUpperCase() + '→'}${p}`);
    if (['oled', 'lcd', 'mpu6050'].includes(f.kind)) notes.push(`${f.label}: shares the I2C bus (SDA ${board.i2c.sda}, SCL ${board.i2c.scl}).`);
    else if (f.mcpChannel !== undefined) notes.push(`${f.label}: MCP3008 channel ${f.mcpChannel}.`);
    else if (pins.length) notes.push(`${f.label}: ${pins.join(', ')}${f.kind === 'button' ? ' (internal pull-up, button to GND)' : ''}.`);
  }
  return notes;
}

/** A short, friendly project name from what the design does. */
export function projectName(spec: DesignSpec): string {
  const k = new Set(spec.features.map((f) => f.kind));
  if (spec.board === 'none') return k.has('transistor-led') ? 'Transistor Button Light' : '555 LED Blinker';
  const board = BOARDS[spec.board].short;
  const display = k.has('oled') || k.has('lcd');
  const leds = spec.features.filter((f) => f.kind === 'led');
  let n = '';
  if ((k.has('dht22') || k.has('ntc')) && k.has('mpu6050')) n = 'Weather & Motion Station';
  else if (k.has('soil')) n = k.has('relay') ? 'Plant Waterer' : 'Plant Monitor';
  else if (k.has('hcsr04')) n = k.has('buzzer') ? 'Parking Sensor' : 'Distance Meter';
  else if (k.has('pir')) n = k.has('relay') ? 'Motion Light' : k.has('buzzer') ? 'Motion Alarm' : 'Motion Detector';
  else if (k.has('dht22') || k.has('ntc')) n = k.has('relay') ? 'Thermostat' : display ? 'Weather Station' : 'Thermometer';
  else if (k.has('mpu6050')) n = display ? 'Tilt Meter' : 'Motion Sensor';
  else if (k.has('ldr')) n = k.has('relay') ? 'Dusk Switch' : 'Night Light';
  else if (k.has('pot') && k.has('servo')) n = 'Servo Dial';
  else if (k.has('neopixel')) n = 'NeoPixel Mood Lamp';
  else if (k.has('rgb')) n = 'RGB Mood Light';
  else if (leds.length === 3 && leds.map((l) => l.props?.color).join() === 'red,yellow,green') n = 'Traffic Light';
  else if (k.has('servo')) n = 'Servo Sweeper';
  else if (k.has('button') && k.has('buzzer')) n = 'Button Buzzer';
  else if (k.has('pot')) n = 'Dimmer';
  else if (k.has('relay')) n = 'Relay Switch';
  else n = leds.length > 1 ? 'LED Chaser' : 'Blinky';
  return `${board} ${n}`;
}

export function summarize(spec: DesignSpec): string {
  if (spec.board === 'none') return spec.features.map((f) => LABELS[f.kind]).join(', ') + ' — battery powered, no microcontroller.';
  const counts = new Map<string, number>();
  for (const f of spec.features) counts.set(LABELS[f.kind], (counts.get(LABELS[f.kind]) ?? 0) + 1);
  const items = [...counts].map(([l, n]) => (n > 1 ? `${n}× ${l}` : l));
  return `${BOARDS[spec.board].name} with ${items.join(', ')}.`;
}

/** Natural language → project, in one call. */
export function planFromPrompt(prompt: string, previous?: Project): Project {
  const spec = parseIntent(prompt);
  return buildProject(spec, { prompt, previous });
}

// ------------------------------------------------------------------ conversational edits

export interface EditResult {
  spec: DesignSpec;
  message: string;
  changed: boolean;
}

/** Apply a follow-up instruction ("add a buzzer", "remove the LED", "use a Pico") to a spec. */
export function editSpec(spec: DesignSpec, instruction: string): EditResult {
  const t = ` ${instruction.toLowerCase()} `;
  const next: DesignSpec = { ...spec, features: spec.features.map((f) => ({ ...f })) };
  const msgs: string[] = [];
  // Board swap
  const boardWords = /\b(esp-?32|pico|rp2040|raspberry ?pi|rpi)\b/.exec(t);
  if (boardWords && /\b(use|switch|swap|change|instead|move|port|replace)\b/.test(t)) {
    const nb = detectBoard(boardWords[0]);
    if (nb !== spec.board) {
      next.board = nb;
      msgs.push(`Switched the board to ${BOARDS[nb as Exclude<BoardId, 'none'>].name} and re-assigned every pin.`);
    }
  }
  const removing = /\b(remove|delete|drop|without|get rid of|no more)\b/.test(t);
  const adding = /\b(add|plus|also|include|another|more|with|attach|put)\b/.test(t);
  const mentioned = parseIntent(instruction).features.filter((f) => !(f.kind === 'led' && f.label === 'Status' && !/\b(led|light)/.test(t)) && !(f.kind === 'button' && !/\b(button|key|press)/.test(t)));
  if (removing) {
    for (const f of uniqueKinds(mentioned)) {
      const before = next.features.length;
      const all = /\ball\b|\bevery\b/.test(t);
      if (all) next.features = next.features.filter((x) => x.kind !== f);
      else {
        let idx = -1;
        next.features.forEach((x, i) => {
          if (x.kind === f) idx = i;
        });
        if (idx >= 0) next.features.splice(idx, 1);
      }
      if (next.features.length < before) msgs.push(`Removed ${all ? 'all' : 'a'} ${LABELS[f].toLowerCase()}${all ? 's' : ''}.`);
    }
  } else if (adding || mentioned.length) {
    const fresh = mentioned.filter((f) => !boardWords || f.kind !== 'led' || /\bled/.test(t));
    for (const f of fresh) {
      next.features.push(f);
    }
    const kinds = countKinds(fresh);
    if (kinds.length) msgs.push(`Added ${kinds.join(', ')}.`);
  }
  const changed = JSON.stringify(next) !== JSON.stringify(spec);
  return { spec: next, changed, message: msgs.join(' ') || "I couldn't map that to a change. Try e.g. “add a buzzer”, “remove the LED”, or “use a Raspberry Pi Pico instead”." };
}

function uniqueKinds(fs: FeatureReq[]): FeatureKind[] {
  return [...new Set(fs.map((f) => f.kind))];
}
function countKinds(fs: FeatureReq[]): string[] {
  const m = new Map<FeatureKind, number>();
  for (const f of fs) m.set(f.kind, (m.get(f.kind) ?? 0) + 1);
  return [...m].map(([k, n]) => (n > 1 ? `${n} ${LABELS[k].toLowerCase()}s` : `a ${LABELS[k].toLowerCase()}`));
}

export { LABELS as FEATURE_LABELS };
