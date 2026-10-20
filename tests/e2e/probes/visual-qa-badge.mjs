import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})).newPage();
for (const id of ['pico-servo-dial','esp32-neopixel-thermo']) {
  await page.goto(`http://localhost:5173/?example=${id}&notour`);
  await page.waitForSelector('[data-testid="breadboard"] .part'); await page.waitForTimeout(800);
  console.log(id,'before run tab:', JSON.stringify(await page.textContent('.console-tabs button:nth-child(2)')));
  await page.click('button.run'); await page.waitForTimeout(2000);
  await page.click('.console-tabs button:nth-child(2)'); await page.waitForTimeout(300);
  console.log(id,'running tab:', JSON.stringify(await page.textContent('.console-tabs button:nth-child(2)')));
  const cls = await page.$$eval('[data-testid=problems] > *', els=>els.map(e=>e.className));
  console.log(id,'problem classes', JSON.stringify(cls));
  await page.screenshot({path:`test-results/qa/visual-qa/zoom/${id}-problems.png`, clip:{x:320,y:712,width:820,height:150}});
}
await browser.close();
