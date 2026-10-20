import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:5173/?example=pico-servo-dial&notour');
await p.waitForSelector('.part'); await p.click('button.run'); await p.waitForTimeout(1500);
const s = p.locator('.simctl input[type=range]').first();
for (const v of [0, 50, 100]) {
  await s.evaluate((el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await p.waitForTimeout(800);
  await p.locator('.part[data-part^=potentiometer]').first().screenshot({ path: `test-results/qa/builder-pico-pi/knob-${v}.png` });
}
await b.close();
