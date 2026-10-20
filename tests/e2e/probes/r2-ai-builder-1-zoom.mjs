import { chromium } from 'playwright';
const [proj, tabName, x, y, w, h, out] = process.argv.slice(2);
const ctx = await chromium.launchPersistentContext('test-results/qa2/ai-builder-1/profile-' + proj, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
const p = ctx.pages()[0]; await p.goto('http://localhost:5173/?notour'); await p.waitForTimeout(2000);
await p.locator('.tabs button', { hasText: tabName }).first().click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `test-results/qa2/ai-builder-1/${proj}/${out}.png`, clip: { x: +x, y: +y, width: +w, height: +h } });
console.log(await p.evaluate(() => [...document.querySelectorAll('svg text')].map(t => t.textContent).filter(t => /^(R\d|47|220|4\.7|470)/.test(t)).join(' | ')));
await ctx.close();
