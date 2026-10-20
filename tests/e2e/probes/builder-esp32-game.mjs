// builder-esp32: play the reaction game. node tests/e2e/probes/builder-esp32-game.mjs
import { chromium } from 'playwright';
import fs from 'fs';
const dir = `test-results/qa/builder-esp32/p2-game`;
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5173/?welcome&notour');
await p.waitForSelector('.hero-input textarea');
await p.fill('.hero-input textarea', 'ESP32 reaction time game with 3 buttons, 3 LEDs and a buzzer');
await p.click('button.primary.big');
await p.waitForTimeout(8000);
await p.screenshot({ path: `${dir}/00-waiting.png` });
await p.waitForSelector('.part', { timeout: 150000 });
await p.waitForTimeout(1500);
// map: which button/LED parts, their labels
const info = await p.evaluate(() => [...document.querySelectorAll('.part')].map(e => e.getAttribute('data-part') + ' :: ' + (e.textContent || '').trim().slice(0, 40)));
console.log(info.join('\n'));
const notes = await p.evaluate(() => document.body.innerText.match(/Why it's wired this way[\s\S]{0,600}/g));
console.log(notes);
await p.click('button.run');
const leds = ['led1', 'led2', 'led3'];
const bright = () => p.evaluate((ids) => ids.map(id => { const el = document.querySelector(`.part[data-part=${id}] wokwi-led`) || document.querySelector(`.part[data-part=${id}] *`); return el && el.brightness !== undefined ? +el.brightness.toFixed(2) : null; }), leds);
const btns = p.locator('.momentary');
for (let round = 0; round < 3; round++) {
  let lit = -1; const t0 = Date.now();
  while (Date.now() - t0 < 12000) { const br = await bright(); lit = br.findIndex(x => x > 0.3); if (lit >= 0) { console.log('round', round, 'brightness', br); break; } await p.waitForTimeout(100); }
  await p.screenshot({ path: `${dir}/r${round}-lit.png` });
  if (lit < 0) { console.log('no LED lit'); break; }
  // assume ledN pairs with button N (check labels in screenshot)
  await btns.nth(lit).dispatchEvent('pointerdown'); await p.waitForTimeout(150); await btns.nth(lit).dispatchEvent('pointerup');
  await p.waitForTimeout(1500);
}
// wrong press / early press
await btns.nth(0).dispatchEvent('pointerdown'); await p.waitForTimeout(150); await btns.nth(0).dispatchEvent('pointerup');
await p.waitForTimeout(1500);
await p.screenshot({ path: `${dir}/end.png` });
console.log(await p.evaluate(() => document.querySelector('[data-testid=serial]')?.innerText));
await p.click('button.run');
for (const t of ['Code', 'Build guide', 'Blog post', 'Parts list', 'Schematic']) {
  await p.click(`.tabs button:has-text("${t}")`); await p.waitForTimeout(1200);
  const slug = t.replace(/\s/g, '').toLowerCase();
  await p.screenshot({ path: `${dir}/tab-${slug}.png` });
  fs.writeFileSync(`${dir}/tab-${slug}.txt`, await p.evaluate(() => document.body.innerText));
}
// code: grab from CodeMirror state if available
const code = await p.evaluate(() => { const cm = document.querySelector('.cm-content'); return cm ? cm.innerText : null; });
fs.writeFileSync(`${dir}/code-visible.txt`, code || '');
console.log('ERRS', errs.join('\n'));
await b.close();
