import { chromium } from 'playwright';
const D='test-results/qa/nia-newbie/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 820 } });
const p = await ctx.newPage();
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push('pageerror: '+e.message));
await p.goto('http://localhost:5173/?welcome');
await p.waitForTimeout(800);
await p.fill('.hero-input textarea','a thermometer with a screen for my desk');
await p.click('button.primary.big');
await p.waitForTimeout(3000);
await p.screenshot({ path: D+'10-after-design.png' });
for (let i=0;i<6;i++){
  const t = await p.$('.tour-card'); if(!t) {console.log('no tour at',i); break;}
  console.log('TOUR',i,(await t.innerText()).replace(/\n/g,' | '));
  await p.screenshot({ path: D+`11-tour-${i}.png` });
  const n = await p.$('.tour-card button.primary'); await n.click(); await p.waitForTimeout(400);
}
await p.screenshot({ path: D+'12-after-tour.png' });
console.log('COPILOT:\n', await p.innerText('[data-tour=copilot]').catch(e=>'ERR '+e.message));
console.log('PARTS', await p.$$eval('.part', es=>es.map(e=>e.getAttribute('data-part'))));
console.log('PROBLEMS:\n', await p.innerText('[data-testid=problems]').catch(()=>'n/a'));
await p.click('button.run'); await p.waitForTimeout(4000);
await p.screenshot({ path: D+'13-running.png' });
console.log('SERIAL:\n', await p.innerText('[data-testid=serial]').catch(()=>'n/a'));
console.log('SIMCTL:\n', await p.$$eval('.simctl', es=>es.map(e=>e.outerHTML.slice(0,600))));
console.log('ERRS', errs);
await ctx.storageState({ path: D+'state.json' });
await b.close();
