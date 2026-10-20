import {open,shot} from './r3-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/?notour');
await p.waitForTimeout(2500);
await p.click('button.run');
await p.waitForTimeout(2000);
const setLux=async v=>{ await p.$eval('.simctl input[type=range]',(el,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,String(v)); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));}, v); };
const ser=async()=> (await p.locator('[data-testid=serial]').innerText()).split('\n').slice(-3).join(' / ');
for (const v of [100,30,10,2]){ await setLux(v); await p.waitForTimeout(2500); console.log('lux',v,'->',await ser()); }
await p.waitForTimeout(2500);
await shot(p,'31-dark');
const ring = await p.$eval('.part[data-part=neopixelring1]', e=>e.innerHTML.match(/fill="[^"]+"/g)?.slice(0,20));
console.log('RING fills', ring);
// press button (hold briefly)
const btn=p.locator('.simctl button.momentary');
await btn.dispatchEvent('pointerdown').catch(()=>{});
await btn.hover(); await p.mouse.down(); await p.waitForTimeout(300); await p.mouse.up();
for(let i=0;i<8;i++){ await p.waitForTimeout(1000); if(i==2) await shot(p,'32-tune'); console.log('t',i,await ser()); }
console.log('BUZZER', await p.$eval('.part[data-part=buzzer1]', e=>e.outerHTML.slice(0,400)));
// bright again
await setLux(1500); 
for(let i=0;i<5;i++){ await p.waitForTimeout(1000); console.log('bright',i,await ser()); }
await shot(p,'33-bright');
console.log('FULL SERIAL:\n', await p.locator('[data-testid=serial]').innerText());
console.log('ERRS',errs);
await ctx.close();
