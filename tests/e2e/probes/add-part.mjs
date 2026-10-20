// E2E: open an example, add a component by part number (datasheet fetch), add & wire it, run.
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:5174';
const query = process.argv[3] ?? 'VL53L0X';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(`${base}/?example=esp32-weather-imu&notour`);
await p.waitForSelector('.part');
await p.click('.add-part');
await p.fill('.any-part-form input', query);
await p.click('.any-part-form button');
const t0 = Date.now();
await p.waitForSelector('.part-card, .any-part .banner.error', { timeout: 300000 });
console.log('lookup s:', ((Date.now() - t0) / 1000).toFixed(0));
await p.screenshot({ path: 'test-results/add-part-1-card.png' });
const err = await p.$('.any-part .banner.error');
if (err) console.log('ERROR', await err.textContent());
else {
  console.log((await p.textContent('.part-card')).slice(0, 500));
  await p.click('text=Add & wire it');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'test-results/add-part-2-wired.png' });
  console.log('chat:', (await p.textContent('.msg.ai:last-child')).slice(0, 400));
  await p.click('button.run');
  await p.waitForTimeout(3000);
  await p.screenshot({ path: 'test-results/add-part-3-running.png' });
}
console.log('errors', errors);
await b.close();
