// Usage: node scripts/svg-to-png.mjs file1.svg [file2.svg …] → writes .png next to each
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const b = await chromium.launch();
const page = await b.newPage({ deviceScaleFactor: 1 });
for (const f of process.argv.slice(2)) {
  await page.setContent(`<body style="margin:0;background:#fff">${readFileSync(f, 'utf8')}</body>`);
  await page.locator('svg').screenshot({ path: f.replace(/\.svg$/, '.png') });
}
await b.close();
