// Firmware generator: turns the planner's feature list into readable, commented
// MicroPython (ESP32 / Pico) or Python + gpiozero (Raspberry Pi) code.
import type { FeatureInstance, FeatureKind, Project } from './types';
import { BOARDS } from './boards';
import { SSD1306_PY, MPU6050_PY, I2C_LCD_PY, OLED_PI_PY, MPU6050_PI_PY, LCD_PI_PY, EPAPER_PY } from './drivers';

type Lang = 'mp' | 'py';

class Code {
  lines: string[] = [];
  add(indent: number, ...ls: string[]) {
    for (const l of ls) this.lines.push(l ? '    '.repeat(indent) + l : '');
  }
  blank() {
    if (this.lines.length && this.lines[this.lines.length - 1] !== '') this.lines.push('');
  }
  toString() {
    return this.lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }
}

const has = (fs: FeatureInstance[], k: FeatureKind) => fs.some((f) => f.kind === k);
const all = (fs: FeatureInstance[], k: FeatureKind) => fs.filter((f) => f.kind === k);
const first = (fs: FeatureInstance[], k: FeatureKind) => fs.find((f) => f.kind === k);

export function generateFiles(project: Project): Record<string, string> {
  if (project.board === 'none') return {};
  const lang: Lang = project.board === 'rpi4' ? 'py' : 'mp';
  const fs = project.features ?? [];
  const files: Record<string, string> = { 'main.py': generateMain(project, lang) };
  if (lang === 'mp') {
    if (has(fs, 'oled')) files['ssd1306.py'] = SSD1306_PY;
    if (has(fs, 'mpu6050')) files['mpu6050.py'] = MPU6050_PY;
    if (has(fs, 'lcd')) files['i2c_lcd.py'] = I2C_LCD_PY;
    if (has(fs, 'epaper')) files['epaper2in9.py'] = EPAPER_PY;
  } else {
    if (has(fs, 'oled')) files['oled.py'] = OLED_PI_PY;
    if (has(fs, 'mpu6050')) files['mpu6050.py'] = MPU6050_PI_PY;
    if (has(fs, 'lcd')) files['i2c_lcd.py'] = LCD_PI_PY;
  }
  return files;
}

/** What each sensor contributes: variable, display line, value range for colour/servo mapping. */
interface Reading {
  f: FeatureInstance;
  vars: string[];
  lines: string[]; // python f-string expressions (without f prefix quoting)
  level?: { expr: string; lo: number; hi: number; label: string };
  alarm?: { cond: string; label: string; clear?: string };
}

function readings(fs: FeatureInstance[]): Reading[] {
  const out: Reading[] = [];
  for (const f of fs) {
    switch (f.kind) {
      case 'dht22':
        out.push({ f, vars: ['temp_c', 'humidity'], lines: ['Temp {temp_c:.1f} C', 'Hum  {humidity:.0f} %'], level: { expr: 'temp_c', lo: 15, hi: 35, label: 'temperature' }, alarm: { cond: 'temp_c > TEMP_HIGH', label: 'too hot' } });
        break;
      case 'ntc':
        out.push({ f, vars: [`${f.name}_c`], lines: [`Temp {${f.name}_c:.1f} C`], level: { expr: `${f.name}_c`, lo: 15, hi: 35, label: 'temperature' }, alarm: { cond: `${f.name}_c > TEMP_HIGH`, label: 'too hot' } });
        break;
      case 'mpu6050':
        out.push({ f, vars: ['roll', 'pitch', 'shakes'], lines: ['Roll  {round(roll):5d}', 'Pitch {round(pitch):5d}', 'Shakes {shakes}'], level: { expr: 'roll', lo: -90, hi: 90, label: 'tilt' }, alarm: { cond: 'abs(roll) > 30 or abs(pitch) > 30', label: 'tilted' } });
        break;
      case 'hcsr04':
        out.push({ f, vars: ['distance_cm'], lines: ['Dist {distance_cm:5.1f} cm'], level: { expr: 'distance_cm', lo: 5, hi: 100, label: 'distance' }, alarm: { cond: 'distance_cm < NEAR_CM', label: 'object close' } });
        break;
      case 'pir':
        out.push({ f, vars: ['motion'], lines: ["Motion {'YES' if motion else 'no'}"], alarm: { cond: 'motion', label: 'motion' } });
        break;
      case 'ldr':
        out.push({ f, vars: [`${f.name}_pct`], lines: [`Light {${f.name}_pct:3.0f} %`], level: { expr: `${f.name}_pct`, lo: 0, hi: 100, label: 'light' }, alarm: { cond: `${f.name}_pct < DARK_PCT`, label: 'dark' } });
        break;
      case 'soil':
        out.push({ f, vars: [`${f.name}_pct`], lines: [`Soil {${f.name}_pct:3.0f} %`], level: { expr: `${f.name}_pct`, lo: 0, hi: 100, label: 'moisture' }, alarm: { cond: `${f.name}_pct < DRY_PCT`, label: 'soil dry', clear: `${f.name}_pct > WET_PCT` } });
        break;
      case 'pot':
        out.push({ f, vars: [`${f.name}_pct`], lines: [`Knob {${f.name}_pct:3.0f} %`], level: { expr: `${f.name}_pct`, lo: 0, hi: 100, label: 'knob' } });
        break;
      case 'switch':
        out.push({ f, vars: [`${f.name}_on`], lines: [`Switch {'ON' if ${f.name}_on else 'off'}`] });
        break;
      case 'internet': {
        const svc = String(f.props?.service ?? 'weather');
        if (svc.includes('time')) out.push({ f, vars: ['clock'], lines: ['Time {clock}'] });
        if (svc.includes('weather'))
          out.push({ f, vars: ['out_temp', 'sky', 'out_hi', 'out_lo'], lines: ['Out {out_temp:.1f} C {sky}', 'Hi {out_hi:.0f} Lo {out_lo:.0f} C'], level: { expr: 'out_temp', lo: 0, hi: 30, label: 'outside temperature' } });
        break;
      }
    }
  }
  return out;
}

