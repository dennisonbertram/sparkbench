// Visual pass: open the app in Chromium, walk the main user flows for every example project,
// screenshot each view and fail on console errors or a simulator crash.
// Usage: node tests/e2e/visual.mjs [--base http://localhost:5173] [--out dir] [--only id1,id2] [--width 1440]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const BASE = arg('base', 'http://localhost:5173');
const OUT = arg('out', 'test-results/visual');
const ONLY = arg('only', '')?.split(',').filter(Boolean);
const WIDTH = Number(arg('width', '1440'));
const HEIGHT = Number(arg('height', '900'));
const VIEWS = (arg('views', 'breadboard,run,schematic,code,bom,guide,blog') || '').split(',');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const report = [];

async function newPage() {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return { page, errors };
}

// 1. Welcome screen
{
  const { page, errors } = await newPage();
  await page.goto(`${BASE}/?welcome&notour`);
  await page.waitForSelector('.hero');
  await page.screenshot({ path: join(OUT, '00-welcome.png') });
  report.push({ id: 'welcome', errors });
  await page.close();
}

const examples = await (async () => {
  const { page } = await newPage();
  await page.goto(`${BASE}/?welcome&notour`);
  const ids = await page.$$eval('[data-example]', (els) => els.map((e) => e.getAttribute('data-example')));
  await page.close();
  return ids.filter((id) => !ONLY?.length || ONLY.includes(id));
})();

for (const id of examples) {
  const { page, errors } = await newPage();
  const r = { id, errors, checks: {} };
  try {
    await page.goto(`${BASE}/?example=${id}&notour`);
    await page.waitForSelector('[data-testid="breadboard"] .part');
    await page.waitForTimeout(900);
    if (VIEWS.includes('breadboard')) await page.screenshot({ path: join(OUT, `${id}-1-breadboard.png`) });
    if (VIEWS.includes('run')) {
      await page.click('button.run');
      await page.waitForTimeout(4500);
      r.checks.status = await page.textContent('.status');
      r.checks.simTime = await page.textContent('.sim-time');
      r.checks.serial = (await page.textContent('[data-testid="serial"]').catch(() => ''))?.slice(-300);
      await page.screenshot({ path: join(OUT, `${id}-2-running.png`) });
      await page.click('.console-tabs button:nth-child(2)');
      await page.waitForTimeout(200);
      r.checks.problems = (await page.textContent('[data-testid="problems"]'))?.slice(0, 600);
      await page.screenshot({ path: join(OUT, `${id}-3-problems.png`) });
      await page.click('button.run').catch(() => {});
    }
    const tabs = { schematic: 'Schematic', code: 'Code', bom: 'Parts list', guide: 'Build guide', blog: 'Blog post' };
    let n = 4;
    for (const [view, label] of Object.entries(tabs)) {
      if (!VIEWS.includes(view)) continue;
      const tab = page.locator('.tabs button', { hasText: label });
      if (!(await tab.count())) continue;
      await tab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `${id}-${n++}-${view}.png`), fullPage: false });
    }
  } catch (e) {
    r.failure = String(e);
  }
  r.errors = errors;
  report.push(r);
  await page.close();
  console.log(`${id}: ${r.failure ? 'FAIL ' + r.failure : 'ok'} | status=${r.checks.status} ${r.checks.simTime} | console errors=${errors.length}`);
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
const bad = report.filter((r) => r.failure || r.errors.length);
console.log(`\n${report.length} pages, ${bad.length} with problems. Screenshots in ${OUT}`);
for (const b of bad) console.log(` - ${b.id}: ${b.failure ?? ''} ${b.errors.slice(0, 3).join(' | ')}`);
process.exit(bad.length ? 1 : 0);
