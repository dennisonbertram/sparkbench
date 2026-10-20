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
});
