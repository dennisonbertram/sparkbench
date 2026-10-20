// builder-esp32: isolate white-screen crash. node tests/e2e/probes/builder-esp32-crash.mjs <variant>
import { chromium } from 'playwright';
import fs from 'fs';
const v = process.argv[2] || 'a';
const dir = `test-results/qa/builder-esp32/crash`;
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 600)); });
p.on('pageerror', e => console.log('PAGEERROR', e.message, (e.stack || '').slice(0, 800)));
await p.goto('http://localhost:5173/?welcome&notour');
await p.waitForSelector('.hero-input textarea'); await p.fill('.hero-input textarea', 'ESP32 room monitor with a PIR motion sensor, an LCD display and a light sensor');
await p.click('button.primary.big');
await p.waitForSelector('.part');
await p.waitForTimeout(1000);
const alive = async (tag) => console.log(tag, 'tabs present:', await p.locator('.tabs button').count());
if (v.includes('r')) { await p.click('button.run'); await p.waitForTimeout(2000); await alive('after run'); }
const vals = { a: '1999.1', b: '1000.1', c: '5.1', d: '300.1' };
for (const ch of v) if (vals[ch]) {
  await p.locator('input[aria-label="Light"]').fill(vals[ch]);
  await p.waitForTimeout(1500);
  await alive('after light=' + vals[ch]);
}
if (v.includes('m')) {
  await p.locator('.momentary').first().click();
  await p.waitForTimeout(1500); await alive('after motion click');
}
await p.screenshot({ path: `${dir}/${v}.png` });
await b.close();
