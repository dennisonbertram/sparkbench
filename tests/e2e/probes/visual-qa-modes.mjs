import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE='http://localhost:5173';
const OUT='test-results/qa/visual-qa/modes'; mkdirSync(OUT,{recursive:true});
const browser = await chromium.launch();
const examples=['esp32-weather-imu','rpi-plant-waterer','555-blinker'];
const configs=[
  {name:'dark', viewport:{width:1440,height:900}, colorScheme:'dark'},
  {name:'w1024', viewport:{width:1024,height:768}, colorScheme:'light'},
  {name:'w800', viewport:{width:800,height:900}, colorScheme:'light'},
];
for (const c of configs){
  const ctx=await browser.newContext({viewport:c.viewport,colorScheme:c.colorScheme,deviceScaleFactor:1});
  const page=await ctx.newPage();
  page.on('pageerror',e=>console.log(c.name,'pageerror',String(e)));
  await page.goto(`${BASE}/?welcome&notour`); await page.waitForSelector('.hero'); await page.waitForTimeout(500);
  await page.screenshot({path:`${OUT}/${c.name}-welcome.png`});
  await page.screenshot({path:`${OUT}/${c.name}-welcome-full.png`, fullPage:true});
  const sw = await page.evaluate(()=>({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth}));
  console.log(c.name,'welcome scroll', JSON.stringify(sw));
  for (const id of examples){
    await page.goto(`${BASE}/?example=${id}&notour`);
    await page.waitForSelector('[data-testid="breadboard"] .part'); await page.waitForTimeout(900);
    await page.screenshot({path:`${OUT}/${c.name}-${id}-1-breadboard.png`});
    const ov = await page.evaluate(()=>({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth, sh:document.documentElement.scrollHeight, ch:document.documentElement.clientHeight}));
    console.log(c.name,id,'scroll',JSON.stringify(ov));
    await page.click('button.run'); await page.waitForTimeout(3000);
    await page.screenshot({path:`${OUT}/${c.name}-${id}-2-running.png`});
    await page.click('.console-tabs button:nth-child(2)'); await page.waitForTimeout(200);
    await page.click('button.run').catch(()=>{});
    const tabs={schematic:'Schematic',code:'Code',bom:'Parts list',guide:'Build guide',blog:'Blog post'};
    let n=3;
    for (const [v,l] of Object.entries(tabs)){
      const t=page.locator('.tabs button',{hasText:l}); if(!(await t.count())) continue;
      if (c.name!=='dark' && !['schematic','bom'].includes(v)) continue;
      await t.click(); await page.waitForTimeout(500);
      await page.screenshot({path:`${OUT}/${c.name}-${id}-${n++}-${v}.png`});
    }
  }
  await ctx.close();
}
await browser.close();
