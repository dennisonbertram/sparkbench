import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/');
await p.waitForTimeout(2500);
await p.click('.tabs button:has-text("Code")'); await p.waitForTimeout(1200);
await shot(p,'60-code');
if(!(await p.locator('[data-testid=code-assistant] textarea').isVisible().catch(()=>false))){
  console.log('assistant hidden; clicking Ask AI');
  await p.click('button:has-text("Ask AI")'); await p.waitForTimeout(800);
}
await shot(p,'61-assistant-open');
console.log('ASSIST UI:', await p.locator('[data-testid=code-assistant]').innerText());
await p.fill('[data-testid=code-assistant] textarea','show the temperature in Fahrenheit too');
await p.locator('[data-testid=code-assistant] button[type=submit], [data-testid=code-assistant] button:has-text("Ask"), [data-testid=code-assistant] button:has-text("Send")').first().click();
const t0=Date.now();
for(let i=0;i<150;i++){ await p.waitForTimeout(1000);
  if(i==5||i==30) {await shot(p,'62-wait-'+i); console.log(i,'ASSIST:', (await p.locator('[data-testid=code-assistant]').innerText()).slice(0,300));}
  if(await p.locator('[data-testid=ai-proposal]').count()) break; }
console.log('took',(Date.now()-t0)/1000);
await p.waitForTimeout(1000);
await shot(p,'63-proposal');
console.log('PROPOSAL:', (await p.locator('[data-testid=ai-proposal]').innerText().catch(e=>'NONE '+e)).slice(0,3000));
await p.click('button:has-text("Accept & run")');
await p.waitForTimeout(6000);
await shot(p,'64-accepted');
const t = p.locator('.simctl input[aria-label=Temperature]');
console.log('slider visible', await t.isVisible().catch(()=>false));
console.log('SERIAL:', (await p.locator('[data-testid=serial]').innerText()).slice(-600));
console.log('PROBLEMS', await p.locator('.console-tabs').innerText());
await p.click('.tabs button:has-text("Breadboard")'); await p.waitForTimeout(3000);
await shot(p,'65-breadboard-F');
if(await t.isVisible().catch(()=>false)){ await t.fill('10'); await p.waitForTimeout(4000); await shot(p,'66-cold-F'); console.log('SERIAL cold:', (await p.locator('[data-testid=serial]').innerText()).slice(-300)); }
console.log('ERRS',errs.filter(e=>!e.includes('Lit is in dev')));
await ctx.close();
