import { chromium } from 'playwright';
const OUT='test-results/qa/verify-overlap/';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('.hero-input textarea', 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
await p.click('button.primary.big');
await p.waitForTimeout(6000); await p.screenshot({path:OUT+'00-after-design.png'}); console.log('nparts', await p.locator('.part').count());
await p.waitForTimeout(2000);
async function boxes(){ return p.evaluate(()=>[...document.querySelectorAll('.part[data-part]')].map(e=>{const r=e.getBoundingClientRect();return {id:e.getAttribute('data-part'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})); }
function overlaps(bs){const o=[];for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){const a=bs[i],c=bs[j];const ix=Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x);const iy=Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y);if(ix>4&&iy>4)o.push(`${a.id}x${c.id} ${ix}x${iy}`);}return o;}
let n=0;
for (const msg of ['add a buzzer','use a Raspberry Pi Pico instead','remove the buzzer','add two more LEDs']) {
  await p.fill('.composer textarea', msg); await p.press('.composer textarea','Enter');
  await p.waitForTimeout(3000);
  n++; await p.locator('.tabs button',{hasText:'Breadboard'}).first().click(); await p.waitForTimeout(500);
  await p.screenshot({ path: OUT+`0${n}-${msg.replace(/\W+/g,'_')}.png` });
  const bs=await boxes(); console.log(msg, JSON.stringify(bs)); console.log('OVERLAPS', overlaps(bs));
}
await b.close();
