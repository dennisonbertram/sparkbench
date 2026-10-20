import { chromium } from 'playwright';
const D='test-results/qa/nia-newbie/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 820 } });
const p = await ctx.newPage(); let loads=0; p.on('load',()=>{loads++; console.log('LOAD', loads, new Date().toISOString())});
await p.goto('http://localhost:5173/'); await p.waitForTimeout(1500);
await p.fill('.hero-input textarea','a thermometer with a screen for my desk');
const t0=Date.now();
await p.click('button.primary.big');
for (const s of [1,5,15]) { await p.waitForTimeout(s===1?1000:s===5?4000:10000); await p.screenshot({path:D+`90-welcome-wait-${s}s.png`}); console.log(s,'s: welcome?',!!(await p.$('.welcome')),'btn:',await p.$eval('button.primary.big',e=>e.outerHTML).catch(()=>'-'), 'busy text:', await p.$$eval('.welcome [class*=pend], .welcome [class*=spin], .welcome [aria-busy]',es=>es.map(e=>e.outerHTML.slice(0,150))).catch(()=>'-')); }
await p.waitForSelector('.part',{timeout:240000}); console.log('design done at', (Date.now()-t0)/1000);
await p.waitForTimeout(1500);
await p.screenshot({path:D+'91-design-done-tour.png'});
console.log('tour?', await p.$eval('.tour-card',e=>e.innerText).catch(()=>'none'));
await b.close();
