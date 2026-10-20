import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:5173/?welcome&notour'); await p.waitForTimeout(800);
await p.fill('.hero-input textarea', '   \n  ');
console.log('disabled for whitespace', await p.locator('button.primary.big').isDisabled());
await p.press('.hero-input textarea', 'Enter'); await p.waitForTimeout(800);
console.log('composer?', await p.locator('.composer textarea').count());
// double-click submission
await p.fill('.hero-input textarea', 'pico with a buzzer');
await p.click('button.primary.big'); await p.waitForTimeout(300);
console.log('btn disabled while designing?', await p.locator('button.primary.big').isDisabled().catch(()=>'gone'));
await p.click('button.primary.big').catch(()=>{}); 
await p.waitForTimeout(500);
await p.screenshot({ path: 'test-results/qa/builder-edge/double-1s.png' });
for (let i=0;i<120;i++){ await p.waitForTimeout(1000); if (await p.locator('.composer textarea').count() && !(await p.locator('.msg.pending').count())) break; }
await p.waitForTimeout(20000);
const msgs = await p.locator('.msg').evaluateAll((els) => els.map((e) => e.className + ' :: ' + e.innerText.replace(/\s+/g, ' ').slice(0, 300)));
console.log(JSON.stringify(msgs, null, 1));
await p.screenshot({ path: 'test-results/qa/builder-edge/double-end.png' });
await b.close();
