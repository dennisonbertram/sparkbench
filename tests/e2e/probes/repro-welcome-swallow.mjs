import { chromium } from 'playwright';
const dir = 'test-results/qa/repro-welcome';
const b = await chromium.launch();
for (const [label, prompt] of [['question','what boards do you support?'],['garbage','asdfgh qwerty zxcv ;;;']]) {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  let resp = null;
  page.on('response', async r => { if (r.url().includes('/api/ai/design')) { try { resp = (await r.text()).slice(0,400); } catch {} } });
  await page.goto('http://localhost:5173/?welcome&notour');
  await page.fill('.hero-input textarea', prompt);
  await page.click('button.primary.big');
  const t0 = Date.now();
  while (!resp && Date.now()-t0 < 240000) await page.waitForTimeout(1000);
  await page.waitForTimeout(3000);
  console.log(label, 'secs', (Date.now()-t0)/1000, 'resp', resp);
  console.log(label, 'welcome visible', await page.locator('.welcome').count(), 'textarea', await page.inputValue('.hero-input textarea').catch(()=>'n/a'));
  const body = await page.locator('body').innerText();
  console.log(label, 'reply visible in body?', resp ? body.includes((JSON.parse(resp).reply||'xx').slice(0,30)) : 'n/a');
  await page.screenshot({ path: `${dir}/${label}-end.png` });
  await page.close();
}
await b.close();
