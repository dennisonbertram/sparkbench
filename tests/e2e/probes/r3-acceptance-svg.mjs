// Render schematic.svg files to PNG via Playwright. Usage: node tests/e2e/probes/r3-acceptance-svg.mjs proj1 proj2 ...
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const outDir = 'test-results/qa3/acceptance';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
for (const p of process.argv.slice(2)) {
  const file = path.resolve(`out/${p}/schematic.svg`);
  const errs = [];
  page.removeAllListeners('console');
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const svg = fs.readFileSync(file, 'utf8');
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
  const info = await page.evaluate(() => { const s = document.querySelector('svg'); const b = s.getBBox(); return { w: s.getAttribute('width'), h: s.getAttribute('height'), vb: s.getAttribute('viewBox'), bbox: [b.x, b.y, b.width, b.height], text: s.querySelectorAll('text').length }; });
  await page.locator('svg').first().screenshot({ path: `${outDir}/svg-${p}.png`, timeout: 60000 });
  console.log(p, JSON.stringify(info), errs.join('|'));
}
await browser.close();
