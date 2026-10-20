// E2E: the Build guide's step-by-step breadboard mode, for a few examples.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
let fail = 0;
for (const ex of ['pico-traffic-light', 'esp32-weather-imu', '555-blinker', 'rpi-plant-waterer']) {
  await p.goto(`http://localhost:5173/?example=${ex}&notour`);
  await p.evaluate(() => localStorage.clear());
  await p.goto(`http://localhost:5173/?example=${ex}&notour`);
  await p.waitForSelector('.part');
  await p.click('.tabs button:has-text("Build guide")');
  await p.click('[data-testid=build-start]');
  const first = await p.textContent('[data-testid=build-step-text]');
  await p.screenshot({ path: `test-results/build-mode-${ex}-1.png` });
  const count = Number((await p.textContent('.bm-count')).match(/of (\d+)/)[1]);
  for (let i = 1; i < Math.min(5, count); i++) await p.click('[data-testid=build-next]');
  await p.screenshot({ path: `test-results/build-mode-${ex}-5.png` });
  for (let i = 5; i < count - 1; i++) await p.keyboard.press('ArrowRight');
  const last = await p.textContent('[data-testid=build-step-text]');
  await p.screenshot({ path: `test-results/build-mode-${ex}-last.png` });
  const figure = await p.locator('.prose .breadboard-figure svg').count();
  console.log(`${ex}: ${count} steps; first: ${first.slice(0, 60)}… last: ${last.slice(0, 70)}… doc figure: ${figure}`);
  if (!figure || count < 5) fail++;
}
console.log('errors:', errors);
await b.close();
process.exit(fail || errors.length ? 1 : 0);
