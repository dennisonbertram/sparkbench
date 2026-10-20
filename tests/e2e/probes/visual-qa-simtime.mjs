import { chromium } from 'playwright';
const BASE='http://localhost:5173';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:1440,height:900}});
for (const id of ['555-blinker','transistor-switch','pico-traffic-light']) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?example=${id}&notour`);
  await page.waitForSelector('[data-testid="breadboard"] .part');
  await page.waitForTimeout(900);
  await page.click('button.run');
  const t0=Date.now(); const out=[];
  for (let i=0;i<6;i++){ await page.waitForTimeout(1000); out.push(((Date.now()-t0)/1000).toFixed(1)+'s wall -> '+(await page.textContent('.sim-time'))); }
  console.log(id, out.join(' | '));
  await page.close();
}
await browser.close();
