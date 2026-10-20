import { chromium } from 'playwright';
const D='test-results/qa/nia-newbie/';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1366, height: 820 } })).newPage();
await p.goto('http://localhost:5173/?example=esp32-parking-sensor&notour'); await p.waitForSelector('.part'); await p.waitForTimeout(800);
await p.click('button.run'); await p.waitForTimeout(1000);
await p.locator('input[aria-label=Distance]').fill('5'); await p.waitForTimeout(1500);
const seen=new Set();
for(let i=0;i<30;i++){ seen.add(await p.$eval('.part[data-part^=buzzer]', e=>e.className+'|'+[...e.querySelectorAll('*')].map(x=>x.getAttribute('class')||'').join(',')+'|'+(e.querySelector('wokwi-buzzer').hasSignal)+'|'+e.querySelector('.part-tag')?.textContent)); if(i===10) await p.screenshot({path:D+'B2-buzz-zoom.png', clip:{x:330,y:240,width:300,height:200}}); await p.waitForTimeout(100);}
console.log([...seen]);
await b.close();
