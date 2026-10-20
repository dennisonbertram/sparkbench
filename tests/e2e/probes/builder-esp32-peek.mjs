import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:5173/?welcome&notour');
await p.waitForTimeout(3000);
await p.screenshot({ path: 'test-results/qa/builder-esp32/crash/peek1.png' });
console.log(await p.evaluate(() => document.body.innerText.slice(0, 500)));
await b.close();
