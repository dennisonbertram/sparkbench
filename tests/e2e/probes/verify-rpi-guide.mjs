import { chromium } from 'playwright';
const out = 'test-results/qa/verify-rpi';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await p.goto('http://localhost:5173/?example=rpi-thermostat&notour');
await p.waitForTimeout(3000);
for (const tab of ['Build guide', 'Blog post']) {
  await p.locator('.tabs button', { hasText: tab }).first().click();
  await p.waitForTimeout(1500);
  const txt = await p.locator('main, body').first().innerText();
  const fs = await import('fs');
  fs.writeFileSync(`${out}/${tab.replace(' ', '-')}.txt`, txt);
  await p.screenshot({ path: `${out}/${tab.replace(' ', '-')}.png`, fullPage: true });
}
await b.close();
