import { chromium } from 'playwright';
const D='test-results/qa/nia-newbie/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 820 }, acceptDownloads: true });
await ctx.addInitScript(()=>{try{localStorage.setItem('sparkbench.tour.done','1')}catch{}});
const p = await ctx.newPage(); p.on('load',()=>console.log('LOAD', new Date().toISOString()));
const errs=[]; p.on('pageerror',e=>errs.push('pageerror: '+e.message));
await p.goto('http://localhost:5173/'); await p.waitForTimeout(1200);
await p.fill('.hero-input textarea','a thermometer with a screen for my desk');
await p.click('button.primary.big'); await p.waitForSelector('.part',{timeout:240000});
await p.waitForFunction(()=>!document.querySelector('.msg.pending'),null,{timeout:180000}); await p.waitForTimeout(800);
console.log('PARTS', await p.$$eval('.part', es=>es.map(e=>e.getAttribute('data-part'))));
// hover a pin
const pin = p.locator('circle.pin').nth(5); await pin.hover(); await p.waitForTimeout(500);
await p.screenshot({ path: D+'A0-pin-hover.png' });
// click a part
await p.click('.part[data-part^=dht]'); await p.waitForTimeout(500);
await p.screenshot({ path: D+'A1-part-click.png' });
console.log('RIGHT PANEL after part click:\n', await p.innerText('.inspector, aside:last-of-type, .right').catch(()=>'?'));
for (const t of ['Schematic','Code','Parts list','Build guide','Blog post']){
  await p.click(`.tabs button:has-text("${t}")`); await p.waitForTimeout(1500);
  await p.screenshot({ path: D+`A2-${t.replace(' ','_')}.png` });
  const txt = await p.evaluate(()=>{const m=document.querySelector('[role=tabpanel], .view, .center-pane, main'); return m? m.innerText : document.body.innerText});
  console.log(`\n#### TAB ${t} (${txt.length} chars):\n`, txt.slice(0,3500));
}
console.log('ERRS', errs);
await ctx.storageState({ path: D+'state10.json' });
await b.close();
