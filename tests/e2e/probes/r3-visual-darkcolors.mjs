import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })).newPage();
await page.goto('http://localhost:5173/?example=rpi-plant-waterer&notour');
await page.waitForSelector('[data-testid="breadboard"] .part');
await page.locator('.tabs button', { hasText: 'Code' }).click(); await page.waitForTimeout(800);
const toks = await page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll('.cm-line span')) { const t = el.textContent.trim(); if (['import','def','now_ms','30','from','return'].includes(t) && !out[t]) out[t] = getComputedStyle(el).color; }
  const ed = document.querySelector('.cm-editor, .cm-content'); out.bg = ed && getComputedStyle(document.querySelector('.cm-editor')).backgroundColor;
  return out;
});
console.log('code tokens', JSON.stringify(toks));
await page.locator('.tabs button', { hasText: 'Parts list' }).click(); await page.waitForTimeout(500);
console.log('bom link', await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'DigiKey'); return a && getComputedStyle(a).color; }));
await browser.close();
