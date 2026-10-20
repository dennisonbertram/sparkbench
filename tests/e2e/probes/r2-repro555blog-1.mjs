import { chromium } from 'playwright';
import fs from 'fs';
const out='test-results/qa2/repro-555blog';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1400,height:1000}});
await p.goto('http://localhost:5173/?example=555-tone&notour'); await p.waitForTimeout(2500);
for (const tab of ['Blog post','Build guide','Parts list']) {
  await p.locator('.tabs button',{hasText:tab}).first().click(); await p.waitForTimeout(1500);
  const t=await p.locator('main, body').first().innerText();
  fs.writeFileSync(`${out}/${tab.replace(/ /g,'-')}.txt`,t);
  await p.screenshot({path:`${out}/${tab.replace(/ /g,'-')}.png`,fullPage:false});
}
await b.close();
