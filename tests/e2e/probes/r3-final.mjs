import { chromium } from 'playwright';
const b = await chromium.launch();
const shot = async (opts, url, actions, path) => {
  const p = await (await b.newContext(opts)).newPage();
  await p.goto(url);
  await p.waitForSelector('.part');
  await p.waitForTimeout(600);
  await actions(p);
  await p.screenshot({ path });
  await p.close();
};
const D = { viewport: { width: 1440, height: 900 } };
await shot({ ...D, colorScheme: 'dark' }, 'http://localhost:5173/?example=esp32-weather-imu&notour', async (p) => { await p.click('.tabs button:has-text("Code")'); await p.waitForTimeout(500); }, 'test-results/final-dark-code.png');
await shot(D, 'http://localhost:5173/?example=esp32-pedometer&notour', async (p) => { await p.click('button.run'); await p.waitForTimeout(2500); }, 'test-results/final-chips.png');
await shot(D, 'http://localhost:5173/?example=555-tone&notour', async (p) => { await p.click('button.run'); await p.waitForTimeout(800); const btn = p.locator('.part[data-part^="pushbutton"] wokwi-pushbutton'); const bb = await btn.boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(1500); }, 'test-results/final-555-scope.png');
await shot(D, 'http://localhost:5173/?example=esp32-weather-imu&notour', async (p) => { await p.click('.tabs button:has-text("Schematic")'); await p.waitForTimeout(800); }, 'test-results/final-schematic.png');
await shot({ viewport: { width: 1024, height: 768 } }, 'http://localhost:5173/?example=pico-traffic-light&notour', async (p) => { await p.click('button.run'); await p.waitForTimeout(1500); }, 'test-results/final-1024-running.png');
await shot(D, 'http://localhost:5173/?example=esp32-weather-imu&notour', async (p) => {
  await p.click('.add-part');
  await p.waitForSelector('.lib-item:has-text("VL53L0X")');
  await p.click('.lib-item:has-text("VL53L0X")');
  await p.waitForTimeout(1200);
}, 'test-results/final-custom-part.png');
await b.close();
