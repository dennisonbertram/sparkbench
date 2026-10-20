import {open,shot} from './r3-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/?welcome');
await p.waitForTimeout(2500);
await shot(p,'01-landing');
console.log('BODY:\n',(await p.innerText('body')).slice(0,3000));
for (let i=0;i<10;i++){
  const tour = await p.locator('[class*=tour], [role=dialog]').first().innerText().catch(()=>'');
  console.log('TOUR',i,':',tour.replace(/\n/g,' | ').slice(0,500));
  const next = p.locator('button:has-text("Next"), button:has-text("Got it"), button:has-text("Done"), button:has-text("Finish"), button:has-text("Start")').first();
  if(!(await next.count()) || !(await next.isVisible())) break;
  await shot(p,'02-tour-'+i);
  await next.click(); await p.waitForTimeout(600);
}
await shot(p,'03-after-tour');
console.log('ERRS',errs);
await ctx.close();
