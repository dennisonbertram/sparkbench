// usage: node tests/e2e/probes/builder-edge-run.mjs <name> "<welcome prompt>" ["<follow-up>" ...]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [name, first, ...follow] = process.argv.slice(2);
const dir = 'test-results/qa/builder-edge';
mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
await p.goto('http://localhost:5173/?welcome&notour');
await p.waitForTimeout(800);

async function waitDone(maxS = 300) {
  for (let i = 0; i < maxS; i++) {
    await p.waitForTimeout(1000);
    const pend = await p.locator('.msg.pending').count();
    if (!pend && i > 1) return i;
  }
  return -1;
}
async function dump(tag) {
  const t = await waitDone();
  await p.waitForTimeout(1500);
  const msgs = await p.locator('.msg').evaluateAll((els) => els.map((e) => e.className + ' :: ' + e.innerText.replace(/\s+/g, ' ').slice(0, 1500)));
  const parts = await p.locator('.part').evaluateAll((els) => els.map((e) => e.getAttribute('data-part')));
  const title = await p.locator('header, .topbar').first().innerText().catch(() => '');
  await p.screenshot({ path: `${dir}/${name}-${tag}.png` });
  let probs = '';
  try {
    const pt = p.locator('.console-tabs button', { hasText: 'Problems' });
    if (await pt.count()) { await pt.first().click(); await p.waitForTimeout(300); probs = (await p.locator('[data-testid=problems]').innerText()).replace(/\s+/g, ' ').slice(0, 800); }
  } catch {}
  console.log(JSON.stringify({ tag, waitedS: t, title: title.replace(/\s+/g, ' ').slice(0, 200), parts, problems: probs, msgs: msgs.slice(-2) }, null, 1));
}

if (first !== undefined) {
  await p.fill('.hero-input textarea', first);
  const btn = p.locator('button.primary.big');
  console.log('designBtnDisabled', await btn.isDisabled());
  if (!(await btn.isDisabled())) await btn.click();
  else await p.keyboard.press('Enter').catch(() => {});
  let w = 0;
  for (; w < 300; w++) {
    await p.waitForTimeout(1000);
    if (w === 5) await p.screenshot({ path: `${dir}/${name}-welcome-5s.png` });
    if (await p.locator('.composer textarea').count()) break;
  }
  console.log('welcome->workspace after s', w);
  if (!(await p.locator('.composer textarea').count())) {
    await p.screenshot({ path: `${dir}/${name}-welcome.png` });
    console.log('still on welcome; body:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600));
  } else await dump('0');
}
let i = 1;
for (const f of follow) {
  await p.fill('.composer textarea', f);
  await p.press('.composer textarea', 'Enter');
  await p.waitForTimeout(1000);
  await dump(String(i++));
}
console.log('errors', errs.slice(0, 10));
await b.close();
