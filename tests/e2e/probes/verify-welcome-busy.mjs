import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1280,height:800}});
let posts=0; p.on('request', r=>{ if(r.url().includes('/api/ai/design')) posts++; });
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('.hero-input textarea','A weather logger with an ESP32, a temperature and humidity sensor and an OLED screen');
const t0=Date.now();
await p.click('button.primary.big');
await p.waitForTimeout(700);
await p.screenshot({path:'test-results/qa/verify-welcome/after-700ms.png'});
console.log('700ms text:', (await p.locator('body').innerText()).slice(0,400));
console.log('design button count:', await p.locator('button.primary.big').count());
await p.waitForTimeout(20000);
await p.screenshot({path:'test-results/qa/verify-welcome/after-20s.png'});
console.log('20s text:', (await p.locator('body').innerText()).slice(0,400));
for(let i=0;i<90;i++){ if(await p.locator('.tabs button').count()) break; await p.waitForTimeout(1000);}
console.log('done after', (Date.now()-t0)/1000,'s posts', posts);
await p.screenshot({path:'test-results/qa/verify-welcome/final.png'});
await b.close();