function generateMain(project: Project, lang: Lang): string {
  const board = BOARDS[project.board as 'esp32' | 'pico' | 'rpi4'];
  const fs = project.features ?? [];
  const mp = lang === 'mp';
  const c = new Code();
  const R = readings(fs);
  const buttons = all(fs, 'button');
  const leds = all(fs, 'led');
  const buzzer = first(fs, 'buzzer');
  const servo = first(fs, 'servo');
  const relay = first(fs, 'relay');
  const pixels = first(fs, 'neopixel');
  const rgb = first(fs, 'rgb');
  const oled = first(fs, 'oled');
  const lcd = first(fs, 'lcd');
  const imu = first(fs, 'mpu6050');
  const dhtF = first(fs, 'dht22');
  const sonar = first(fs, 'hcsr04');
  const epd = first(fs, 'epaper');
  const net = first(fs, 'internet');
  const svc = String(net?.props?.service ?? '');
  const wantWeather = svc.includes('weather');
  const wantTime = svc.includes('time');
  const display = oled ?? lcd;
  const knob = R.find((r) => r.f.kind === 'pot');
  const levelSrc = knob ?? R.find((r) => r.level);

  // ---------------------------------------------------------------- header
  c.add(0, `# ${project.name}`, `# Generated by Sparkbench for the ${board.name} (${mp ? 'MicroPython' : 'Python 3 + gpiozero'}).`, '#', '# Wiring (see the build guide for the full table):');
  for (const f of fs) {
    const pins = Object.entries(f.pins).map(([s, p]) => `${s.toUpperCase()}=${p}${f.gpio[s] !== undefined && mp ? ` (GPIO${f.gpio[s]})` : ''}`);
    c.add(0, `#   ${f.label.padEnd(26)} ${f.mcpChannel !== undefined ? `MCP3008 CH${f.mcpChannel}` : pins.join('  ')}`);
  }
  c.blank();

  // ---------------------------------------------------------------- imports
  const needPWM = mp && (leds.length || buzzer || servo || rgb);
  const needMath = !!(imu || has(fs, 'ntc') || (servo && !levelSrc?.level));
  const needADC = R.some((r) => ['pot', 'ldr', 'ntc', 'soil'].includes(r.f.kind));
  if (mp) {
    const mi = ['Pin'];
    if (display || imu) mi.push('I2C');
    if (needADC) mi.push('ADC');
    if (needPWM) mi.push('PWM');
    if (sonar) mi.push('time_pulse_us');
    if (epd) mi.push('SPI');
    c.add(0, `from machine import ${mi.join(', ')}`, 'import time');
    if (net) c.add(0, 'import network', 'import urequests as requests');
    if (wantTime) c.add(0, 'import ntptime');
    if (epd) c.add(0, 'import epaper2in9');
    if (needMath) c.add(0, 'import math');
    if (oled) c.add(0, 'import ssd1306');
    if (lcd) c.add(0, 'from i2c_lcd import I2cLcd');
    if (imu) c.add(0, 'import mpu6050');
    if (dhtF) c.add(0, 'import dht');
    if (pixels) c.add(0, 'import neopixel');
  } else {
    const gz: string[] = [];
    if (buttons.length) gz.push('Button');
    if (leds.length) gz.push('PWMLED');
    if (rgb) gz.push('RGBLED');
    if (buzzer) gz.push('PWMOutputDevice');
    if (servo) gz.push('AngularServo');
    if (sonar) gz.push('DistanceSensor');
    if (has(fs, 'pir')) gz.push('MotionSensor');
    if (needADC) gz.push('MCP3008');
    if (relay) gz.push('OutputDevice');
    if (has(fs, 'switch')) gz.push('Button');
    c.add(0, 'import time');
    if (net) c.add(0, 'import requests');
    if (needMath) c.add(0, 'import math');
    if (gz.length) c.add(0, `from gpiozero import ${[...new Set(gz)].join(', ')}`);
    if (oled) c.add(0, 'from oled import OLED');
    if (lcd) c.add(0, 'from i2c_lcd import I2cLcd');
    if (imu) c.add(0, 'from mpu6050 import MPU6050');
    if (dhtF) c.add(0, 'import board', 'import adafruit_dht');
    if (pixels) c.add(0, 'import neopixel');
  }
  c.blank();

  // ---------------------------------------------------------------- settings
  const settings: string[] = [];
  if (R.some((r) => r.alarm?.cond.includes('TEMP_HIGH'))) settings.push('TEMP_HIGH = 28.0   # °C: above this counts as "too hot"');
  if (sonar) settings.push('NEAR_CM = 20       # cm: closer than this counts as "close"');
  if (has(fs, 'ldr')) settings.push('DARK_PCT = 30      # %: below this light level counts as "dark"');
  if (has(fs, 'soil')) settings.push('DRY_PCT = 30       # %: water when soil is drier than this', 'WET_PCT = 60       # %: stop watering above this');
  if (net && mp) settings.push('WIFI_SSID = "MyHomeWiFi"        # your Wi-Fi network name', 'WIFI_PASSWORD = "change-me"     # your Wi-Fi password');
  if (wantWeather) settings.push('LATITUDE = 40.71     # where to get the weather for (New York; change to yours)', 'LONGITUDE = -74.01', 'WEATHER_EVERY_S = 600  # fetch a new forecast every 10 minutes');
  if (wantTime && mp) settings.push('UTC_OFFSET_H = -4    # your time zone offset from UTC, in hours');
  if (epd) settings.push('EPD_MIN_S = 60      # e-ink: redraw at most once a minute (refreshes are slow)');
  settings.push(`LOOP_MS = ${mp ? 50 : 50}       # main loop period`);
  c.add(0, '# ---- settings you can tweak ----', ...settings);
  c.blank();

  // ---------------------------------------------------------------- hardware setup
  c.add(0, '# ---- hardware setup ----');
  if (mp && (display || imu)) {
    const id = board.id === 'pico' ? 0 : 0;
    c.add(0, `i2c = I2C(${id}, scl=Pin(${display?.gpio.scl ?? imu!.gpio.scl}), sda=Pin(${display?.gpio.sda ?? imu!.gpio.sda}), freq=400000)`);
  }
  if (epd && mp) {
    c.add(0, `spi = SPI(${board.id === 'esp32' ? 2 : 0}, baudrate=4_000_000, sck=Pin(${epd.gpio.sck}), mosi=Pin(${epd.gpio.mosi}))`);
    c.add(0, `epd = epaper2in9.EPD(spi, cs=Pin(${epd.gpio.cs}), dc=Pin(${epd.gpio.dc}), rst=Pin(${epd.gpio.rst}), busy=Pin(${epd.gpio.busy}))`);
  }
  for (const f of fs) {
    const g = f.gpio.pin;
    switch (f.kind) {
      case 'oled':
        c.add(0, mp ? 'oled = ssd1306.SSD1306_I2C(128, 64, i2c)' : 'oled = OLED(bus=1, addr=0x3C)');
        break;
      case 'lcd':
        c.add(0, mp ? 'lcd = I2cLcd(i2c, 0x27, 2, 16)' : 'lcd = I2cLcd(bus=1, addr=0x27)');
        break;
      case 'mpu6050':
        c.add(0, mp ? 'imu = mpu6050.MPU6050(i2c)' : 'imu = MPU6050(bus=1)');
        break;
      case 'dht22':
        c.add(0, mp ? `${f.name} = dht.DHT22(Pin(${g}))` : `${f.name} = adafruit_dht.DHT22(board.D${g})`);
        break;
      case 'hcsr04':
        if (mp) c.add(0, `${f.name}_trig = Pin(${f.gpio.trig}, Pin.OUT, value=0)`, `${f.name}_echo = Pin(${f.gpio.echo}, Pin.IN)`);
        else c.add(0, `${f.name} = DistanceSensor(echo=${f.gpio.echo}, trigger=${f.gpio.trig}, max_distance=4)`);
        break;
      case 'pir':
        c.add(0, mp ? `${f.name} = Pin(${g}, Pin.IN)` : `${f.name} = MotionSensor(${g})`);
        break;
      case 'ldr':
      case 'soil':
      case 'pot':
      case 'ntc':
        if (mp) {
          c.add(0, `${f.name} = ADC(Pin(${g}))`);
          if (board.id === 'esp32') c.add(0, `${f.name}.atten(ADC.ATTN_11DB)  # full 0–3.3 V range`);
        } else c.add(0, `${f.name} = MCP3008(channel=${f.mcpChannel})`);
        break;
      case 'button':
        c.add(0, mp ? `${f.name} = Pin(${g}, Pin.IN, Pin.PULL_UP)  # ${f.label}: pressed = 0` : `${f.name} = Button(${g}, pull_up=True)  # ${f.label}`);
        break;
      case 'switch':
        c.add(0, mp ? `${f.name} = Pin(${g}, Pin.IN, Pin.PULL_UP)` : `${f.name} = Button(${g}, pull_up=True)`);
        break;
      case 'led':
        c.add(0, mp ? `${f.name} = PWM(Pin(${g}), freq=1000, duty_u16=0)  # ${f.label}` : `${f.name} = PWMLED(${g})  # ${f.label}`);
        break;
      case 'rgb':
        if (mp) c.add(0, `${f.name}_r = PWM(Pin(${f.gpio.r}), freq=1000, duty_u16=0)`, `${f.name}_g = PWM(Pin(${f.gpio.g}), freq=1000, duty_u16=0)`, `${f.name}_b = PWM(Pin(${f.gpio.b}), freq=1000, duty_u16=0)`);
        else c.add(0, `${f.name} = RGBLED(red=${f.gpio.r}, green=${f.gpio.g}, blue=${f.gpio.b})`);
        break;
      case 'neopixel':
        c.add(0, mp ? `${f.name} = neopixel.NeoPixel(Pin(${g}), ${f.props?.pixels ?? 12})` : `${f.name} = neopixel.NeoPixel(board.D${g}, ${f.props?.pixels ?? 12}, auto_write=False)`);
        if (!mp && !dhtF) c.lines.splice(c.lines.findIndex((l) => l.startsWith('import neopixel')), 0, 'import board');
        break;
      case 'buzzer':
        c.add(0, mp ? `${f.name} = PWM(Pin(${g}), freq=1000, duty_u16=0)` : `${f.name} = PWMOutputDevice(${g}, frequency=1000)`);
        break;
      case 'servo':
        c.add(0, mp ? `${f.name} = PWM(Pin(${g}), freq=50)` : `${f.name} = AngularServo(${g}, min_angle=0, max_angle=180, min_pulse_width=0.0005, max_pulse_width=0.0025)`);
        break;
      case 'relay':
        c.add(0, mp ? `${f.name} = Pin(${g}, Pin.OUT, value=0)  # 1 = relay on` : `${f.name} = OutputDevice(${g})`);
        break;
    }
  }
  c.blank();

  // ---------------------------------------------------------------- helpers
  c.add(0, '# ---- helpers ----');
  const now = mp ? 'time.ticks_ms()' : 'int(time.monotonic() * 1000)';
  const since = (t: string) => (mp ? `time.ticks_diff(time.ticks_ms(), ${t})` : `(now_ms() - ${t})`);
  if (!mp) c.add(0, 'def now_ms():', '    return int(time.monotonic() * 1000)', '');
  if (buttons.length && mp) {
    c.add(
      0,
      'class Edge:',
      '    """Turns a button pin into "was it just pressed?" events (with debounce)."""',
      '    def __init__(self, pin):',
      '        self.pin = pin',
      '        self.last = 1',
      '        self.t = 0',
      '',
      '    def pressed(self):',
      '        v = self.pin.value()',
      '        hit = False',
      '        if v != self.last and time.ticks_diff(time.ticks_ms(), self.t) > 30:',
      '            self.t = time.ticks_ms()',
      '            hit = v == 0  # pulled up: 0 means pressed',
      '            self.last = v',
      '        return hit',
      '',
    );
  } else if (buttons.length) {
    c.add(
      0,
      'class Edge:',
      '    """Turns a gpiozero Button into "was it just pressed?" events."""',
      '    def __init__(self, button):',
      '        self.button = button',
      '        self.last = False',
      '',
      '    def pressed(self):',
      '        v = self.button.is_pressed',
      '        hit = v and not self.last',
      '        self.last = v',
      '        return hit',
      '',
    );
  }
  c.add(0, 'def clamp(v, lo, hi):', '    return lo if v < lo else hi if v > hi else v', '');
  c.add(0, 'def scale(v, in_lo, in_hi, out_lo, out_hi):', '    """Map v from one range to another (like Arduino map())."""', '    v = clamp(v, min(in_lo, in_hi), max(in_lo, in_hi))', '    return out_lo + (v - in_lo) * (out_hi - out_lo) / (in_hi - in_lo)', '');
  if (net && mp)
    c.add(
      0,
      'def connect_wifi():',
      '    """Join the Wi-Fi network (waits up to 10 s). Returns True when connected."""',
      '    wlan = network.WLAN(network.STA_IF)',
      '    wlan.active(True)',
      '    if not wlan.isconnected():',
      '        print("Connecting to Wi-Fi", WIFI_SSID, "...")',
      '        wlan.connect(WIFI_SSID, WIFI_PASSWORD)',
      '        for _ in range(100):',
      '            if wlan.isconnected():',
      '                break',
      '            time.sleep_ms(100)',
      '    print("Wi-Fi", "connected:" if wlan.isconnected() else "NOT connected", wlan.ifconfig()[0])',
      '    return wlan.isconnected()',
      '',
    );
  if (wantWeather)
    c.add(
      0,
      'WEATHER_URL = ("https://api.open-meteo.com/v1/forecast?latitude={:.4f}&longitude={:.4f}"',
      '               "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m"',
      '               "&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3")',
      '',
      '# WMO weather codes → words (https://open-meteo.com/en/docs)',
      'SKY = {0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog",',
      '       51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain",',
      '       71: "Snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Downpour",',
      '       95: "Thunder", 96: "Thunder", 99: "Thunder"}',
      '',
      'def fetch_weather():',
      '    """Download the current weather from open-meteo.com (free, no API key). None on failure."""',
      '    try:',
      '        r = requests.get(WEATHER_URL.format(LATITUDE, LONGITUDE))',
      '        data = r.json()',
      '        r.close()',
      '        cur = data["current"]',
      '        day = data["daily"]',
      '        return {"temp": cur["temperature_2m"], "sky": SKY.get(cur["weather_code"], "?"),',
      '                "hi": day["temperature_2m_max"][0], "lo": day["temperature_2m_min"][0]}',
      '    except Exception as e:',
      '        print("Weather download failed:", e)',
      '        return None',
      '',
    );
  if (wantTime) {
    if (mp) c.add(0, 'def clock_text():', '    t = time.localtime(time.time() + UTC_OFFSET_H * 3600)', '    return "{:02d}:{:02d}".format(t[3], t[4])', '');
    else c.add(0, 'def clock_text():', '    return time.strftime("%H:%M")', '');
  }
  if (lcd) c.add(0, 'def row16(s):', '    """Pad or cut text to exactly one 16-character LCD row."""', '    s = str(s)[:16]', '    return s + " " * (16 - len(s))', '');
  if (leds.length) {
    c.add(0, 'def set_led(led, level):', '    """level: 0.0 (off) … 1.0 (full brightness)."""');
    c.add(1, mp ? 'led.duty_u16(int(clamp(level, 0, 1) * 65535))' : 'led.value = clamp(level, 0, 1)', '');
  }
  if (buzzer) {
    if (mp) c.add(0, `def tone(freq):`, `    if freq:`, `        ${buzzer.name}.freq(int(freq))`, `        ${buzzer.name}.duty_u16(32768)`, `    else:`, `        ${buzzer.name}.duty_u16(0)`, '');
    else c.add(0, `def tone(freq):`, `    if freq:`, `        ${buzzer.name}.frequency = int(freq)`, `        ${buzzer.name}.value = 0.5`, `    else:`, `        ${buzzer.name}.value = 0`, '');
    c.add(0, 'def beep(freq=2000, ms=60):', '    tone(freq)', mp ? '    time.sleep_ms(ms)' : '    time.sleep(ms / 1000)', '    tone(0)', '');
  }
  if (servo) {
    const servos = all(fs, 'servo');
    if (mp) c.add(0, 'def set_angle(deg):', '    """0–180°: 0.5 ms … 2.5 ms pulse every 20 ms."""', ...servos.map((sv) => `    ${sv.name}.duty_ns(int(500_000 + clamp(deg, 0, 180) * 2_000_000 / 180))`), '');
    else c.add(0, 'def set_angle(deg):', ...servos.map((sv) => `    ${sv.name}.angle = clamp(deg, 0, 180)`), '');
  }
  if (pixels || rgb) {
    c.add(0, 'def wheel(pos):', '    """Colour wheel: 0–255 → (r, g, b) going red → green → blue → red."""', '    pos = int(pos) % 256', '    if pos < 85:', '        return (255 - pos * 3, pos * 3, 0)', '    if pos < 170:', '        pos -= 85', '        return (0, 255 - pos * 3, pos * 3)', '    pos -= 170', '    return (pos * 3, 0, 255 - pos * 3)', '');
  }
  if (rgb) {
    if (mp) c.add(0, 'def set_rgb(r, g, b):', `    ${rgb.name}_r.duty_u16(int(r) * 257)`, `    ${rgb.name}_g.duty_u16(int(g) * 257)`, `    ${rgb.name}_b.duty_u16(int(b) * 257)`, '');
    else c.add(0, 'def set_rgb(r, g, b):', `    ${rgb.name}.color = (r / 255, g / 255, b / 255)`, '');
  }
  if (sonar && mp) {
    c.add(
      0,
      'def read_distance_cm():',
      '    """HC-SR04: 10 µs trigger pulse, then time the echo. Sound travels 1 cm in ~29 µs (there and back = 58)."""',
      `    ${sonar.name}_trig.value(0)`,
      '    time.sleep_us(2)',
      `    ${sonar.name}_trig.value(1)`,
      '    time.sleep_us(10)',
      `    ${sonar.name}_trig.value(0)`,
      `    t = time_pulse_us(${sonar.name}_echo, 1, 30000)`,
      '    return -1 if t < 0 else t / 58',
      '',
    );
  }
  for (const r of R) {
    const f = r.f;
    if (!['ldr', 'soil', 'pot', 'ntc'].includes(f.kind)) continue;
    const raw = mp ? `${f.name}.read_u16() / 65535` : `${f.name}.value`;
    if (f.kind === 'ntc')
      c.add(0, `def read_${f.name}_c():`, '    """NTC thermistor (top) + 10 kΩ (bottom) divider → °C using the B-parameter equation."""', `    v = ${raw} * 3.3`, '    if v <= 0.01 or v >= 3.29:', '        return float("nan")', '    r = 10000 * v / (3.3 - v)', '    return 1 / (1 / 298.15 + math.log(10000 / r) / 3950) - 273.15', '');
    else if (f.kind === 'soil') c.add(0, `def read_${f.name}_pct():`, '    """Capacitive probe: ~2.8 V in dry air, ~1.2 V in water."""', `    v = ${raw} * 3.3`, '    return clamp((2.8 - v) / 1.6 * 100, 0, 100)', '');
    else c.add(0, `def read_${f.name}_pct():`, `    return ${raw} * 100`, '');
  }
  c.blank();

  // ---------------------------------------------------------------- state
  c.add(0, '# ---- state ----');
  for (const b of buttons) c.add(0, `${b.name}_edge = Edge(${b.name})`);
  for (const r of R) for (const v of r.vars) c.add(0, `${v} = ${v === 'shakes' ? '0' : v === 'sky' || v === 'clock' ? '"--"' : v === 'motion' || v.endsWith('_on') ? 'False' : '0.0'}`);
  if (wantWeather) c.add(0, `last_weather = ${now} - WEATHER_EVERY_S * 1000  # fetch straight away`);
  if (epd) c.add(0, 'last_epd = None   # when the e-ink screen was last redrawn', 'shown_lines = None  # what it shows now');
  if (dhtF) c.add(0, `last_dht = ${mp ? 'time.ticks_ms()' : 'now_ms()'} - 5000`);
  const pages = displayPages(R, !!lcd);
  if (display && pages.length > 1) c.add(0, 'page = 0', `PAGES = ${pages.length}`, `last_page_flip = ${now}`);
  c.add(0, `last_print = ${now}`, `frame = 0`);
  if (relay) c.add(0, 'relay_on = False');
  if (pixels || rgb) c.add(0, 'hue = 0');
  if (imu) c.add(0, 'was_shaking = False');
  if (has(fs, 'pir') && buzzer) c.add(0, 'armed = True');
  if (sonar && buzzer) c.add(0, 'last_beep = 0');

  // Button actions, in order of usefulness.
  const actions: { code: string[]; desc: string }[] = [];
  if (wantWeather) actions.push({ code: ['last_weather = now - WEATHER_EVERY_S * 1000', ...(epd ? ['last_epd = None'] : [])], desc: 'refresh the weather now' });
  if (display && pages.length > 1) actions.push({ code: ['page = (page + 1) % PAGES', `last_page_flip = ${now}`], desc: 'show the next screen' });
  if (relay && !R.some((r) => r.alarm && ['soil', 'dht22', 'ntc', 'pir', 'ldr'].includes(r.f.kind))) actions.push({ code: ['relay_on = not relay_on'], desc: `toggle the ${relay.label.toLowerCase()}` });
  if (has(fs, 'pir') && buzzer) actions.push({ code: ['armed = not armed', 'beep(1500 if armed else 600, 120)'], desc: 'arm / disarm the alarm' });
  if (imu) actions.push({ code: ['shakes = 0'], desc: 'reset the shake counter' });
  const ledRoles = assignLedRoles(leds, R, !!buttons.length);
  const toggled = leds.filter((l) => ledRoles.get(l.name)?.kind === 'toggle');
  if (toggled.length) {
    c.add(0, ...toggled.map((l) => `${l.name}_on = False`));
    for (const l of toggled) actions.push({ code: [`${l.name}_on = not ${l.name}_on`], desc: `toggle the ${l.label}` });
  }
  if (buzzer && !actions.length) actions.push({ code: ['beep(1760, 80)'], desc: 'beep' });
  if (!actions.length) actions.push({ code: ['print("button pressed")'], desc: 'print a message' });
  c.blank();

  // ---------------------------------------------------------------- startup
  c.add(0, '# ---- startup ----');
  c.add(0, `print("${project.name} starting…")`);
  if (oled) c.add(0, 'oled.fill(0)', `oled.text("${short(project.name, 16)}", 0, 0)`, 'oled.text("Starting...", 0, 24)', 'oled.show()');
  if (lcd) c.add(0, 'lcd.clear()', `lcd.putstr("${short(project.name, 16)}")`, 'lcd.move_to(0, 1)', 'lcd.putstr("Starting...")');
  if (net && mp) c.add(0, 'online = connect_wifi()');
  if (wantTime && mp) c.add(0, 'if online:', '    try:', '        ntptime.settime()  # set the clock from the internet', '    except OSError:', '        print("Could not get the time from the internet")');
  if (buzzer) c.add(0, 'for f in (1047, 1319, 1568):  # little start-up chirp', '    beep(f, 70)');
  if (servo) c.add(0, 'set_angle(90)');
  buttons.forEach((b, i) => {
    const a = actions[i % actions.length];
    c.add(0, `# ${b.label}: ${a.desc}`);
  });
  c.blank();

  // ---------------------------------------------------------------- main loop
  c.add(0, '# ---- main loop ----', 'while True:');
  const L = (...ls: string[]) => c.add(1, ...ls);
  L(`now = ${now}`);
  // Readings
  if (wantWeather)
    L(`if ${since('last_weather')} >= WEATHER_EVERY_S * 1000:`, '    last_weather = now', '    w = fetch_weather()', '    if w:', '        out_temp, sky, out_hi, out_lo = w["temp"], w["sky"], w["hi"], w["lo"]');
  if (wantTime) L('clock = clock_text()');
  for (const r of R) {
    const f = r.f;
    switch (f.kind) {
      case 'dht22':
        L(`if ${since('last_dht')} >= 2000:  # the DHT22 can only be read every 2 s`);
        L(`    last_dht = now`);
        if (mp) L('    try:', `        ${f.name}.measure()`, `        temp_c = ${f.name}.temperature()`, `        humidity = ${f.name}.humidity()`, '    except OSError as e:', '        print("DHT22 read failed:", e)');
        else L('    try:', `        temp_c = ${f.name}.temperature`, `        humidity = ${f.name}.humidity`, '    except RuntimeError as e:', '        print("DHT22 read failed:", e)');
        break;
      case 'mpu6050':
        L('ax, ay, az = imu.accel()', 'roll = math.degrees(math.atan2(ay, az))', 'pitch = math.degrees(math.atan2(-ax, math.sqrt(ay * ay + az * az)))', 'g_total = math.sqrt(ax * ax + ay * ay + az * az)', 'shaking = g_total > 1.6', 'if shaking and not was_shaking:', '    shakes += 1', 'was_shaking = shaking');
        break;
      case 'hcsr04':
        if (mp) L('d = read_distance_cm()', 'if d > 0:', '    distance_cm = d');
        else L(`distance_cm = ${f.name}.distance * 100`);
        break;
      case 'pir':
        L(mp ? `motion = ${f.name}.value() == 1` : `motion = ${f.name}.motion_detected`);
        break;
      case 'ldr':
      case 'soil':
      case 'pot':
        L(`${f.name}_pct = read_${f.name}_pct()`);
        break;
      case 'ntc':
        L(`${f.name}_c = read_${f.name}_c()`);
        break;
      case 'switch':
        L(mp ? `${f.name}_on = ${f.name}.value() == 0` : `${f.name}_on = ${f.name}.is_pressed`);
        break;
    }
  }
  // Buttons
  buttons.forEach((b, i) => {
    const a = actions[i % actions.length];
    L(`if ${b.name}_edge.pressed():  # ${a.desc}`);
    for (const line of a.code) L(`    ${line}`);
    if (buzzer && !a.code.some((x) => x.includes('beep'))) L('    beep(2500, 15)');
  });
  // Auto page flip when no buttons
  if (display && pages.length > 1 && !buttons.length) L(`if ${since('last_page_flip')} > 3000:  # no buttons: flip screens automatically`, '    page = (page + 1) % PAGES', '    last_page_flip = now');
  // LEDs
  if ([...ledRoles.values()].some((r) => r.kind === 'traffic')) L('phase = (now // 1000) % 10  # 10 s traffic-light cycle');
  for (const l of leds) {
    const role = ledRoles.get(l.name)!;
    L(`# ${l.label}: ${role.desc}`);
    L(`set_led(${l.name}, ${role.expr})`);
  }
  // Buzzer behaviours
  if (buzzer) {
    if (has(fs, 'pir')) L('if armed and motion:', '    tone(2200 if (frame // 4) % 2 else 1600)  # siren', 'else:', '    tone(0)');
    else if (sonar) L('if 0 < distance_cm < 100:  # parking sensor: beep faster when closer', `    gap = scale(distance_cm, 5, 100, 80, 900)`, `    if ${since('last_beep')} > gap:`, '        last_beep = now', '        beep(2000, 40)');
    else {
      const al = R.find((r) => r.alarm && r.f.kind !== 'mpu6050');
      if (al) L(`if ${al.alarm!.cond} and frame % 40 == 0:  # warning beep every 2 s`, '    beep(880, 120)');
      else if (imu) L('if shaking:', '    beep(1200, 30)');
    }
  }
  // Servo
  if (servo) {
    if (levelSrc?.level) L(`set_angle(scale(${levelSrc.level.expr}, ${levelSrc.level.lo}, ${levelSrc.level.hi}, 0, 180))  # ${levelSrc.level.label} → angle`);
    else L('set_angle(90 + 80 * math.sin(frame / 20))  # sweep back and forth');
  }
  // Relay
  if (relay) {
    const soil = R.find((r) => r.f.kind === 'soil');
    const temp = R.find((r) => r.f.kind === 'dht22' || r.f.kind === 'ntc');
    const pir = R.find((r) => r.f.kind === 'pir');
    const ldr = R.find((r) => r.f.kind === 'ldr');
    if (soil) L(`if ${soil.alarm!.cond}:  # water the plant`, '    relay_on = True', `elif ${soil.alarm!.clear}:`, '    relay_on = False');
    else if (temp) L(`relay_on = ${temp.alarm!.cond}  # turn the fan on when it's hot`);
    else if (pir) L('relay_on = motion  # light on while there is motion');
    else if (ldr) L(`relay_on = ${ldr.alarm!.cond}  # lamp on when it's dark`);
    L(mp ? `${relay.name}.value(1 if relay_on else 0)` : `${relay.name}.value = 1 if relay_on else 0`);
  }
  // Colour outputs
  if (pixels || rgb) {
    const src = R.find((r) => r.level && r.f.kind !== 'pot') ?? levelSrc;
    if (src?.level) L(`hue = scale(${src.level.expr}, ${src.level.lo}, ${src.level.hi}, 170, 0)  # ${src.level.label}: blue (low) → red (high)`);
    else L('hue = (hue + 3) % 256  # rainbow');
    if (pixels) {
      const n = pixels.props?.pixels ?? 12;
      L(`for i in range(${n}):`, `    r, g, b = wheel(hue + i * ${src?.level ? 0 : Math.round(256 / n)})`, `    ${pixels.name}[i] = (r // 4, g // 4, b // 4)  # quarter brightness saves power`);
      L(mp ? `${pixels.name}.write()` : `${pixels.name}.show()`);
    }
    if (rgb) L('set_rgb(*wheel(hue))');
  }
  // Display
  if (epd) {
    const lines = R.flatMap((r) => r.lines);
    L('# e-ink: only redraw when something changed, and not more than once a minute');
    L(`lines = [${lines.map((l) => `f"${l}"`).join(', ')}]`);
    L(`if lines != shown_lines and (last_epd is None or ${since('last_epd')} >= EPD_MIN_S * 1000):`);
    L('    epd.fill(0)', `    epd.text("${short(project.name, 34)}", 6, 6, 1)`, '    epd.hline(0, 18, 296, 1)');
    if (wantWeather) L('    epd.big_text(f"{out_temp:.0f}C", 8, 30, 4, 1)  # big outside temperature', '    epd.text(sky, 8, 70, 1)');
    L(`    for i, line in enumerate(lines${wantWeather ? '[1:]' : ''}):`, `        epd.text(line, ${wantWeather ? 150 : 8}, ${wantWeather ? 34 : 30} + i * 14, 1)`);
    L('    epd.show()  # takes about 2 seconds', '    shown_lines = lines', '    last_epd = now');
  }
  if (oled) {
    L('oled.fill(0)');
    L(`oled.text("${short(project.name, pages.length > 1 ? 12 : 16)}", 0, 0)`, 'oled.hline(0, 10, 128, 1)');
    if (pages.length) {
      pages.forEach((pg, i) => {
        if (pages.length > 1) L(`${i === 0 ? 'if' : 'elif'} page == ${i}:`);
        const ind = pages.length > 1 ? '    ' : '';
        if (pg.kind === 'level') {
          L(`${ind}# bubble level: the dot moves as you tilt the board`, `${ind}oled.rect(34, 14, 60, 48, 1)`, `${ind}oled.hline(34, 38, 60, 1)`, `${ind}oled.vline(64, 14, 48, 1)`, `${ind}bx = int(scale(roll, -45, 45, 36, 91))`, `${ind}by = int(scale(pitch, -45, 45, 16, 59))`, `${ind}oled.fill_rect(bx - 2, by - 2, 5, 5, 1)`);
        } else pg.lines.forEach((ln, j) => L(`${ind}oled.text(f"${ln}", 0, ${14 + j * 10})`));
      });
      if (pages.length > 1) L('oled.text(f"{page + 1}/{PAGES}", 104, 0)');
    } else L('oled.text("Hello!", 0, 24)');
    L('oled.show()');
  }
  if (lcd) {
    L('if frame % 5 == 0:  # the LCD is slow; refresh 4x a second');
    if (pages.length) {
      pages.forEach((pg, i) => {
        if (pages.length > 1) L(`    ${i === 0 ? 'if' : 'elif'} page == ${i}:`);
        const ind = pages.length > 1 ? '        ' : '    ';
        const rows = pg.lines.slice(0, 2);
        while (rows.length < 2) rows.push('');
        rows.forEach((ln, j) => L(`${ind}lcd.move_to(0, ${j})`, `${ind}lcd.putstr(row16(${ln ? `f"${ln}"` : '""'}))`));
      });
    } else L('    lcd.move_to(0, 0)', `    lcd.putstr("${short(project.name, 16)}")`);
  }
  // Serial log
  const logParts = R.flatMap((r) => r.lines.map((l) => l.replace(/\s+/g, ' ')));
  L(`if ${since('last_print')} >= 1000:  # log once a second to the serial console`, '    last_print = now');
  L(`    print(f"${logParts.join(' | ') || 'running, frame {frame}'}")`);
  L('frame += 1');
  L(mp ? 'time.sleep_ms(LOOP_MS)' : 'time.sleep(LOOP_MS / 1000)');
  return c.toString();
}

