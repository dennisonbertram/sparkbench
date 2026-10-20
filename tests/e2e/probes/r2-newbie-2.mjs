import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/?welcome');
await p.waitForTimeout(1500);
await p.fill('.hero-input textarea','a little gadget for my desk that tells me if my room is too cold, with a screen');
await p.click('.hero-input button');
const t0=Date.now(); let last='';
for(let i=0;i<60;i++){
  await p.waitForTimeout(3000);
  const txt=(await p.innerText('body')).slice(0,600).replace(/\n/g,' | ');
  if(txt!==last){console.log(((Date.now()-t0)/1000).toFixed(0)+'s',txt); last=txt; await shot(p,'10-designing-'+i);}
  if(await p.locator('.tabs button').count()) break;
}
console.log('done at',(Date.now()-t0)/1000);
await p.waitForTimeout(2500);
await shot(p,'11-after-design');
// tour
for (let i=0;i<8;i++){
  const next = p.locator('button:has-text("Next"), button:has-text("Got it"), button:has-text("Done"), button:has-text("Finish"), button:has-text("Start")').first();
  if(!(await next.count()) || !(await next.isVisible())) {console.log('no tour button');break;}
  const tt = await p.locator('[class*=tour]').first().innerText().catch(()=>'' );
  console.log('TOUR',i,tt.replace(/\n/g,' | '));
  await shot(p,'12-tour-'+i);
  await next.click(); await p.waitForTimeout(600);
}
await shot(p,'13-workspace');
console.log('BODY:\n',(await p.innerText('body')).slice(0,4000));
console.log('ERRS',errs);
await ctx.close();
