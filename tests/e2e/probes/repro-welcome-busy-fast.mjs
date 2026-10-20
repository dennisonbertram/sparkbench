import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1280,height:800}});
let posts=0; p.on('request', r=>{ if(r.url().includes('/api/ai/design')) posts++; });
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('.hero-input textarea','pico with a buzzer');
await p.dblclick('button.primary.big');
await p.keyboard.press('Enter').catch(()=>{});
for(let i=0;i<90;i++){ if(await p.locator('.tabs button').count()) break; await p.waitForTimeout(1000);}
await p.waitForTimeout(1000);
const users = await p.getByText('pico with a buzzer', {exact:true}).count();
console.log('design posts', posts, 'user msgs matching', users);
await p.screenshot({path:'test-results/qa/repro-welcome-busy/fast-final.png'});
await b.close();
