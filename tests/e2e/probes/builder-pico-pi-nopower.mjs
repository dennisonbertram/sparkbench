import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
for (const ex of ['rpi-thermostat','rpi-plant-waterer']) {
  await p.goto('http://localhost:5173/?example='+ex+'&notour');
  await p.waitForSelector('.part'); await p.waitForTimeout(800);
  console.log(ex, 'before run:', await p.locator('text=No power').count());
  await p.click('button.run'); await p.waitForTimeout(2500);
  console.log(ex, 'running:', await p.locator('text=No power').count());
  await p.screenshot({ path: `test-results/qa/builder-pico-pi/nopower-${ex}.png` });
  await p.click('button.run');
}
await b.close();
