import { chromium } from 'playwright';
export const OUT = 'test-results/qa/max-maker/';
export async function open(url = 'http://localhost:5173/?welcome&notour') {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.type()+': '+m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(url);
  return { b, ctx, p, errs };
}
export async function state(p) {
  return p.evaluate(() => {
    const parts = [...document.querySelectorAll('.part[data-part]')].map(e => e.getAttribute('data-part'));
    const wires = document.querySelectorAll('.wire, [data-wire], path.wire').length;
    return { parts, wires };
  });
}
export async function lastCopilot(p) {
  return p.evaluate(() => { const ms = [...document.querySelectorAll('.msg, .message, .chat .bubble, .copilot .msg')]; return ms.slice(-1).map(m => m.innerText).join('\n'); });
}
export async function runSim(p, ms = 3000) {
  const run = p.locator('button.run');
  await run.click();
  await p.waitForTimeout(ms);
  const serial = await p.locator('[data-testid=serial]').innerText().catch(e => 'ERR ' + e.message);
  return serial;
}
export async function stop(p) { const t = await p.locator('button.run').innerText(); if (/stop/i.test(t)) await p.locator('button.run').click(); }
export async function problems(p) {
  const tabs = p.locator('.console-tabs button');
  const n = await tabs.count();
  for (let i = 0; i < n; i++) { const t = await tabs.nth(i).innerText(); if (/problem/i.test(t)) { await tabs.nth(i).click(); break; } }
  await p.waitForTimeout(300);
  const t = await p.locator('[data-testid=problems]').innerText().catch(e => 'ERR ' + e.message);
  for (let i = 0; i < n; i++) { const t = await tabs.nth(i).innerText(); if (/serial/i.test(t)) { await tabs.nth(i).click(); break; } }
  return t;
}
export async function tab(p, name) { await p.locator('.tabs button', { hasText: name }).first().click(); await p.waitForTimeout(500); }
