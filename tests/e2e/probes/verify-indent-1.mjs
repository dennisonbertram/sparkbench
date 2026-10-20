import { chromium } from 'playwright';
const OUT='test-results/qa/verify-indent/';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1400,height:900}});
await p.goto('http://localhost:5173/?example=esp32-tilt-game&notour'); await p.waitForSelector('.part',{timeout:30000}); await p.waitForTimeout(1500);
await p.locator('.tabs button',{hasText:'Code'}).click(); await p.waitForTimeout(800);
// find a 4-space-indented line inside while loop
const lines = await p.locator('.cm-line').allInnerTexts();
console.log(lines.slice(0,60).map((l,i)=>i+': '+JSON.stringify(l)).join('\n'));
let target = null;
for (const l of lines) if (/^    \S/.test(l) && !/:\s*$/.test(l)) { target = l; }
console.log('TARGET', JSON.stringify(target));
const loc = p.locator('.cm-line', { hasText: target.trim() }).last();
await loc.scrollIntoViewIfNeeded(); await loc.click(); await p.keyboard.press('End'); await p.keyboard.press('Enter');
await p.keyboard.type('print(temprature)'); await p.waitForTimeout(400);
const after = await p.evaluate(()=>{const v=document.querySelector('.cm-content'); return v.innerText;});
const al = after.split('\n'); const i = al.findIndex(l=>l.includes('temprature'));
console.log('AFTER', JSON.stringify(al.slice(i-3,i+2)));
await p.screenshot({path:OUT+'1-after-enter.png'});
await p.click('button.run'); await p.waitForTimeout(3000);
console.log('SERIAL', await p.locator('[data-testid=serial]').innerText().catch(e=>String(e)));
const pt = p.locator('.console-tabs button',{hasText:'Problems'}); if (await pt.count()) await pt.click();
await p.waitForTimeout(300);
console.log('PROBLEMS', await p.locator('[data-testid=problems]').innerText().catch(e=>String(e)));
await p.screenshot({path:OUT+'2-run.png'});
await b.close();
