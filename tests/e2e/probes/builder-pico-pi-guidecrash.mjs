import { chromium } from 'playwright';
import fs from 'fs';
const [slug, prompt] = process.argv.slice(2);
const dir = `test-results/qa/builder-pico-pi/${slug}`; fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message, e.stack?.split('\n').slice(0,6).join(' | ')));
p.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text().slice(0, 600)); });
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('textarea', prompt);
await p.click('button.primary.big');
await p.waitForSelector('.part', { timeout: 180000 });
await p.waitForTimeout(1500);
const ls = await p.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
fs.writeFileSync(`${dir}/localStorage.json`, JSON.stringify(ls, null, 1));
for (const t of ['Code', 'Parts list', 'Build guide', 'Blog post', 'Schematic']) {
  const btn = p.locator('.tabs button', { hasText: t }).first();
  if (!(await btn.count())) { console.log('tab missing', t); continue; }
  await btn.click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${dir}/20-${t.replace(/ /g,'_')}.png`, fullPage: false });
  const txt = await p.locator('[data-testid^=doc-], [data-testid=bom]').first().innerText({ timeout: 2000 }).catch(() => '');
  fs.writeFileSync(`${dir}/20-${t.replace(/ /g,'_')}.txt`, txt);
  console.log(t, 'textlen', txt.length);
}
await p.click('.console-tabs button:has-text("Problems")').catch(()=>{});
console.log('problems:', await p.locator('[data-testid=problems]').innerText().catch(() => 'n/a'));
await b.close();
