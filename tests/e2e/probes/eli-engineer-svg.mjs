import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const b = await chromium.launch();
for (const id of process.argv.slice(2)) {
  const p = await (await b.newContext({ viewport: { width: 1800, height: 1200 } })).newPage();
  const svg = readFileSync(`test-results/qa/eli-engineer/${id}/schematic.svg`, 'utf8');
  await p.setContent(`<body style="margin:0;background:#fff">${svg.replace('<svg', '<svg style="width:1800px;height:auto"')}</body>`);
  await p.screenshot({ path: `test-results/qa/eli-engineer/${id}-svg-large.png`, fullPage: true });
}
await b.close();
