// eli-engineer: walk schematic/BOM/sim/problems for examples
import { chromium } from 'playwright';
const OUT = 'test-results/qa/eli-engineer';
const ids = process.argv.slice(2);
const b = await chromium.launch();
for (const id of ids) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto(`http://localhost:5173/?example=${id}&notour`);
  await p.waitForSelector('.part'); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${id}-1-breadboard.png` });
  const tabs = await p.$$eval('.tabs button', bs => bs.map(b => b.textContent));
  console.log('tabs', tabs);
  // problems
  const ct = await p.$$eval('.console-tabs button', bs => bs.map(b => b.textContent)); console.log('console tabs', ct);
  await p.click('.console-tabs button:has-text("Problems")').catch(()=>{});
  await p.waitForTimeout(300);
  console.log('PROBLEMS:', (await p.textContent('[data-testid=problems]').catch(()=>'n/a'))?.slice(0, 1500));
  // run
  await p.click('button.run'); await p.waitForTimeout(4000);
  await p.click('.console-tabs button >> nth=0').catch(()=>{});
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${id}-2-running.png` });
  console.log('SERIAL:', (await p.textContent('[data-testid=serial]').catch(()=>'n/a'))?.slice(0, 800));
  await p.click('.console-tabs button:has-text("Problems")').catch(()=>{});
  await p.waitForTimeout(300);
  console.log('PROBLEMS(running):', (await p.textContent('[data-testid=problems]').catch(()=>'n/a'))?.slice(0, 1500));
  await p.click('button.run');
  await p.click('.tabs button:has-text("Schematic")'); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${id}-3-schematic.png`, fullPage: true });
  await p.click('.tabs button:has-text("Parts list")'); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${id}-4-bom.png`, fullPage: true });
  console.log('console errors:', errs);
  await ctx.close();
}
await b.close();
