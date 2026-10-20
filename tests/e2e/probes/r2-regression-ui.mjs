import { open, OUT } from './r2-regression-lib.mjs';
const which = process.argv[2];
if (which==='indent'){
  const {b,p} = await open('?example=pico-traffic-light&notour');
  await p.locator('.tabs button',{hasText:'Code'}).click(); await p.waitForTimeout(800);
  const lines = await p.locator('.cm-line').allInnerTexts();
  // line ending with ':' (block opener) and plain 4-space line
  const opener = lines.find(l=>/^\S.*:\s*$/.test(l) && /def |while /.test(l));
  const inner = lines.find(l=>/^    \S/.test(l) && !/:\s*$/.test(l));
  for (const [name,t] of [['opener',opener],['inner',inner]]){
    const loc = p.locator('.cm-line',{hasText:t.trim()}).first();
    await loc.scrollIntoViewIfNeeded(); await loc.click(); await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.keyboard.type('XMARK'+name);
    await p.waitForTimeout(300);
    const al=(await p.locator('.cm-content').innerText()).split('\n'); const i=al.findIndex(l=>l.includes('XMARK'+name));
    console.log(name, JSON.stringify(t), '=>', JSON.stringify(al[i]), 'indent', al[i].indexOf('X'));
  }
  await p.screenshot({path:OUT+'indent.png'}); await b.close();
}
if (which==='print'){
  for (const ex of ['esp32-weather-imu','rpi-plant-waterer']){
  const {b,p} = await open(`?example=${ex}&notour`);
  for (const tab of ['Build guide','Blog post']){
    await p.locator('.tabs button',{hasText:tab}).click(); await p.waitForTimeout(1200);
    const buf = await p.pdf({path:`${OUT}${ex}-${tab.replace(' ','-')}.pdf`, format:'A4'});
    const pages=(buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;
    console.log(ex, tab,'pages',pages);
  }
  await b.close();}
}
if (which==='rpi'){
  for (const ex of ['rpi-plant-waterer','rpi-thermostat','rpi-weather-dashboard']){
    const {b,p} = await open(`?example=${ex}&notour`);
    await p.click('button.run'); await p.waitForTimeout(5000);
    const txt = await p.locator('[data-testid=breadboard]').innerText().catch(()=>'' );
    const nop = await p.locator('text=/No power/i').count();
    console.log(ex, 'No power count', nop, 'run btn', await p.textContent('button.run'));
    await p.screenshot({path:`${OUT}rpi-${ex}.png`}); await b.close();
  }
}
if (which==='dark'){
  const {b,p} = await open('?example=pico-traffic-light&notour', {colorScheme:'dark'});
  await p.click('button.run'); await p.waitForTimeout(1500);
  const st = await p.$eval('button.run', e=>{const s=getComputedStyle(e); return {text:e.innerText, color:s.color, bg:s.backgroundColor, bgi:s.backgroundImage}});
  console.log('stop', st);
  await p.locator('button.run').screenshot({path:OUT+'dark-stop.png'});
  await p.screenshot({path:OUT+'dark-full.png'}); await b.close();
}
if (which==='badge'){
  for (const ex of ['555-blinker','esp32-weather-imu','transistor-switch','esp32-parking-sensor','pico-simon','esp32-internet-clock']){
    const {b,p} = await open(`?example=${ex}&notour`);
    const tab = p.locator('.console-tabs button',{hasText:'Problems'});
    await tab.click(); await p.waitForTimeout(500);
    const label = await tab.innerText(); const html = await tab.innerHTML();
    const items = await p.locator('[data-testid=problems]').innerText();
    console.log(ex,'| TAB:',JSON.stringify(label),'| PANEL:',JSON.stringify(items.slice(0,200)));
    await p.click('button.run'); await p.waitForTimeout(3000);
    console.log('   running TAB:', JSON.stringify(await tab.innerText()),'| PANEL:',JSON.stringify((await p.locator('[data-testid=problems]').innerText()).slice(0,200)));
    await p.locator('.console').screenshot({path:`${OUT}badge-${ex}.png`}).catch(()=>p.screenshot({path:`${OUT}badge-${ex}.png`}));
    await b.close();
  }
}
if (which==='speed'){
  const {b,p} = await open('?example=pico-traffic-light&notour');
  await p.click('button.run');
  const t=async()=>p.textContent('.sim-time');
  const log=[]; const t0=Date.now();
  const tick=async(l)=>log.push(`${((Date.now()-t0)/1000).toFixed(1)} ${l} ${await t()}`);
  for(let i=0;i<3;i++){await p.waitForTimeout(1000); await tick('1x');}
  await p.selectOption('select[aria-label="Simulation speed"]','5'); await tick('->5x');
  for(let i=0;i<3;i++){await p.waitForTimeout(500); await tick('5x');}
  await p.selectOption('select[aria-label="Simulation speed"]','0.25'); await tick('->0.25x');
  for(let i=0;i<3;i++){await p.waitForTimeout(1000); await tick('.25x');}
  await p.selectOption('select[aria-label="Simulation speed"]','1'); await tick('->1x');
  for(let i=0;i<2;i++){await p.waitForTimeout(1000); await tick('1x');}
  console.log(log.join('\n')); await b.close();
}
if (which==='pins'){
  const {b,p} = await open('?example=esp32-parking-sensor&notour');
  const tab = p.locator('.console-tabs button',{hasText:'Pins'});
  console.log('pins tab count', await tab.count());
  await tab.click(); await p.waitForTimeout(500);
  console.log('IDLE:\n', await p.locator('.console').innerText());
  await p.click('button.run'); await p.waitForTimeout(5000);
  console.log('RUN1:\n', await p.locator('.console').innerText());
  await p.screenshot({path:OUT+'pins-1.png'});
  const sl = await p.$$('.simctl input[type=range]');
  console.log('sliders', sl.length);
  if (sl[0]) { await sl[0].evaluate(el=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(el, el.min); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));}); }
  await p.waitForTimeout(3000);
  console.log('RUN2 (min distance):\n', await p.locator('.console').innerText());
  await p.screenshot({path:OUT+'pins-2.png'});
  await b.close();
}
