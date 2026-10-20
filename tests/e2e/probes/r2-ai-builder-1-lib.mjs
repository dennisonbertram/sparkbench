import { chromium } from 'playwright';
import fs from 'fs';
export const ROOT = 'test-results/qa2/ai-builder-1/';
export async function open(proj, url = 'http://localhost:5173/?notour') {
  const dir = ROOT + proj + '/';
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(ROOT + 'profile-' + proj, { viewport: { width: 1440, height: 900 } });
  const p = ctx.pages()[0] || await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(url);
  await p.waitForTimeout(1500);
  let n = 0;
  const shot = async (name) => { const f = dir + name + '.png'; await p.screenshot({ path: f }); console.log('SHOT', f); };
  const close = async () => { fs.appendFileSync(dir + 'errors.txt', errs.join('\n') + '\n'); console.log('ERRS', errs.join('\n').slice(0, 3000)); await ctx.close(); };
  return { ctx, p, errs, dir, shot, close };
}
export async function info(p) {
  return p.evaluate(() => ({
    title: document.title,
    header: document.querySelector('header')?.innerText,
    parts: [...document.querySelectorAll('.part[data-part]')].map(e => e.getAttribute('data-part')),
    simctl: document.querySelector('.simctl')?.innerText,
  }));
}
export async function serial(p) { return p.evaluate(() => document.querySelector('[data-testid=serial]')?.innerText); }
export async function consoleTab(p, name) { await p.locator('.console-tabs button', { hasText: name }).first().click(); await p.waitForTimeout(400); }
export async function tab(p, name) { await p.locator('.tabs button', { hasText: name }).first().click(); await p.waitForTimeout(800); }
export async function chat(p) { return p.evaluate(() => [...document.querySelectorAll('.msg')].map(m => (m.className.includes('ai') ? 'AI: ' : 'ME: ') + m.innerText).join('\n---\n')); }
export async function waitAI(p, prevCount, timeout = 240000) {
  const t0 = Date.now();
  await p.waitForFunction((n) => document.querySelectorAll('.msg.ai:not(.pending)').length > n && !document.querySelector('.msg.pending'), prevCount, { timeout });
  console.log('AI took', Date.now() - t0);
}
