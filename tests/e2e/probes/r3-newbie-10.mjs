import {open,shot} from './r3-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/?notour');
await p.waitForTimeout(2500);
await p.locator('.tabs button',{hasText:'Code'}).click(); await p.waitForTimeout(1000);
await shot(p,'70-code-tab');
const ca = p.locator('[data-testid=code-assistant]');
console.log('CA HTML', (await ca.innerHTML()).slice(0,800));
await ca.locator('textarea').fill('make the lullaby play two times in a row when the button is pressed');
const t0=Date.now();
await ca.locator('button[type=submit], button').filter({hasText:/./}).last().click();
let k=0;
while(Date.now()-t0<240000){
  await p.waitForTimeout(3000); k++;
  const prop = await p.locator('[data-testid=ai-proposal]').count();
  const txt = (await ca.innerText()).replace(/\n/g,' | ').slice(0,300);
  if(k%3==1) { console.log(`+${((Date.now()-t0)/1000).toFixed(0)}s`, txt); await shot(p,`71-ca-wait-${k}`); }
  if(prop) break;
}
console.log('proposal after', (Date.now()-t0)/1000);
await p.waitForTimeout(1000);
await shot(p,'72-proposal');
console.log('PROPOSAL TEXT:\n', (await p.locator('[data-testid=ai-proposal]').innerText()).slice(0,4000));
await p.getByRole('button',{name:'Accept & run'}).click();
await p.waitForTimeout(3000);
await shot(p,'73-accepted');
const setLux=async v=>{ await p.$eval('.simctl input[type=range]',(el,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,String(v)); el.dispatchEvent(new Event('input',{bubbles:true}));}, v); };
const b=p.locator('.simctl button.momentary').first(); await b.hover(); await p.mouse.down(); await p.waitForTimeout(250); await p.mouse.up();
await p.waitForTimeout(18000);
console.log('SERIAL:\n', await p.locator('[data-testid=serial]').innerText());
await shot(p,'74-after-tune');
console.log('ERRS',errs);
await ctx.close();
