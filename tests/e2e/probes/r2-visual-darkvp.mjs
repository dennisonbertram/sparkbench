import { chromium } from 'playwright';
const B='http://localhost:5173', O='test-results/qa2/visual';
const browser = await chromium.launch();
const tabs=['Schematic','Code','Parts list','Build guide','Blog post'];
async function shoot(ctx, url, prefix, {run=true, allTabs=true}={}) {
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto(B+url);
  if (url.includes('example')) {
    await page.waitForSelector('[data-testid="breadboard"] .part'); await page.waitForTimeout(900);
    await page.screenshot({path:`${prefix}-1-breadboard.png`});
    if (run) { await page.click('button.run'); await page.waitForTimeout(4000); await page.screenshot({path:`${prefix}-2-running.png`}); await page.click('button.run').catch(()=>{}); }
    if (allTabs) { let n=3; for (const t of tabs){ const b=page.locator('.tabs button',{hasText:t}); if(!(await b.count())||!(await b.first().isVisible().catch(()=>false))) {console.log(prefix,'tab not visible',t); continue;} await b.first().click(); await page.waitForTimeout(600); await page.screenshot({path:`${prefix}-${n++}-${t.replace(/ /g,'')}.png`}); } }
  } else { await page.waitForTimeout(1500); await page.screenshot({path:`${prefix}.png`}); await page.screenshot({path:`${prefix}-full.png`, fullPage:true}); }
  const sw = await page.evaluate(()=>[document.documentElement.scrollWidth, innerWidth]);
  console.log(prefix, 'scrollWidth/innerWidth', sw, 'errs', errs.length, errs.slice(0,2).join('|'));
  await page.close();
}
const dark = await browser.newContext({viewport:{width:1440,height:900}, colorScheme:'dark'});
for (const id of ['esp32-eink-weather','rpi-plant-waterer','pico-simon','555-blinker']) await shoot(dark, `/?example=${id}&notour`, `${O}/dark/${id}`);
await shoot(dark, '/?welcome&notour', `${O}/dark/welcome`);
for (const [w,h] of [[1024,768],[390,844]]) {
  const ctx = await browser.newContext({viewport:{width:w,height:h}, isMobile: w<500, hasTouch: w<500});
  await shoot(ctx, '/?welcome&notour', `${O}/vp/${w}-welcome`);
  for (const id of ['esp32-weather-imu','pico-traffic-light','rpi-weather-dashboard']) await shoot(ctx, `/?example=${id}&notour`, `${O}/vp/${w}-${id}`);
}
await browser.close();
