// E2E: the Power card measures the running program and lists battery life per battery type.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:5173/?example=esp32-eink-weather&notour');
await p.waitForSelector('.part');
await p.click('[data-testid=power-card] summary');
await p.waitForSelector('[data-testid=power-table]', { timeout: 120000 });
await p.fill('.power-hours input', '8');
const text = await p.textContent('[data-testid=power-card]');
console.log(text.replace(/\s+/g, ' ').slice(0, 700));
await p.locator('[data-testid=power-card]').screenshot({ path: 'test-results/power-card.png' });
console.log('errors:', errors);
await b.close();
const pass = /draws about \d+/.test(text) && /18650/.test(text) && /deep sleep/.test(text) && !errors.length;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
