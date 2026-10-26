import { chromium } from 'playwright';
import fs from 'fs';
const dir = 'test-results/qa/verify-loading'; fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:5173/?welcome&notour');
await p.waitForSelector('.hero-input textarea');
await p.waitForTimeout(1500);
console.log('status', await p.evaluate(() => fetch('/api/status').then(r => r.json())));
await p.fill('.hero-input textarea', 'ESP32 tilt-controlled servo using an MPU6050 IMU');
const t0 = Date.now();
await p.click('button.primary.big');
for (const s of [1, 5, 20]) {
  while (Date.now() - t0 < s * 1000) await p.waitForTimeout(200);
  const st = await p.evaluate(() => ({ designing: !!document.querySelector('.welcome.designing'), h1: document.querySelector('h1')?.textContent, hint: document.querySelector('.hero-hint')?.textContent, now: document.querySelector('[data-testid=tool-call][data-state=running]')?.textContent, btn: !!document.querySelector('button.primary.big'), parts: document.querySelectorAll('.part').length }));
  console.log(s, 's', JSON.stringify(st));
  await p.screenshot({ path: `${dir}/t${s}.png` });
}
await p.waitForSelector('.part', { timeout: 150000 }).catch(() => {});
console.log('done after', (Date.now() - t0) / 1000, 's', await p.evaluate(() => document.querySelectorAll('.part').length));
await p.screenshot({ path: `${dir}/done.png` });
await b.close();
