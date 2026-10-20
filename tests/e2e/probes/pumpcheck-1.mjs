import { chromium } from 'playwright';
const out='test-results/qa/pumpcheck';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1600,height:1000}});
await p.goto('http://localhost:5173/?example=rpi-plant-waterer&notour'); await p.waitForTimeout(3000);
await p.screenshot({path:`${out}/breadboard.png`});
console.log('PARTS', await p.$$eval('.part[data-part]',e=>e.map(x=>x.getAttribute('data-part'))));
for (const t of ['Schematic','Parts list','Build guide']) {
  await p.locator('.tabs button',{hasText:t}).first().click(); await p.waitForTimeout(1500);
  await p.screenshot({path:`${out}/${t.replace(' ','-')}.png`, fullPage:false});
  const txt=await p.locator('body').innerText();
  console.log('==',t,'pump mentions:', (txt.match(/[^\n]*pump[^\n]*/gi)||[]).join(' | '));
  if(t==='Parts list') console.log(txt.slice(0,3000));
}
await b.close();
