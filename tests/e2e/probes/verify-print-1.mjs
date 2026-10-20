import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('http://localhost:5173/?example=esp32-weather-imu&notour');
await p.waitForTimeout(2500);
for (const tab of ['Build guide','Blog post']) {
  await p.locator('.tabs button', { hasText: tab }).click();
  await p.waitForTimeout(1000);
  await p.emulateMedia({ media: 'print' });
  const info = await p.evaluate(() => { const d = document.querySelector('.docview'); return { sh: d?.scrollHeight, bodyH: document.body.scrollHeight }; });
  const out = `test-results/qa/verify-print/${tab.replace(' ','-')}.pdf`;
  const buf = await p.pdf({ path: out, format: 'A4' });
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(tab, info, 'pages', pages);
  await p.screenshot({ path: `test-results/qa/verify-print/${tab.replace(' ','-')}-printmedia.png`, fullPage: true });
  await p.emulateMedia({ media: 'screen' });
}
await b.close();
