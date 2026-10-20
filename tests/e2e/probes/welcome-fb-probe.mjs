import { chromium } from 'playwright';
const out = 'test-results/qa/welcome-fb';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:5173/?welcome&notour');
await p.waitForSelector('.hero-input textarea');
await p.fill('.hero-input textarea', 'a thermometer with a screen for my desk');
const t0 = Date.now();
await p.click('button.primary.big');
for (const s of [1, 5, 15]) {
  await p.waitForTimeout(s * 1000 - (Date.now() - t0));
  const st = await p.evaluate(() => ({
    welcome: !!document.querySelector('.welcome'),
    btnDisabled: document.querySelector('button.primary.big')?.disabled,
    text: document.querySelector('.hero-input textarea')?.value,
    body: document.body.innerText.slice(0, 300),
  }));
  console.log(s, JSON.stringify(st));
  await p.screenshot({ path: `${out}/wait-${s}s.png` });
}
await p.waitForSelector('.tabs', { timeout: 90000 }).catch(() => {});
console.log('editor at', (Date.now() - t0) / 1000);
await p.screenshot({ path: `${out}/final.png` });
await b.close();
