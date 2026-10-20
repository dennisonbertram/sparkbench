import { chromium } from 'playwright';
const D='test-results/qa/nia-newbie/';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1366, height: 820 } })).newPage();
const errs=[]; p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text())}); p.on('pageerror',e=>errs.push('pageerror: '+e.message));
await p.goto('http://localhost:5173/?welcome');
await p.waitForTimeout(1500);
await p.screenshot({ path: D+'01-landing.png' });
console.log('BODY TEXT:\n', (await p.innerText('body')).slice(0,3000));
// tour?
for (let i=0;i<8;i++){
  const tour = await p.$('.tour, [class*=tour]');
  if(!tour){console.log('no tour el at step',i);break;}
  console.log('TOUR', i, (await tour.innerText()).replace(/\n/g,' | '));
  await p.screenshot({ path: D+`02-tour-${i}.png` });
  const next = await p.$('.tour button:has-text("Next"), [class*=tour] button:has-text("Next")');
  if(!next) { console.log('buttons:', await p.$$eval('[class*=tour] button', bs=>bs.map(b=>b.innerText))); break;}
  await next.click(); await p.waitForTimeout(400);
}
console.log('ERRS', errs);
await b.close();