interface Page {
  kind: 'text' | 'level';
  lines: string[];
}

function displayPages(R: Reading[], lcd: boolean): Page[] {
  const perPage = lcd ? 2 : 5;
  const lines = R.flatMap((r) => (lcd ? r.lines.map((l) => l.replace('Temp ', 'T ').replace('Hum  ', 'H ')) : r.lines));
  const pages: Page[] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push({ kind: 'text', lines: lines.slice(i, i + perPage) });
  if (!lcd && R.some((r) => r.f.kind === 'mpu6050')) pages.push({ kind: 'level', lines: [] });
  return pages;
}

function assignLedRoles(leds: FeatureInstance[], R: Reading[], hasButtons: boolean) {
  const roles = new Map<string, { kind: string; expr: string; desc: string }>();
  const colors = leds.map((l) => l.props?.color);
  const traffic = leds.length === 3 && colors.join(',') === 'red,yellow,green' && !R.some((r) => r.alarm);
  if (traffic) {
    const [red, yellow, green] = leds;
    roles.set(red.name, { kind: 'traffic', expr: '1 if phase < 4 else 0', desc: 'traffic light — red for 4 s' });
    roles.set(yellow.name, { kind: 'traffic', expr: '1 if phase in (4, 9) else 0', desc: 'amber for 1 s between' });
    roles.set(green.name, { kind: 'traffic', expr: '1 if 5 <= phase < 9 else 0', desc: 'green for 4 s' });
    return roles;
  }
  const alarms = R.filter((r) => r.alarm);
  const knob = R.find((r) => r.f.kind === 'pot');
  const light = R.find((r) => r.f.kind === 'ldr');
  let ai = 0;
  leds.forEach((l, i) => {
    if (knob && i === 0) {
      roles.set(l.name, { kind: 'level', expr: `${knob.f.name}_pct / 100`, desc: 'brightness follows the knob' });
      return;
    }
    if (light && !roles.size && /white|yellow/.test(l.props?.color ?? '')) {
      roles.set(l.name, { kind: 'night', expr: `scale(${light.f.name}_pct, DARK_PCT, 5, 0, 1)`, desc: 'night light: brighter as it gets darker' });
      return;
    }
    const a = alarms[ai++];
    if (a) {
      roles.set(l.name, { kind: 'alarm', expr: `1 if ${a.alarm!.cond} else 0`, desc: `on when ${a.alarm!.label}` });
      return;
    }
    if (hasButtons && i > 0) {
      roles.set(l.name, { kind: 'toggle', expr: `1 if ${l.name}_on else 0`, desc: 'toggled by a button' });
      return;
    }
    if (hasButtons && ![...roles.values()].some((r) => r.kind === 'toggle') && leds.length === 1 && !alarms.length) {
      roles.set(l.name, { kind: 'toggle', expr: `1 if ${l.name}_on else 0`, desc: 'toggled by a button' });
      return;
    }
    roles.set(l.name, { kind: 'heartbeat', expr: '0.6 if (now // 500) % 2 else 0', desc: 'heartbeat blink (shows the program is running)' });
  });
  return roles;
}

function short(s: string, n: number) {
  return s.replace(/"/g, "'").replace(/[^\x20-\x7e]/g, '').slice(0, n);
}
