import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const ids = process.argv.slice(2);
const out = 'test-results/qa2/verify555';
const b = await chromium.launch();
for (const id of ids) {
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(id, 'PAGEERROR', e.message));
  await page.goto(`http://localhost:5173/?example=${id}&notour`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${id}-open.png` });
  await page.getByRole('button', { name: /Export/ }).first().click();
  await page.waitForTimeout(300);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Everything (.zip)' }).click()]);
  const zp = `${out}/${id}.zip`;
  await dl.saveAs(zp);
  console.log(id, 'downloaded', dl.suggestedFilename());
  const dir = `${out}/${id}`; mkdirSync(dir, { recursive: true });
  execSync(`unzip -o -q ${zp} -d ${dir}`);
  await ctx.close();
}
await b.close();
