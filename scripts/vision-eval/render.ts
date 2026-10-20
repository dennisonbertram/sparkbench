// Render every case (correct + each fault) as a clean image and a phone-photo-like image.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CASES } from './layouts';
import { faultsFor } from './faults';
import { renderBreadboardSvg } from '../../src/core/breadboard';

const OUT = process.argv[2] ?? 'test-results/vision/images';
mkdirSync(OUT, { recursive: true });
const items: { id: string; caseId: string; fault: string; svg: string }[] = [];
for (const c of CASES) {
  items.push({ id: `${c.id}__ok`, caseId: c.id, fault: 'none', svg: renderBreadboardSvg(c.layout) });
  for (const f of faultsFor(c)) items.push({ id: `${c.id}__${f.kind}`, caseId: c.id, fault: f.kind, svg: renderBreadboardSvg(f.layout) });
}
const STYLES = {
  clean: 'body{margin:0;background:#fff} #s{display:inline-block}',
  // Phone photo: table background, tilt/perspective, slight blur, warm uneven light.
  photo: `body{margin:0;background:radial-gradient(circle at 30% 20%,#a07850,#5b3f26);width:1600px;height:900px;overflow:hidden;display:flex;align-items:center;justify-content:center}
          #s{transform:perspective(1500px) rotateX(24deg) rotateZ(-3deg) scale(1.02);filter:blur(0.7px) brightness(1.06) contrast(0.92) saturate(0.95) sepia(0.12)}
          #glare{position:fixed;inset:0;background:radial-gradient(circle at 70% 30%,#fff4 0,transparent 45%),linear-gradient(0deg,#0003,transparent 40%)}`,
};
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
for (const it of items) {
  for (const [style, css] of Object.entries(STYLES)) {
    await page.setContent(`<html><head><style>${css}</style></head><body><div id="s">${it.svg}</div>${style === 'photo' ? '<div id="glare"></div>' : ''}</body></html>`);
    const path = `${OUT}/${it.id}__${style}.${style === 'photo' ? 'jpg' : 'png'}`;
    if (style === 'clean') await page.locator('#s').screenshot({ path });
    else await page.screenshot({ path, type: 'jpeg', quality: 62 });
  }
}
await b.close();
writeFileSync(`${OUT}/index.json`, JSON.stringify(items.map(({ svg, ...x }) => x), null, 1));
console.log(`${items.length} builds × 2 styles rendered to ${OUT}`);
