import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/');
await p.waitForTimeout(2500);
console.log('title', await p.locator('header, .topbar').first().innerText().catch(()=>''));
await p.click('button.run');
await p.waitForTimeout(4000);
await shot(p,'20-running');
console.log('SERIAL:',await p.locator('[data-testid=serial]').innerText().catch(e=>'ERR '+e));
const sims = await p.$$eval('.simctl', els=>els.map(e=>e.outerHTML.slice(0,800)));
console.log('SIMCTL', sims);
// find temp slider
const inputs = p.locator('.simctl input');
const n = await inputs.count(); console.log('inputs',n);
for(let i=0;i<n;i++){ const el=inputs.nth(i); console.log(i, await el.getAttribute('type'), await el.getAttribute('aria-label'), await el.getAttribute('min'), await el.getAttribute('max'), await el.inputValue()); }
// set the first range input (temperature?) to 12
const t = p.locator('.simctl input[type=range]').first();
await t.evaluate((el)=>{el.value='12'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));});
await p.waitForTimeout(5000);
await shot(p,'21-cold');
console.log('SERIAL after cold:',await p.locator('[data-testid=serial]').innerText());
await t.evaluate((el)=>{el.value='25'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));});
await p.waitForTimeout(5000);
await shot(p,'22-warm');
console.log('SERIAL after warm:',(await p.locator('[data-testid=serial]').innerText()).slice(-600));
console.log('ERRS',errs);
await ctx.close();
