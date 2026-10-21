// E2E (live Claude + arduino-cli): make the Arduino version from the Code tab; it must compile, and
// the MicroPython simulation must still run with the C++ files in the project.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:5173/?example=pico-traffic-light&notour');
await p.evaluate(() => localStorage.clear());
await p.goto('http://localhost:5173/?example=pico-traffic-light&notour');
await p.waitForSelector('.part');
await p.click('.tabs button:has-text("Code")');
await p.click('[data-testid=arduino-make]');
await p.waitForSelector('[data-testid=arduino-msg]', { timeout: 900000 });
const msg = await p.textContent('[data-testid=arduino-msg]');
console.log('msg:', msg.slice(0, 300));
const tabs = await p.$$eval('.file-tabs [role=tab]', (els) => els.map((e) => e.textContent));
console.log('tabs:', tabs.join(' | '));
await p.screenshot({ path: 'test-results/arduino.png' });
await p.click('.run');
await p.waitForTimeout(4000);
const status = await p.textContent('.status');
console.log('sim status:', status);
console.log('errors:', errors);
await b.close();
const pass = /Compiled for Raspberry Pi Pico/.test(msg) && tabs.some((t) => /\.ino/.test(t)) && /Running/.test(status) && !errors.length;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
