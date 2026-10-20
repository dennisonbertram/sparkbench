import * as L from './r2-ai-builder-2-lib.mjs';
const { ctx, p, errs } = await L.open('http://localhost:5173/?notour', 'dice');
await L.run(p); await p.waitForTimeout(2000);
const btn = p.locator('.momentary').first();
for (let r = 0; r < 3; r++) {
  await btn.hover(); await p.mouse.down(); await p.waitForTimeout(150); await p.mouse.up();
  await p.waitForTimeout(400); await L.shot(p, 'dice-40-rolling' + r);
  await p.waitForTimeout(2500); await L.shot(p, 'dice-41-rolled' + r);
}
console.log('SERIAL\n', await L.serial(p));
await L.consoleTab(p, /pins/i);
console.log(await p.evaluate(() => [...document.querySelectorAll('tr')].map(r => r.innerText.replace(/\s+/g,' ')).join('\n')));
await p.locator('button', { hasText: /^Fit$/ }).click(); await p.waitForTimeout(800);
await L.shot(p, 'dice-42-fit');
console.log('ERRS', errs.join('\n'));
await ctx.close();
