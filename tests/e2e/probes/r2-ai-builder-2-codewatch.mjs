import * as L from './r2-ai-builder-2-lib.mjs';
const [prof, req] = process.argv.slice(2);
const { ctx, p, errs } = await L.open('http://localhost:5173/?notour', prof);
await L.tab(p, 'Code');
await L.shot(p, prof + '-50-codetab');
const ca = p.locator('[data-testid=code-assistant]');
console.log('assistant count', await ca.count());
await ca.locator('textarea').fill(req);
await ca.locator('button[type=submit]').click();
const t0 = Date.now();
for (let i = 0; i < 60; i++) {
  await p.waitForTimeout(5000);
  const s = { t: (Date.now()-t0)/1000, ca: await ca.count(), prop: await p.locator('[data-testid=ai-proposal]').count(), tab: await p.locator('.tabs button[aria-selected=true], .tabs button.active').innerText().catch(()=>'?') };
  console.log(JSON.stringify(s));
  if (i % 6 === 1) await L.shot(p, prof + '-51-wait' + i);
  if (s.prop) break;
}
await L.shot(p, prof + '-52-end');
console.log((await p.locator('body').innerText()).slice(0, 4000));
const acc = p.locator('[data-testid=ai-proposal] button', { hasText: /Accept/ });
if (await acc.count()) { await acc.first().click(); await p.waitForTimeout(8000); await L.shot(p, prof + '-53-accepted'); console.log('SERIAL\n', await L.serial(p)); }
console.log('ERRS', errs.join('\n'));
await ctx.close();
