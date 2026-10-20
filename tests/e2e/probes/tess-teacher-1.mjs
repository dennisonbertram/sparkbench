import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const OUT = 'test-results/qa/tess-teacher';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['esp32-weather-imu','pico-traffic-light','rpi-thermostat','555-blinker','esp32-neopixel-thermo'];
const browser = await chromium.launch();
for (const id of ids) {
  const d = join(OUT, id); mkdirSync(d, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:5173/?example=${id}&notour`);
  await page.waitForSelector('.part', { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(d, 'breadboard.png') });
  // export json
  const openMenu = async () => { if (!(await page.locator('.menu button:has-text("Everything")').count())) await page.click('header button.primary:has-text("Export")'); await page.waitForSelector('.menu button:has-text("Everything")'); };
  await openMenu();
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('.menu button:has-text("Project file")')]);
  await dl.saveAs(join(d, 'export-' + dl.suggestedFilename()));
  await openMenu();
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('.menu button:has-text("Everything")')]);
  await dl.saveAs(join(d, 'export-' + dl.suggestedFilename()));
  await page.waitForTimeout(300);
  console.log('menu open after zip?', await page.locator('.menu button:has-text("Everything")').count());
  if (await page.locator('.menu button:has-text("Everything")').count()) await page.click('header button.primary:has-text("Export")');
  for (const [tab, kind] of [['Build guide','guide'],['Blog post','blog']]) {
    await page.click(`.tabs button:has-text("${tab}")`);
    await page.waitForSelector(`[data-testid=doc-${kind}]`);
    await page.waitForTimeout(500);
    writeFileSync(join(d, `${kind}.txt`), await page.innerText(`[data-testid=doc-${kind}]`));
    await page.screenshot({ path: join(d, `${kind}-view.png`) });
    await page.locator(`[data-testid=doc-${kind}]`).screenshot({ path: join(d, `${kind}-full.png`) }).catch(e => console.log('shot fail', e.message));
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: join(d, `${kind}-print.pdf`), format: 'A4' });
    await page.emulateMedia({ media: 'screen' });
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('.doc-toolbar button:has-text("Download Markdown")')]);
    await dl.saveAs(join(d, 'dl-' + dl.suggestedFilename()));
  }
  writeFileSync(join(d, 'console-errors.txt'), errs.join('\n'));
  console.log(id, 'errors:', errs.length);
  await ctx.close();
}
await browser.close();
