import { chromium } from 'playwright';
const ids = process.argv.slice(2);
const out = 'test-results/qa2/engineer';
const b = await chromium.launch();
for (const id of ids) {
  const page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('pageerror', e => console.log(id, 'PAGEERROR', e.message));
  await page.goto(`http://localhost:5173/?example=${id}&notour`);
  await page.waitForTimeout(2000);
  await page.click('button.run');
  await page.waitForTimeout(4000);
  for (const t of ['Problems', 'Pins']) {
    const tb = page.locator('.console-tabs button', { hasText: t }).first();
    if (await tb.count()) { await tb.click(); await page.waitForTimeout(800); }
    const txt = await page.locator('.console, [data-testid=problems], .console-body').first().innerText().catch(() => '');
    console.log(`----- ${id} ${t}\n${txt}`);
    await page.screenshot({ path: `${out}/${id}-run-${t}.png` });
  }
  await page.close();
}
await b.close();
