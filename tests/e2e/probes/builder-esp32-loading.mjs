// builder-esp32: what does the user see while the AI designs?
import { chromium } from 'playwright';
const dir = 'test-results/qa/builder-esp32/loading';
import fs from 'fs'; fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:5173/?welcome&notour');
await p.waitForSelector('.hero-input textarea');
await p.fill('.hero-input textarea', 'ESP32 tilt-controlled servo using an MPU6050 IMU');
const t0 = Date.now();
await p.click('button.primary.big');
for (const s of [1, 5, 20, 45]) {
  while (Date.now() - t0 < s * 1000) await p.waitForTimeout(200);
  const st = await p.evaluate(() => ({ btn: document.querySelector('button.primary.big')?.outerHTML?.slice(0, 200), ta: document.querySelector('.hero-input textarea')?.disabled, parts: document.querySelectorAll('.part').length, busy: document.querySelector('[aria-busy=true], .spinner, .loading, .thinking')?.outerHTML?.slice(0, 200) }));
  console.log(s, 's', JSON.stringify(st));
  await p.screenshot({ path: `${dir}/t${s}.png` });
  if (st.parts) break;
}
await p.waitForSelector('.part', { timeout: 150000 });
console.log('done after', (Date.now() - t0) / 1000, 's');
await b.close();
