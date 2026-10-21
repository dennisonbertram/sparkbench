import { describe, it, expect } from 'vitest';
import { explainLine } from '../../src/core/explain';
import { buildExample } from '../../src/core/examples';

describe('explain a line of code', () => {
  const p = buildExample('esp32-weather-imu');
  it('explains hardware setup and names the part on the pin', () => {
    expect(explainLine('btn_a = Pin(13, Pin.IN, Pin.PULL_UP)  # Button A: pressed = 0', p)).toMatch(/pull-up.*pin 13 is Button A/);
    expect(explainLine('i2c = I2C(0, scl=Pin(22), sda=Pin(21), freq=400000)', p)).toMatch(/I2C bus.*pin 22 is OLED display \(SCL\)/);
  });
  it('explains common Python and timing constructs', () => {
    expect(explainLine('while True:')).toMatch(/main loop/);
    expect(explainLine('    time.sleep_ms(50)')).toMatch(/Waits 50 milliseconds/);
    expect(explainLine('led.duty_u16(32768)')).toMatch(/50 %/);
    expect(explainLine('import ssd1306')).toMatch(/OLED/);
    expect(explainLine('')).toBeNull();
  });
  it('has something to say about every non-blank line of every example program', () => {
    for (const id of ['esp32-weather-imu', 'pico-simon', 'rpi-weather-dashboard']) {
      const src = buildExample(id).files['main.py'];
      for (const l of src.split('\n')) if (l.trim()) expect(explainLine(l)).toBeTruthy();
    }
  });
  it("explains the program's own function calls, inline conditions and counters (not a generic line)", () => {
    const p = buildExample('pico-traffic-light');
    const src = p.files['main.py'];
    const lines = src.split('\n');
    const at = (needle: string) => {
      const i = lines.findIndex((l) => l.includes(needle));
      return explainLine(lines[i], p, { source: src, line: i + 1 })!;
    };
    const red = at('set_led(led_red,');
    expect(red).toMatch(/Runs set_led, a function defined earlier/);
    expect(red).toMatch(/1 while phase is below 4, otherwise 0/);
    expect(at('5 <= phase < 9')).toMatch(/phase is from 5 up to \(but not including\) 9/);
    expect(explainLine('    frame += 1')).toMatch(/Adds 1 to frame/);
    expect(at('"""Turns an LED')).toMatch(/docstring/);
    lines.forEach((l, i) => l.trim() && expect(explainLine(l, p, { source: src, line: i + 1 })).not.toBe('Runs this step of the program.'));
  });
  it('keeps the trailing comment out of the code description and offers it as a note', () => {
    const t = explainLine("phase = (now // 1000) % CYCLE_S  # which second of the cycle we're in")!;
    expect(t).not.toMatch(/CYCLE_S\s+#/);
    expect(t).toMatch(/note on this line says: “which second of the cycle we're in”/);
    expect(explainLine('last_colour = None    # remembers the colour')).toMatch(/Sets last_colour to nothing yet \(None\)/);
    expect(explainLine('print("a # b")')).not.toMatch(/note/);
  });
  it('gives a project-specific reason for PWM and avoids tool jargon', () => {
    const p = buildExample('pico-traffic-light');
    expect(explainLine('led_red = PWM(Pin(2), freq=1000, duty_u16=0)  # Red', p)).toMatch(/how bright Red is/);
    expect(explainLine('print("hi")')).not.toMatch(/mpremote|repl/);
  });
});
