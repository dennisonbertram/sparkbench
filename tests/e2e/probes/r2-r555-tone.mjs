import { chromium } from 'playwright';
const dir='test-results/qa2/r555';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('http://localhost:5173/?example=555-tone&notour'); await p.waitForTimeout(3000);
await p.screenshot({path:`${dir}/1-open.png`});
await p.click('button.run'); await p.waitForTimeout(4000);
await p.screenshot({path:`${dir}/2-running.png`});
const pt=p.locator('.console-tabs button',{hasText:'Problems'}); console.log('tab:',await pt.innerText());
await pt.click(); await p.waitForTimeout(500);
console.log('problems:',await p.locator('[data-testid=problems]').innerText().catch(e=>'ERR'));
await p.screenshot({path:`${dir}/3-problems.png`});
console.log('badges:',await p.locator('text=No power').count());
const m=p.locator('.momentary'); console.log('momentary count',await m.count());
if(await m.count()){ const bb=await m.first().boundingBox(); await p.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2); await p.mouse.down(); await p.waitForTimeout(1500);
 await p.screenshot({path:`${dir}/4-pressed.png`}); console.log('pressed problems:',await p.locator('[data-testid=problems]').innerText().catch(e=>'ERR')); console.log('badges pressed:',await p.locator('text=No power').count()); await p.mouse.up();}
await b.close();
