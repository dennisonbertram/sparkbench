import { open, OUT, proj, tab } from './r3-regression-lib.mjs';
const prompt = process.argv[2] || 'a 555 circuit that beeps';
const {b,p} = await open('?welcome&notour');
await p.fill('.hero-input textarea', prompt); await p.click('.hero-input button');
const t0=Date.now();
while (Date.now()-t0<300000){ await p.waitForTimeout(3000); if (await p.locator('.part[data-part]').count() && !(await p.locator('.designing').count())) break; }
await p.waitForTimeout(4000);
console.log('secs', (Date.now()-t0)/1000);
const pr = await proj(p);
console.log('name', pr?.name, '\nparts', pr?.parts.map(x=>x.id+':'+x.type).join(', '));
console.log('board', pr?.board);
await p.screenshot({path:OUT+'ai555-1.png'});
console.log('chat', JSON.stringify((await p.locator('.msg.ai:not(.pending)').allInnerTexts()).slice(-1)[0]?.slice(0,500)));
await p.click('[data-testid=problems]').catch(()=>{});
const run = p.locator('button.run'); if (await run.count()) { await run.click(); await p.waitForTimeout(4000); }
await p.screenshot({path:OUT+'ai555-2-run.png'});
console.log('problems', JSON.stringify((await p.locator('[data-testid=problems]').innerText().catch(()=>'')).slice(0,500)));
await b.close();
