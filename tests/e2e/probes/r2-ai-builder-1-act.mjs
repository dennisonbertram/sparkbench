// node r2-ai-builder-1-act.mjs <proj> '<json actions>'
// actions: ["run"], ["stop"], ["wait",ms], ["shot",name], ["press",partId,holdMs], ["down",partId], ["up",partId],
// ["slider", ariaLabelRegex, value], ["serial"], ["tab",name], ["ctab",name], ["text", selector], ["eval", js], ["click", selector], ["chat", text], ["visual"]
import { open, info, chat, serial, tab, consoleTab, waitAI } from './r2-ai-builder-1-lib.mjs';
import fs from 'fs';
const [proj, json, url] = process.argv.slice(2);
const acts = JSON.parse(json);
const { p, shot, close, dir } = await open(proj, url);
for (const a of acts) {
  const [k, x, y] = a;
  try {
  if (k === 'run') { await p.click('button.run'); await p.waitForTimeout(500); }
  else if (k === 'stop') { if (/stop/i.test(await p.locator('button.run').innerText())) await p.click('button.run'); }
  else if (k === 'wait') await p.waitForTimeout(x);
  else if (k === 'shot') await shot(x);
  else if (k === 'info') console.log('INFO', JSON.stringify(await info(p), null, 1));
  else if (k === 'press' || k === 'down' || k === 'up') {
    const el = p.locator(`.part[data-part="${x}"]`).first();
    const bb = await el.boundingBox();
    // try the wokwi element inside
    const inner = await p.evaluate((id) => { const e = document.querySelector(`.part[data-part="${id}"]`); const w = e && e.querySelector('*'); const t=[...e.querySelectorAll('*')].find(n=>n.tagName.includes('-')); return t ? t.tagName : null; }, x);
    if (k !== 'up') await p.evaluate((id) => { const e = document.querySelector(`.part[data-part="${id}"]`); const t=[...e.querySelectorAll('*')].find(n=>n.tagName.includes('-')); t.dispatchEvent(new Event('button-press')); }, x);
    if (k === 'press') { await p.waitForTimeout(y ?? 300); }
    if (k !== 'down') await p.evaluate((id) => { const e = document.querySelector(`.part[data-part="${id}"]`); const t=[...e.querySelectorAll('*')].find(n=>n.tagName.includes('-')); t.dispatchEvent(new Event('button-release')); }, x);
  }
  else if (k === 'slider') {
    const s = p.locator('.simctl input[type=range]').filter({ has: p.locator('xpath=.') });
    const all = p.locator('.simctl input[type=range]');
    const n = await all.count(); let done = false;
    for (let i = 0; i < n; i++) { const l = await all.nth(i).getAttribute('aria-label'); if (new RegExp(x, 'i').test(l)) { await all.nth(i).fill(String(y)); done = true; console.log('slider', l, '=', y); break; } }
    if (!done) console.log('NO SLIDER', x, 'labels:', await all.evaluateAll(es => es.map(e => e.getAttribute('aria-label'))));
  }
  else if (k === 'serial') console.log('SERIAL>>>\n' + await serial(p) + '\n<<<');
  else if (k === 'tab') await tab(p, x);
  else if (k === 'ctab') await consoleTab(p, x);
  else if (k === 'text') { const t = await p.locator(x).first().innerText().catch(e => 'ERR ' + e.message); console.log('TEXT', x, '>>>\n' + t + '\n<<<'); if (y) fs.writeFileSync(dir + y, t); }
  else if (k === 'eval') console.log('EVAL', JSON.stringify(await p.evaluate(x)));
  else if (k === 'click') { await p.locator(x).first().click(); await p.waitForTimeout(500); }
  else if (k === 'chat') {
    const n = await p.locator('.msg.ai:not(.pending)').count();
    await p.fill('.composer textarea', x); await p.press('.composer textarea', 'Enter');
    await p.waitForTimeout(3000); await shot('chat-pending');
    await waitAI(p, n); await p.waitForTimeout(3000);
    console.log('CHAT>>>\n' + (await chat(p)) + '\n<<<');
  }
  else if (k === 'assist') {
    await tab(p, 'Code');
    const box = p.locator('[data-testid=code-assistant] textarea');
    await box.fill(x);
    await p.locator('[data-testid=code-assistant] button[type=submit]').click();
    const t0 = Date.now();
    await p.waitForTimeout(3000); await shot('assist-busy');
    await p.waitForSelector('[data-testid=ai-proposal], [data-testid=composer-error]', { timeout: 300000 });
    console.log('assist took', Date.now() - t0);
    await shot('assist-proposal');
    console.log('PROPOSAL>>>\n' + await p.locator('[data-testid=ai-proposal], [data-testid=composer-error]').first().innerText() + '\n<<<');
  }
  else if (k === 'accept') { await p.locator('[data-testid=ai-proposal] button', { hasText: 'Accept' }).click(); await p.waitForTimeout(1500); }
  } catch (e) { console.log('ACTION FAILED', JSON.stringify(a), e.message.slice(0, 500)); await shot('err-' + k); }
}
await close();
