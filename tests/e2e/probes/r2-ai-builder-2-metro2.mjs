import * as L from './r2-ai-builder-2-lib.mjs';
const { ctx, p, errs } = await L.open('http://localhost:5173/?notour', 'metro');
await L.run(p); await p.waitForTimeout(1000);
await L.consoleTab(p, /pins/i);
const seen = {}; let shotTaken = false;
for (let i = 0; i < 150; i++) {
  const t = await p.evaluate(() => [...document.querySelectorAll('tr')].map(r => r.innerText.replace(/\s+/g,' ')).filter(s => /GP2 |GP3 /.test(s)).join(' | '));
  seen[t] = (seen[t]||0)+1;
  if (!shotTaken && /GP3 GPIO3 pwm HIGH|GP3 GPIO3 pwm \w+ [1-9]/.test(t)) { await L.shot(p, 'metro-12-ledon'); shotTaken = true; }
  await p.waitForTimeout(20);
}
console.log(seen);
console.log('ERRS', errs.join('\n'));
await ctx.close();
