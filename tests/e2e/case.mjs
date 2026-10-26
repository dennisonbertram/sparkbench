// E2E: design the board, then make a case and preview it in 3D; try each style.
import { chromium } from 'playwright';
const ex = process.argv[2] ?? 'pico-simon';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(`http://localhost:5173/?example=${ex}&notour`);
await p.evaluate(() => localStorage.clear());
await p.goto(`http://localhost:5173/?example=${ex}&notour`);
await p.waitForSelector('.part');
await p.click('.tabs button:has-text("Circuit board")');
await p.click('[data-testid=pcb-build]');
await p.waitForSelector('[data-testid=pcb-result]', { timeout: 400000 });
// The result smooth-scrolls into view; clicking during that scroll never finds a stable button.
await p.waitForTimeout(1500);
await p.click('[data-testid=case-make]');
await p.waitForSelector('[data-testid=case-summary]', { timeout: 60000 });
await p.waitForTimeout(2500);
await p.locator('[data-testid=case-section]').scrollIntoViewIfNeeded();
await p.locator('[data-testid=case-viewer]').screenshot({ path: `test-results/case-${ex}-open.png` });
console.log('summary:', await p.textContent('[data-testid=case-summary]'));
await p.click('.case-viewer-tools button');
await p.waitForTimeout(1500);
await p.locator('[data-testid=case-viewer]').screenshot({ path: `test-results/case-${ex}-closed.png` });
for (const st of ['Desk stand', 'Wall-mount']) {
  await p.click(`.case-styles button:has-text("${st}")`);
  await p.waitForFunction(() => !document.querySelector('[data-testid=case-make]')?.textContent?.includes('Making'), null, { timeout: 60000 });
  await p.waitForTimeout(2000);
  const links = await p.$$eval('[data-testid=case-section] .pcb-downloads a', (as) => as.map((a) => a.textContent));
  console.log(st, '→', links.join(', '));
  await p.locator('[data-testid=case-viewer]').screenshot({ path: `test-results/case-${ex}-${st.replace(/\W+/g, '-').toLowerCase()}.png` });
}
console.log('errors:', errors);
await b.close();
process.exit(errors.length ? 1 : 0);
