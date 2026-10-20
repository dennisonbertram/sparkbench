import { chromium } from 'playwright';
import fs from 'fs';
const [slug] = process.argv.slice(2);
const dir = `test-results/qa/verify-docs/${slug}`;
fs.mkdirSync(dir, { recursive: true });
const ai = JSON.parse(fs.readFileSync(`test-results/qa/builder-pico-pi/${slug}/ai.json`, 'utf8'));
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:5173/?notour');
await p.evaluate((proj) => { localStorage.setItem('sparkbench.projects.v1', JSON.stringify({ [proj.id]: proj })); localStorage.setItem('sparkbench.current.v1', proj.id); }, ai.project);
await p.goto('http://localhost:5173/?notour');
await p.waitForSelector('.part', { timeout: 30000 });
await p.waitForTimeout(2000);
const out = { codeCustom: ai.project.codeCustom };
for (const t of ['Code', 'Build guide', 'Blog post']) {
  await p.locator('.tabs button', { hasText: t }).first().click();
  await p.waitForTimeout(1500);
  out[t] = await p.locator('[data-testid^=doc-], .cm-content').first().innerText().catch(() => '');
  if (t !== 'Code') {
    const h = p.locator(`text=${t === 'Blog post' ? 'What it does' : 'Test it'}`).first();
    await h.scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(400);
  }
  await p.screenshot({ path: `${dir}/${t.replace(/ /g, '_')}.png` });
}
fs.writeFileSync(`${dir}/out.json`, JSON.stringify(out, null, 1));
const blog = out['Blog post'], g = out['Build guide'];
console.log('codeCustom', out.codeCustom);
console.log('BLOG', (blog.match(/What it does[\s\S]{0,600}/) || [''])[0]);
console.log('GUIDE', (g.match(/Test it[\s\S]{0,600}/) || [''])[0]);
console.log('csv guide', g.toLowerCase().split('csv').length - 1, 'csv blog', blog.toLowerCase().split('csv').length - 1);
await b.close();
