import { open, OUT } from './r2-regression-lib.mjs';
for (const [i,q] of ['asdfgh','what boards do you support?'].entries()){
  const {b,p} = await open('?welcome&notour');
  await p.fill('.hero-input textarea', q); await p.click('.hero-input button');
  const t0=Date.now();
  let txt='';
  while(Date.now()-t0<150000){ await p.waitForTimeout(2000); txt=await p.innerText('body'); const designing=/Designing/i.test(txt); const hasPart=await p.locator('.part').count(); if(!designing || hasPart) break; }
  await p.waitForTimeout(2000);
  txt=await p.innerText('body');
  console.log(`\n=== ${q} (${(Date.now()-t0)/1000}s) parts=${await p.locator('.part').count()} hero=${await p.locator('.hero-input').count()}`);
  console.log(txt.slice(0,1500));
  await p.screenshot({path:`${OUT}welcome-${i}.png`});
  await b.close();
}
