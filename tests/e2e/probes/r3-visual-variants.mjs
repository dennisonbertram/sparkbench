// Visual variants: dark mode and small viewports. Usage:
// node tests/e2e/probes/r3-visual-variants.mjs --out DIR --ids a,b --width W --height H [--dark]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = 'http://localhost:5173';
const OUT = arg('out', 'test-results/qa3/visual/variant');
const IDS = arg('ids', '').split(',').filter(Boolean);
const W = Number(arg('width', '1440')), H = Number(arg('height', '900'));
const DARK = process.argv.includes('--dark');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: DARK ? 'dark' : 'light' });
const report = [];
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?welcome&notour`); await page.waitForSelector('.hero'); await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, '00-welcome.png') });
  await page.screenshot({ path: join(OUT, '00-welcome-full.png'), fullPage: true });
  report.push({ id: 'welcome', hscroll: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
  await page.close();
}
for (const id of IDS) {
  const page = await ctx.newPage(); const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const r = { id, errors };
  try {
    await page.goto(`${BASE}/?example=${id}&notour`);
    await page.waitForSelector('[data-testid="breadboard"] .part', { timeout: 20000 });
    await page.waitForTimeout(900);
    r.hscroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    await page.screenshot({ path: join(OUT, `${id}-1-breadboard.png`) });
    const run = page.locator('button.run');
    if (await run.isVisible().catch(() => false)) {
      await run.click(); await page.waitForTimeout(4500);
      await page.screenshot({ path: join(OUT, `${id}-2-running.png`) });
      const pt = page.locator('.console-tabs button:nth-child(2)');
      if (await pt.isVisible().catch(() => false)) { await pt.click(); await page.waitForTimeout(200); await page.screenshot({ path: join(OUT, `${id}-3-problems.png`) }); }
      await run.click().catch(() => {});
    } else r.noRun = true;
    const tabs = { schematic: 'Schematic', code: 'Code', bom: 'Parts list', guide: 'Build guide', blog: 'Blog post' };
    let n = 4;
    for (const [v, label] of Object.entries(tabs)) {
      const tab = page.locator('.tabs button', { hasText: label });
      if (!(await tab.count())) { r[`missing_${v}`] = true; continue; }
      if (!(await tab.first().isVisible())) { r[`hidden_${v}`] = true; continue; }
      await tab.first().click(); await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, `${id}-${n++}-${v}.png`) });
    }
  } catch (e) { r.failure = String(e); await page.screenshot({ path: join(OUT, `${id}-fail.png`) }).catch(() => {}); }
  report.push(r); console.log(JSON.stringify(r)); await page.close();
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
