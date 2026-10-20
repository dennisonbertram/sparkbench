import { chromium } from 'playwright';
import fs from 'fs';
const out = 'test-results/qa2/teacher';
const ids = ['esp32-eink-weather','esp32-internet-clock','rpi-weather-dashboard','555-tone','esp32-pedometer'];
const b = await chromium.launch();
for (const id of ids) {
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://localhost:5173/?example=${id}&notour`);
  await p.waitForTimeout(3000);
  // problems tab
  const pt = p.locator('.console-tabs button', { hasText: 'Problems' }).first();
  if (await pt.count()) { await pt.click(); await p.waitForTimeout(500);
    const t = await p.locator('[data-testid=problems]').innerText().catch(()=>'(none)');
    fs.writeFileSync(`${out}/${id}-problems.txt`, t); }
  await p.screenshot({ path: `${out}/${id}-board.png` });
  for (const tab of ['Build guide', 'Blog post', 'Parts list']) {
    await p.locator('.tabs button', { hasText: tab }).first().click();
    await p.waitForTimeout(1500);
    const txt = await p.locator('body').innerText();
    const slug = tab.replace(' ', '-');
    fs.writeFileSync(`${out}/${id}-${slug}.txt`, txt);
    await p.screenshot({ path: `${out}/${id}-${slug}.png` });
  }
  console.log(id, 'errors:', errs);
  await p.close();
}
await b.close();
