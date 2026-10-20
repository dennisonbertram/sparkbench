import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const ex of ['rpi-plant-waterer','rpi-thermostat','esp32-weather-imu']) {
  await p.goto(`http://localhost:5173/?example=${ex}&notour`);
  await p.waitForTimeout(2000);
  const before = await p.locator('.nopower').count();
  await p.locator('button.run').click();
  await p.waitForTimeout(2500);
  const info = await p.$$eval('.nopower', els => els.map(e => ({t: e.textContent, parent: e.closest('[data-part]')?.getAttribute('data-part') || e.parentElement?.outerHTML.slice(0,200)})));
  const serial = await p.locator('[data-testid=serial]').innerText().catch(()=>'');
  console.log(ex, 'before', before, 'after', JSON.stringify(info), 'serial:', serial.slice(0,200));
  await p.screenshot({ path: `test-results/qa/rpinopower/${ex}.png` });
}
await b.close();
