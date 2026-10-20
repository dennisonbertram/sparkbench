import { chromium } from 'playwright';
const browser = await chromium.launch();
const vw = +(process.env.VW||1440);
const page = await (await browser.newContext({viewport:{width:vw,height:900},deviceScaleFactor:2})).newPage();
const ids = (process.env.IDS||'esp32-internet-clock,esp32-pedometer,esp32-eink-weather,rpi-plant-waterer,esp32-weather-imu').split(',');
for (const id of ids) {
  await page.goto(`http://localhost:5173/?example=${id}&notour`);
  await page.waitForSelector('[data-testid="breadboard"] .part'); await page.waitForTimeout(1000);
  if (process.env.NORUN) { await page.screenshot({path:`test-results/qa2/badge/${vw}-${id}-idle.png`}); continue; }
  await page.click('button.run'); await page.waitForTimeout(3500);
  await page.screenshot({path:`test-results/qa2/badge/${vw}-${id}-run.png`});
  // collect text elements in breadboard svg and check overlaps
  const res = await page.evaluate(() => {
    const bb = document.querySelector('[data-testid="breadboard"]');
    const texts = [...bb.querySelectorAll('text')].map(t => ({t: t.textContent.trim(), r: t.getBoundingClientRect(), cls: (t.getAttribute('class')||'') + '|' + (t.parentElement.getAttribute('class')||'')}));
    return texts.filter(x=>x.t && x.r.width>0).map(x=>({t:x.t, cls:x.cls, x:Math.round(x.r.x), y:Math.round(x.r.y), w:Math.round(x.r.width), h:Math.round(x.r.height)}));
  });
  const ov = [];
  for (let i=0;i<res.length;i++) for (let j=i+1;j<res.length;j++){const a=res[i],b=res[j];
    const ix=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x), iy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
    if(ix>2&&iy>2) ov.push(`${a.t} [${a.cls}] X ${b.t} [${b.cls}] (${ix}x${iy})`);}
  console.log('==', id, 'texts', res.length); ov.forEach(o=>console.log('  ', o));
  await page.click('button.run'); await page.waitForTimeout(500);
}
await browser.close();
