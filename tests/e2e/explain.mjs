// E2E: hover a line in the code editor → plain-English explanation naming the part; "Explain with AI" (live) when --ai.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:5173/?example=esp32-weather-imu&notour');
await p.waitForSelector('.part');
await p.click('.tabs button:has-text("Code")');
await p.waitForSelector('.cm-line');
const line = p.locator('.cm-line', { hasText: 'btn_a = Pin(13' }).first();
await line.hover();
await p.waitForSelector('[data-testid=code-explain]', { timeout: 5000 });
const text = await p.textContent('[data-testid=code-explain]');
console.log('hover:', text);
let ai = '';
if (process.argv.includes('--ai')) {
  await p.click('[data-testid=code-explain] button');
  await p.waitForSelector('.cm-explain-ai', { timeout: 120000 });
  ai = await p.textContent('.cm-explain-ai');
  console.log('AI:', ai);
}
await p.screenshot({ path: 'test-results/explain.png' });
console.log('errors:', errors);
await b.close();
const pass = /pin 13 is Button A/.test(text) && (!process.argv.includes('--ai') || ai.length > 40) && !errors.length;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
