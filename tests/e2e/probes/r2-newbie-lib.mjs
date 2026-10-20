import { chromium } from 'playwright';
export const D='test-results/qa2/newbie/';
export async function open(url){
  const ctx = await chromium.launchPersistentContext(D+'profile', { viewport: { width: 1366, height: 820 } });
  const p = ctx.pages()[0] || await ctx.newPage();
  const errs=[]; p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text())}); p.on('pageerror',e=>errs.push('pageerror: '+e.message));
  if(url) await p.goto(url);
  return {ctx,p,errs};
}
export const shot=(p,n)=>p.screenshot({path:D+n+'.png'});
