import { chromium } from 'playwright';
import fs from 'fs';
const [slug, prompt] = process.argv.slice(2);
const dir = `test-results/qa/verify-docs/${slug}`;
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('.hero-input textarea', prompt);
await p.click('button.primary.big');
await p.waitForSelector('.part', { timeout: 240000 });
await p.waitForTimeout(3000);
const out = {};
out.copilot = await p.locator('.copilot, .chat, aside').first().innerText().catch(() => '');
for (const t of ['Code', 'Build guide', 'Blog post']) {
  await p.locator('.tabs button', { hasText: t }).first().click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${dir}/${t.replace(/ /g, '_')}.png`, fullPage: false });
  out[t] = await p.locator('[data-testid^=doc-], .cm-content').first().innerText().catch(() => '');
}
fs.writeFileSync(`${dir}/out.json`, JSON.stringify(out, null, 1));
const blog = out['Blog post'], g = out['Build guide'];
console.log('COPILOT', out.copilot.slice(-600));
console.log('CODEHEAD', out.Code.slice(0, 900));
console.log('BLOG', (blog.match(/What it does[\s\S]{0,700}/) || [''])[0]);
console.log('GUIDE', (g.match(/Test it[\s\S]{0,700}/) || [''])[0]);
console.log('csv guide', g.toLowerCase().split('csv').length - 1, 'csv blog', blog.toLowerCase().split('csv').length - 1);
await b.close();
