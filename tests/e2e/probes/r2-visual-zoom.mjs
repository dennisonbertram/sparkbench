import { chromium } from 'playwright';
const B='http://localhost:5173', O='test-results/qa2/visual/zoom';
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:2});
async function open(id){ const p=await ctx.newPage(); await p.goto(`${B}/?example=${id}&notour`); await p.waitForSelector('[data-testid="breadboard"] .part'); await p.waitForTimeout(900); return p; }
// OLED pins vs wire endpoints
{ const p = await open('esp32-weather-imu');
  const info = await p.evaluate(()=>{ const oled=[...document.querySelectorAll('.part')].find(e=>/oled/i.test(e.getAttribute('data-part')+e.textContent)); const r=oled?.getBoundingClientRect();
    const pins=[...document.querySelectorAll('circle.pin')].filter(c=>c.getAttribute('data-pin').startsWith(oled?.getAttribute('data-part')+':')).map(c=>{const b=c.getBoundingClientRect(); return [c.getAttribute('data-pin'), Math.round(b.x+b.width/2), Math.round(b.y+b.height/2)]});
    return {id: oled?.getAttribute('data-part'), rect: r && [r.x,r.y,r.width,r.height].map(Math.round), pins}; });
  console.log(JSON.stringify(info));
  const r=info.rect; await p.screenshot({path:`${O}/imu-oled.png`, clip:{x:r[0]-80,y:r[1]-30,width:r[2]+120,height:r[3]+60}});
  await p.click('button.run'); await p.waitForTimeout(3000);
  await p.screenshot({path:`${O}/imu-running-badges.png`, clip:{x:560,y:120,width:400,height:420}});
  await p.close(); }
{ const p = await open('esp32-eink-weather'); await p.click('button.run'); await p.waitForTimeout(3000);
  await p.screenshot({path:`${O}/eink-labels.png`, clip:{x:640,y:380,width:440,height:120}});
  await p.screenshot({path:`${O}/eink-serial-top.png`, clip:{x:320,y:710,width:820,height:80}});
  const sc = await p.evaluate(()=>{const s=document.querySelector('[data-testid=serial]'); return s && [s.scrollTop, s.scrollHeight, s.clientHeight, getComputedStyle(s).paddingTop];}); console.log('serial', sc);
  await p.close(); }
{ const p = await open('rpi-plant-waterer'); await p.click('button.run'); await p.waitForTimeout(3000);
  await p.screenshot({path:`${O}/plant-mcp.png`, clip:{x:980,y:260,width:160,height:250}});
  await p.screenshot({path:`${O}/plant-relay.png`, clip:{x:340,y:280,width:320,height:220}});
  await p.locator('.tabs button',{hasText:'Schematic'}).click(); await p.waitForTimeout(800);
  const fs = await p.evaluate(()=>{ const t=[...document.querySelectorAll('svg text')].filter(e=>e.getBoundingClientRect().height>0).map(e=>e.getBoundingClientRect().height); t.sort((a,b)=>a-b); return {n:t.length, min:t[0], median:t[Math.floor(t.length/2)], max:t[t.length-1]}; });
  console.log('plant schematic text px heights', JSON.stringify(fs));
  await p.screenshot({path:`${O}/plant-schematic-mcu.png`, clip:{x:380,y:220,width:300,height:260}});
  await p.close(); }
{ const p = await open('pico-simon');
  await p.screenshot({path:`${O}/simon-bottom.png`, clip:{x:480,y:560,width:480,height:150}});
  const r = await p.evaluate(()=>{ const c=document.querySelector('[data-testid=breadboard]').getBoundingClientRect(); const parts=[...document.querySelectorAll('.part')].map(e=>{const b=e.getBoundingClientRect(); return [e.getAttribute('data-part'), Math.round(b.bottom), Math.round(b.right)];}); return {canvasBottom:c.bottom, canvasRight:c.right, parts}; });
  console.log('simon', JSON.stringify(r));
  await p.close(); }
await browser.close();
