import { open, OUT, tab } from './r3-regression-lib.mjs';
const body = p => p.locator('body').innerText();
// ---- (1) 555-tone
{
  const {b,p} = await open('?example=555-tone&notour');
  await p.screenshot({path:OUT+'555-0-open.png'});
  for (const t of ['Build guide','Blog post']) {
    await tab(p,t); await p.waitForTimeout(1200);
    const txt = await body(p);
    console.log(`[555 ${t}] LED mentions:`, (txt.match(/[^\n]*\bLEDs?\b[^\n]*/g)||[]).slice(0,6));
    console.log(`[555 ${t}] blink mentions:`, (txt.match(/[^\n]*blink[^\n]*/gi)||[]).slice(0,4));
    console.log(`[555 ${t}] buzzer/tone count:`, (txt.match(/buzzer|tone|piezo/gi)||[]).length);
    await p.screenshot({path:OUT+`555-${t.replace(' ','')}.png`, fullPage:false});
  }
  await tab(p,'Breadboard'); await p.waitForTimeout(800);
  await p.click('button.run'); await p.waitForTimeout(3500);
  const pt=p.locator('.console-tabs button',{hasText:'Problems'}); await pt.click(); await p.waitForTimeout(500);
  console.log('[555] problems tab:', await pt.innerText(), '\n', await p.locator('[data-testid=problems]').innerText().catch(()=>'ERR'));
  console.log('[555] "no power" count:', await p.getByText(/no power/i).count());
  await p.screenshot({path:OUT+'555-1-running.png'});
  const m=p.locator('.momentary'); console.log('[555] momentary', await m.count());
  const tgt = (await m.count()) ? m.first() : p.locator('.part[data-part*=button]').first();
  const bb=await tgt.boundingBox(); await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2); await p.mouse.down(); await p.waitForTimeout(2000);
  const chips = await p.getByText(/♪/).allInnerTexts();
  console.log('[555] chips while held:', chips);
  console.log('[555] "no power" count while held:', await p.getByText(/no power/i).count());
  await p.screenshot({path:OUT+'555-2-held.png'});
  await p.mouse.up(); await p.waitForTimeout(1000);
  console.log('[555] chips released:', await p.getByText(/♪/).allInnerTexts());
  await b.close();
}
// ---- (6) schematic zoom
{
  const {b,p} = await open('?example=esp32-weather-imu&notour');
  await tab(p,'Schematic'); await p.waitForTimeout(1500);
  const zl = p.locator('.zoom-group button').nth(1);
  const sz = async ()=> p.evaluate(()=>{const s=document.querySelector('[data-testid=schematic] svg'); const r=s?.getBoundingClientRect(); const t=[...document.querySelectorAll('[data-testid=schematic] svg text')].map(e=>e.getBoundingClientRect().height).filter(h=>h>0).sort((a,b)=>a-b); return {w:r?.width,h:r?.height,minText:t[0],medText:t[Math.floor(t.length/2)]};});
  console.log('[ZOOM] initial', await zl.innerText(), JSON.stringify(await sz()));
  await p.screenshot({path:OUT+'zoom-0.png'});
  await p.click('button[aria-label="Zoom in"]'); await p.waitForTimeout(500);
  console.log('[ZOOM] after +', await zl.innerText(), JSON.stringify(await sz()));
  await p.click('button[aria-label="Zoom in"]'); await p.waitForTimeout(500);
  console.log('[ZOOM] after ++', await zl.innerText(), JSON.stringify(await sz()));
  await p.screenshot({path:OUT+'zoom-plus2.png'});
  await p.click('button[aria-label="Zoom out"]'); await p.waitForTimeout(500);
  console.log('[ZOOM] after -', await zl.innerText(), JSON.stringify(await sz()));
  await zl.click(); await p.waitForTimeout(500);
  console.log('[ZOOM] after reset', await zl.innerText(), JSON.stringify(await sz()));
  // 140% browser-ish: use deviceScaleFactor? Instead zoom to ~140%
  await p.click('button[aria-label="Zoom in"]'); await p.click('button[aria-label="Zoom in"]'); await p.waitForTimeout(500);
  await p.screenshot({path:OUT+'zoom-140-crop.png', clip:{x:300,y:120,width:800,height:500}});
  await b.close();
}
// ---- (7) RPi wires & (8) LCD projects
for (const ex of ['rpi-plant-waterer','esp32-internet-clock','rpi-thermostat','rpi-weather-dashboard']) {
  const {b,p} = await open(`?example=${ex}&notour`);
  const ps = await p.$$eval('.part[data-part]', e=>e.map(x=>x.getAttribute('data-part')+':'+(x.getAttribute('data-type')||'')));
  console.log(`\n[${ex}] parts`, ps.join(', '));
  await p.screenshot({path:OUT+`${ex}-0.png`});
  // wire endpoints vs header pins for rpi
  const gap = await p.evaluate(()=>{
    const pins=[...document.querySelectorAll('circle.pin[data-pin]')].map(c=>{const r=c.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,p:c.closest('.part')?.getAttribute('data-part')+':'+c.dataset.pin};});
    const paths=[...document.querySelectorAll('path.wire, .wire path, polyline.wire, [data-wire] path, [data-wire]')];
    const out=[];
    for (const el of paths){ if(!el.getTotalLength) continue; const L=el.getTotalLength(); const m=el.getScreenCTM(); for(const t of [0,L]){ const pt=el.getPointAtLength(t); const x=m.a*pt.x+m.c*pt.y+m.e, y=m.b*pt.x+m.d*pt.y+m.f; let best=1e9,bp=''; for(const q of pins){const d=Math.hypot(q.x-x,q.y-y); if(d<best){best=d;bp=q.p;}} out.push({d:Math.round(best*10)/10,bp}); } }
    return {n:paths.length, far: out.filter(o=>o.d>4)};
  });
  console.log(`[${ex}] wire paths`, gap.n, 'endpoints >4px from nearest pin:', JSON.stringify(gap.far.slice(0,12)));
  await p.click('button.run'); await p.waitForTimeout(6000);
  await p.screenshot({path:OUT+`${ex}-1-run.png`});
  const pt=p.locator('.console-tabs button',{hasText:'Problems'}); await pt.click(); await p.waitForTimeout(500);
  const probs = await p.locator('[data-testid=problems]').innerText().catch(()=>'ERR');
  console.log(`[${ex}] problems:`, JSON.stringify(probs.slice(0,600)));
  const lcd = await p.evaluate(()=>{ const el=[...document.querySelectorAll('.part[data-part]')].find(e=>/lcd/i.test(e.getAttribute('data-part'))); return el? el.textContent.trim().slice(0,120) : null; });
  console.log(`[${ex}] lcd text:`, JSON.stringify(lcd));
  const st = p.locator('.console-tabs button',{hasText:'Serial'}); if (await st.count()) { await st.click(); await p.waitForTimeout(300); console.log(`[${ex}] serial:`, JSON.stringify((await p.locator('[data-testid=serial]').innerText()).slice(-300))); }
  await b.close();
}
// ---- (10) dark mode stop button
{
  const {b,p} = await open('?example=pico-traffic-light&notour', {colorScheme:'dark'});
  await p.click('button.run'); await p.waitForTimeout(2500);
  const info = await p.evaluate(()=>{const e=document.querySelector('button.run'); const s=getComputedStyle(e); return {text:e.innerText, color:s.color, bg:s.backgroundColor, bgimg:s.backgroundImage, body:getComputedStyle(document.body).backgroundColor};});
  console.log('[DARK] stop btn', JSON.stringify(info));
  const bb = await p.locator('button.run').boundingBox();
  await p.screenshot({path:OUT+'dark-stop.png', clip:{x:Math.max(0,bb.x-100),y:Math.max(0,bb.y-10),width:bb.width+200,height:bb.height+20}});
  await p.screenshot({path:OUT+'dark-full.png'});
  await b.close();
}
// ---- (11) print build guide
{
  const {b,p} = await open('?example=esp32-weather-imu&notour');
  await tab(p,'Build guide'); await p.waitForTimeout(1500);
  await p.emulateMedia({media:'print'});
  const pdf = await p.pdf({path:OUT+'buildguide.pdf', format:'Letter'});
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;
  console.log('[PRINT] pdf pages', pages, 'bytes', pdf.length);
  await b.close();
}
