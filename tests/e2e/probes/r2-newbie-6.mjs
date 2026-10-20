import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/');
await p.waitForTimeout(2500);
const before = await p.locator('.msg.ai:not(.pending)').count();
await p.fill('.composer textarea', "make it beep when it's below 18 degrees");
await p.press('.composer textarea','Enter');
const t0=Date.now();
for(let i=0;i<150;i++){ await p.waitForTimeout(1000);
  if(i%15==5) {await shot(p,'50-wait-'+i); console.log(i,'s pending:', (await p.locator('.msg.pending').allInnerTexts()).join('/'));}
  if(await p.locator('.msg.ai:not(.pending)').count()>before) break; }
await p.waitForTimeout(3000);
console.log('took',(Date.now()-t0)/1000);
console.log('REPLY:', await p.locator('.msg.ai:not(.pending)').last().innerText());
await shot(p,'51-after-change');
console.log('PARTS:', await p.$$eval('.part', els=>els.map(e=>e.getAttribute('data-part'))));
console.log('PROBLEMS tab:', await p.locator('.console-tabs').innerText());
await p.click('button.run'); await p.waitForTimeout(3000);
const t = p.locator('.simctl input[aria-label=Temperature]');
await t.fill('15'); await p.waitForTimeout(5000);
await shot(p,'52-cold-beep');
console.log('SERIAL:', (await p.locator('[data-testid=serial]').innerText()).slice(-500));
await p.click('.console-tabs button:has-text("Pins")'); await p.waitForTimeout(800);
console.log('PINS:', (await p.locator('.console, [data-testid=pins]').first().innerText()).slice(0,1500));
await shot(p,'53-pins');
await t.fill('22'); await p.waitForTimeout(4000);
console.log('PINS warm:', (await p.locator('.console, [data-testid=pins]').first().innerText()).slice(0,1500));
console.log('ERRS',errs.filter(e=>!e.includes('Lit is in dev')));
await ctx.close();
