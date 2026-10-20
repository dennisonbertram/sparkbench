import { chromium } from 'playwright';
export const OUT='test-results/qa2/regression/';
export async function open(url, opts={}){
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1400,height:900}, ...opts});
  const p = await ctx.newPage();
  p.on('pageerror', e=>console.log('PAGEERROR', e.message));
  if (url) await p.goto('http://localhost:5173/'+url);
  await p.waitForTimeout(1500);
  return {b,ctx,p};
}
export const parts = p => p.$$eval('.part[data-part]', e=>e.map(x=>x.getAttribute('data-part')));
export async function proj(p){ return p.evaluate(()=>{ const id=localStorage.getItem('sparkbench.current.v1'); const all=JSON.parse(localStorage.getItem('sparkbench.projects.v1')||'{}'); return all[id]; }); }
export async function say(p, s, timeout=150000){
  const n = await p.locator('.msg.ai:not(.pending)').count();
  await p.fill('.composer textarea', s); await p.press('.composer textarea','Enter');
  const t0=Date.now();
  while (Date.now()-t0<timeout){ const c=await p.locator('.msg.ai:not(.pending)').count(); const pend=await p.locator('.msg.ai.pending').count(); if (c>n && !pend) break; await p.waitForTimeout(1000); }
  await p.waitForTimeout(1500);
  const msgs = await p.locator('.msg.ai:not(.pending)').allInnerTexts();
  return { reply: msgs[msgs.length-1], secs: (Date.now()-t0)/1000 };
}
