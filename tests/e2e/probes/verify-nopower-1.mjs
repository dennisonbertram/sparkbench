import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const ex of ['rpi-thermostat', 'rpi-plant-waterer', 'pico-traffic-light']) {
  await p.goto(`http://localhost:5173/?example=${ex}&notour`);
  await p.waitForTimeout(2500);
  const before = await p.locator('.nopower').count();
  await p.click('button.run');
  await p.waitForTimeout(4000);
  const during = await p.locator('.nopower').count();
  const which = await p.$$eval('.part.unpowered', els => els.map(e => e.dataset.part));
  await p.screenshot({ path: `test-results/qa/verify-nopower/${ex}.png` });
  console.log(ex, { before, during, which });
  await p.click('button.run');
}
await b.close();
