// builder-esp32 probe: node tests/e2e/probes/builder-esp32-act.mjs <label> "<prompt>" '<actions json>' [--tabs]
// actions: {slider:"aria label", value:n, nth?:0} | {press:"css selector", hold:ms} | {wait:ms} | {shot:"name"} | {serial:"name"} | {eval:"js"}
import { chromium } from 'playwright';
import fs from 'fs';
const [label, prompt, actionsJson] = process.argv.slice(2);
const tabs = process.argv.includes('--tabs');
const actions = JSON.parse(actionsJson || '[]');
const dir = `test-results/qa/builder-esp32/${label}`;
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
await p.goto('http://localhost:5173/?welcome&notour');
await p.waitForSelector('.hero-input textarea');
await p.fill('.hero-input textarea', prompt);
await p.click('button.primary.big');
await p.waitForSelector('.part', { timeout: 30000 });
await p.waitForTimeout(1500);
await p.click('button.run');
await p.waitForTimeout(2500);
const ser = () => p.evaluate(() => document.querySelector('[data-testid=serial]')?.innerText);
for (const a of actions) {
  if (a.slider) { await p.locator(`input[aria-label="${a.slider}"]`).nth(a.nth || 0).fill(String(a.value)); }
  else if (a.press) { const l = p.locator(a.press).first(); const bb = await l.boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(a.hold || 200); await p.mouse.up(); }
  else if (a.wait) await p.waitForTimeout(a.wait);
  else if (a.shot) await p.screenshot({ path: `${dir}/${a.shot}.png` });
  else if (a.serial) { const s = await ser(); fs.writeFileSync(`${dir}/serial-${a.serial}.txt`, s || ''); console.log('--- serial', a.serial, '\n' + (s || '').split('\n').slice(-8).join('\n')); }
  else if (a.eval) console.log('eval', await p.evaluate(a.eval));
}
if (tabs) {
  await p.click('button.run').catch(() => {});
  for (const t of ['Schematic', 'Code', 'Parts list', 'Build guide', 'Blog post']) {
    await p.click(`.tabs button:has-text("${t}")`);
    await p.waitForTimeout(1200);
    const slug = t.replace(/\s/g, '').toLowerCase();
    await p.screenshot({ path: `${dir}/tab-${slug}.png` });
    const txt = await p.evaluate(() => { const m = document.querySelector('main, .center, .workspace') || document.body; return m.innerText; });
    fs.writeFileSync(`${dir}/tab-${slug}.txt`, txt);
  }
}
fs.writeFileSync(`${dir}/errors.txt`, errs.join('\n'));
console.log('ERRS', errs.join('\n'));
await b.close();
