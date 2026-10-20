import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1280,height:800}});
let posts=0; p.on('request', r=>{ if(r.url().includes('/api/')) {posts++; console.log('REQ', r.method(), r.url());} });
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('.hero-input textarea','pico with a buzzer');
const t0=Date.now();
const btn = p.locator('button.primary.big');
await btn.click();
// rapid second click / enter
try { await btn.click({timeout:500}); console.log('second click succeeded'); } catch(e){ console.log('second click failed:', e.message.split('\n')[0]); }
await p.waitForTimeout(1500);
await p.screenshot({path:'test-results/qa/repro-welcome-busy/after-1.5s.png'});
console.log('1.5s text:', (await p.locator('body').innerText()).slice(0,300));
for(let i=0;i<90;i++){ if(await p.locator('.tabs button').count()) break; await p.waitForTimeout(1000);}
console.log('done after', (Date.now()-t0)/1000,'s posts', posts);
await p.waitForTimeout(1000);
await p.screenshot({path:'test-results/qa/repro-welcome-busy/final.png'});
const chat = await p.locator('.chat, .copilot').first().innerText().catch(()=> 'n/a');
console.log('CHAT:', chat.slice(0,800));
await b.close();
