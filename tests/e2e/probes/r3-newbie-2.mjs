import {open,shot} from './r3-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/?welcome');
await p.waitForTimeout(2000);
await p.fill('.hero-input textarea', "a nightlight for my kid's room that turns on when it gets dark and plays a little tune when you press a button");
const t0=Date.now();
await p.click('.hero-input button');
let last='';
for(let i=0;i<200;i++){
  await p.waitForTimeout(1500);
  const txt=(await p.innerText('body')).replace(/\s+/g,' ').slice(0,400);
  if(txt!==last){ console.log(`+${((Date.now()-t0)/1000).toFixed(0)}s`, txt); last=txt; }
  if(i%6===0) await shot(p,`10-gen-${String(i).padStart(3,'0')}`);
  const done = await p.locator('.msg.ai:not(.pending)').count();
  const pend = await p.locator('.msg.pending').count();
  if(done>0 && !pend && (await p.locator('.part[data-part]').count())>0){ console.log('READY at',((Date.now()-t0)/1000).toFixed(1)); break; }
}
await p.waitForTimeout(1500);
await shot(p,'11-ready');
for (let i=0;i<12;i++){
  const tourEl = p.locator('[class*=tour]').first();
  const tour = await tourEl.innerText().catch(()=>'');
  if(!tour) { console.log('no tour el'); break; }
  console.log('TOUR',i,':',tour.replace(/\n/g,' | ').slice(0,500));
  await shot(p,'12-tour-'+i);
  const next = p.locator('[class*=tour] button').filter({hasText:/Next|Got it|Done|Finish|Start|Let/}).first();
  if(!(await next.count())) { console.log('tour buttons:', await p.locator('[class*=tour] button').allInnerTexts()); break; }
  await next.click(); await p.waitForTimeout(700);
}
await shot(p,'13-after-tour');
console.log('URL',p.url());
console.log('MSGS', (await p.locator('.msg').allInnerTexts()).join('\n----\n'));
console.log('PARTS', await p.$$eval('.part[data-part]', e=>e.map(x=>x.getAttribute('data-part'))));
console.log('ERRS',errs);
await ctx.close();
