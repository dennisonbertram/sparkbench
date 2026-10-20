import { chromium } from 'playwright';
import fs from 'fs';
const label = process.argv[2] || 'doorbell';
const prompt = process.argv[3] || 'a smart doorbell with a Raspberry Pi that plays a tune and lights an LED when the button is pressed';
const dir = 'test-results/qa2/repro-docs/' + label + '/';
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:5173/?welcome&notour');
await p.waitForTimeout(1500);
await p.locator('.hero-input textarea').fill(prompt);
await p.locator('.hero-input button').click();
const t0 = Date.now();
await p.waitForFunction(() => document.querySelectorAll('.msg.ai:not(.pending)').length > 0 && !document.querySelector('.msg.pending'), null, { timeout: 300000 });
console.log('design took', Date.now() - t0);
await p.waitForTimeout(2000);
await p.screenshot({ path: dir + '01-design.png' });
fs.writeFileSync(dir + 'chat.txt', await p.evaluate(() => [...document.querySelectorAll('.msg')].map(m => m.innerText).join('\n---\n')));
const proj = await p.evaluate(() => { for (const k of Object.keys(localStorage)) { const v = localStorage.getItem(k); if (v && v.includes('main.py')) return v; } return null; });
fs.writeFileSync(dir + 'storage.json', proj || 'none');
for (const [t, f] of [['Code', 'code'], ['Build guide', 'guide'], ['Blog post', 'blog']]) {
  await p.locator('.tabs button', { hasText: t }).first().click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: dir + '02-' + f + '.png' });
  const txt = await p.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText);
  fs.writeFileSync(dir + f + '.txt', txt);
}
await b.close();
