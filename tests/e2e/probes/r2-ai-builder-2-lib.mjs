import { chromium } from 'playwright';
export const OUT = 'test-results/qa2/ai-builder-2/';
export async function open(url = 'http://localhost:5173/?welcome&notour', profile = 'p1') {
  const ctx = await chromium.launchPersistentContext('/private/tmp/claude-501/-Users-dennison-develop-vibe-engineering/c9dc0bdd-ce06-4082-afa6-e5afdf2b604e/scratchpad/prof-' + profile, { viewport: { width: 1440, height: 900 } });
  const p = ctx.pages()[0] || await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.type()+': '+m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(url);
  await p.waitForTimeout(1500);
  return { ctx, p, errs };
}
export const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });
export async function design(p, prompt, maxS = 240) {
  await p.fill('.hero-input textarea', prompt);
  await p.click('.hero-input button');
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxS) {
    await p.waitForTimeout(3000);
    const n = await p.locator('.part[data-part]').count();
    const hero = await p.locator('.hero-input').count();
    if (n && !hero) break;
  }
  await p.waitForTimeout(2000);
  return (Date.now() - t0) / 1000;
}
export async function chat(p, msg, maxS = 240) {
  const before = await p.locator('.msg.ai:not(.pending)').count();
  await p.fill('.composer textarea', msg);
  await p.press('.composer textarea', 'Enter');
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxS) {
    await p.waitForTimeout(3000);
    const n = await p.locator('.msg.ai:not(.pending)').count();
    const pend = await p.locator('.msg.ai.pending').count();
    if (n > before && !pend) break;
  }
  await p.waitForTimeout(2000);
  return p.evaluate(() => { const m = [...document.querySelectorAll('.msg.ai:not(.pending)')]; return m[m.length-1]?.innerText; });
}
export async function allMsgs(p) { return p.evaluate(() => [...document.querySelectorAll('.msg')].map(m => m.className + ' :: ' + m.innerText).join('\n---\n')); }
export async function state(p) {
  return p.evaluate(() => ({ parts: [...document.querySelectorAll('.part[data-part]')].map(e => e.getAttribute('data-part')), pins: [...document.querySelectorAll('circle.pin[data-pin]')].length }));
}
export async function consoleTab(p, re) { const tabs = p.locator('.console-tabs button'); const n = await tabs.count(); for (let i = 0; i < n; i++) { if (re.test(await tabs.nth(i).innerText())) { await tabs.nth(i).click(); break; } } await p.waitForTimeout(300); }
export async function serial(p) { await consoleTab(p, /serial/i); return p.locator('[data-testid=serial]').innerText().catch(e => 'ERR ' + e.message); }
export async function problems(p) { await consoleTab(p, /problem/i); const t = await p.locator('[data-testid=problems]').innerText().catch(e => 'ERR ' + e.message); await consoleTab(p, /serial/i); return t; }
export async function run(p) { const t = await p.locator('button.run').innerText(); if (!/stop/i.test(t)) await p.locator('button.run').click(); }
export async function stop(p) { const t = await p.locator('button.run').innerText(); if (/stop/i.test(t)) await p.locator('button.run').click(); }
export async function tab(p, name) { await p.locator('.tabs button', { hasText: name }).first().click(); await p.waitForTimeout(700); }
export async function simctl(p) { return p.evaluate(() => [...document.querySelectorAll('.simctl')].map(e => e.outerHTML.slice(0, 600)).join('\n')); }
export async function code(p) { await tab(p, 'Code'); return p.evaluate(() => { const e = document.querySelector('.cm-content'); return e ? e.innerText : document.querySelector('[data-testid=code-editor], textarea')?.value; }); }
export async function codeAssist(p, msg, maxS = 240) {
  await tab(p, 'Code');
  const ca = p.locator('[data-testid=code-assistant]');
  await ca.locator('textarea').fill(msg);
  await ca.locator("button[type=submit]").click();
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxS) {
    await p.waitForTimeout(3000);
    if (await p.locator('[data-testid=ai-proposal]').count()) break;
  }
  await p.waitForTimeout(1000);
  return { secs: (Date.now() - t0)/1000, text: await p.locator('[data-testid=code-assistant]').innerText() };
}
