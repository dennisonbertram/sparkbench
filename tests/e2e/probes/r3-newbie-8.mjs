import {open,shot,waitAI} from './r3-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/?notour');
await p.waitForTimeout(2500);
const q="can you make the light a soft blue instead of orange, and add a second button that turns the light off when my kid wants it dark?";
const before = await p.locator('.msg.ai:not(.pending)').count();
await p.fill('.composer textarea', q);
await p.press('.composer textarea','Enter');
const t0=Date.now();
for(let k=0;k<6;k++){ await p.waitForTimeout(10000); await shot(p,`50-change-${k}`); const pend=await p.locator('.msg.pending').count(); console.log('t',(Date.now()-t0)/1000,'pending',pend, (await p.locator('.msg.pending').last().innerText().catch(()=>'')).replace(/\n/g,' | ')); if(!pend) break; }
await waitAI(p,before,'change',240000);
await p.waitForTimeout(1500);
await shot(p,'51-changed');
console.log('ANSWER:', await p.locator('.msg.ai:not(.pending)').last().innerText());
console.log('PARTS', JSON.stringify(await p.$$eval('.part[data-part]', e=>e.map(x=>x.getAttribute('data-part')+'|'+x.getAttribute('title')))));
console.log('PROJECT PANEL:', await p.locator('aside').last().innerText().catch(()=>''));
const prob = await p.locator('.console-tabs button',{hasText:'Problems'}).innerText(); console.log('PROB TAB',prob);
console.log('ERRS',errs);
await ctx.close();
