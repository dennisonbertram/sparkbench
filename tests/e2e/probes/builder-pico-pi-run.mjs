// node tests/e2e/probes/builder-pico-pi-run.mjs <slug> "<prompt>" [actions-json]
import { chromium } from 'playwright';
import fs from 'fs';
const [slug, prompt, actionsJson] = process.argv.slice(2);
const actions = actionsJson ? JSON.parse(actionsJson) : [];
const dir = `test-results/qa/builder-pico-pi/${slug}`;
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('.hero-input textarea, textarea.hero-input', prompt).catch(async () => { await p.fill('textarea', prompt); });
await p.click('button.primary.big');
try { await p.waitForSelector('.part', { timeout: 180000 }); } catch (e) { await p.screenshot({ path: `${dir}/00-timeout.png` }); console.log('TIMEOUT', await p.locator('body').innerText()); await b.close(); process.exit(1); }
await p.waitForTimeout(2500);
await p.screenshot({ path: `${dir}/01-breadboard.png` });
const out = {};
out.title = await p.title();
out.header = await p.locator('header').first().innerText().catch(() => '');
out.copilot = await p.locator('.copilot, .chat, aside').first().innerText().catch(() => '');
out.parts = await p.$$eval('.part', (els) => els.map((e) => e.getAttribute('data-part')));
out.problems = await p.locator('[data-testid=problems]').innerText().catch(() => '(not visible)');
// open problems tab
for (const t of await p.$$('.console-tabs button')) { const s = await t.innerText(); if (/Problems/i.test(s)) { await t.click(); out.problems = await p.locator('[data-testid=problems]').innerText().catch(() => ''); } }
for (const t of await p.$$('.console-tabs button')) { const s = await t.innerText(); if (/Serial/i.test(s)) await t.click(); }
await p.click('button.run');
await p.waitForTimeout(3000);
await p.screenshot({ path: `${dir}/02-running.png` });
out.simctl = await p.locator('.simctl').innerText().catch(() => '');
let i = 0;
for (const a of actions) {
  i++;
  if (a.press) {
    const btns = p.locator('.momentary');
    const n = await btns.count();
    out['momentary' + i] = await btns.allInnerTexts();
    if (n) { const bt = btns.nth(a.press - 1); await bt.hover(); await p.mouse.down(); await p.waitForTimeout(a.hold || 300); await p.screenshot({ path: `${dir}/03-action${i}-held.png` }); await p.mouse.up(); }
  }
  if (a.slider !== undefined) {
    const s = p.locator('.simctl input[type=range]').nth(a.slider);
    await s.evaluate((el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, a.value);
  }
  await p.waitForTimeout(a.wait || 1500);
  await p.screenshot({ path: `${dir}/03-action${i}.png` });
}
out.serial = await p.locator('[data-testid=serial]').innerText().catch(() => '');
await p.click('button.run');
const tabs = ['Schematic', 'Code', 'Parts list', 'Build guide', 'Blog post'];
for (const t of tabs) {
  await p.locator('.tabs button', { hasText: t }).first().click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${dir}/10-${t.replace(/ /g, '_')}.png` });
  if (t !== 'Schematic') out[t] = await p.locator('[data-testid^=doc-], [data-testid=bom], .cm-content').first().innerText().catch(() => '');
}
out.errs = errs;
fs.writeFileSync(`${dir}/out.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ title: out.title, parts: out.parts, problems: out.problems, simctl: out.simctl, serial: out.serial.slice(-1500), errs }, null, 1));
await b.close();
