import { chromium } from 'playwright';
export const D='test-results/qa3/newbie/';
export async function open(url){
  const ctx = await chromium.launchPersistentContext(D+'profile', { viewport: { width: 1366, height: 820 } });
  const p = ctx.pages()[0] || await ctx.newPage();
  const errs=[]; p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text())}); p.on('pageerror',e=>errs.push('pageerror: '+e.message));
  if(url) await p.goto(url);
  return {ctx,p,errs};
}
export const shot=(p,n)=>p.screenshot({path:D+n+'.png'});
export async function waitAI(p, prevCount, label, maxMs=180000){
  const t0=Date.now(); let lastStatus='';
  while(Date.now()-t0<maxMs){
    const n = await p.locator('.msg.ai:not(.pending)').count();
    const pend = await p.locator('.msg.ai.pending, .msg.pending').count();
    if(pend){ const s=await p.locator('.msg.pending').last().innerText().catch(()=> ''); if(s!==lastStatus){ console.log(`[${label} +${((Date.now()-t0)/1000).toFixed(0)}s] pending: ${s.replace(/\n/g,' | ').slice(0,200)}`); lastStatus=s; } }
    if(n>prevCount && !pend) { console.log(`[${label}] done in ${((Date.now()-t0)/1000).toFixed(1)}s`); return Date.now()-t0; }
    await p.waitForTimeout(1000);
  }
  console.log(`[${label}] TIMEOUT`); return -1;
}
