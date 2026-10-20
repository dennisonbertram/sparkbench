import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/?welcome');
await p.waitForTimeout(2000);
await shot(p,'01-landing');
console.log('BODY:\n',(await p.innerText('body')).slice(0,2500));
for (let i=0;i<8;i++){
  const btns = await p.$$eval('button', bs=>bs.filter(b=>b.offsetParent).map(b=>b.innerText.trim()).filter(Boolean));
  console.log('STEP',i,'buttons:',JSON.stringify(btns.slice(0,40)));
  const next = p.locator('button:has-text("Next"), button:has-text("Got it"), button:has-text("Done"), button:has-text("Finish")').first();
  if(!(await next.count())) break;
  const dlg = await p.locator('[class*=tour]').first().innerText().catch(()=>'' );
  console.log('TOUR TEXT:',dlg.replace(/\n/g,' | '));
  await next.click(); await p.waitForTimeout(500); await shot(p,'02-tour-'+i);
}
await shot(p,'03-after-tour');
console.log('ERRS',errs);
await ctx.close();
