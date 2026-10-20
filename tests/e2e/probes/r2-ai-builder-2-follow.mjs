import * as L from './r2-ai-builder-2-lib.mjs';
const [prof, followup, codeReq] = process.argv.slice(2);
const { ctx, p, errs } = await L.open('http://localhost:5173/?notour', prof);
console.log('STATE0', JSON.stringify(await L.state(p)));
if (followup && followup !== '-') {
  const t0 = Date.now();
  const r = await L.chat(p, followup);
  console.log('FOLLOWUP secs', (Date.now()-t0)/1000, '\nREPLY\n', r);
  await L.shot(p, prof + '-20-followup');
  console.log('STATE1', JSON.stringify(await L.state(p)));
  console.log('PROBLEMS\n', await L.problems(p));
  await L.run(p); await p.waitForTimeout(6000);
  await L.shot(p, prof + '-21-followup-run');
  console.log('SERIAL\n', await L.serial(p));
  console.log('SIMCTL\n', await L.simctl(p));
  await L.stop(p);
}
if (codeReq && codeReq !== '-') {
  const r = await L.codeAssist(p, codeReq);
  console.log('CODEASSIST secs', r.secs, '\n', r.text.slice(0, 3000));
  await L.shot(p, prof + '-30-proposal');
  const acc = p.locator('[data-testid=ai-proposal] button', { hasText: /Accept/ });
  if (await acc.count()) {
    await acc.first().click(); await p.waitForTimeout(7000);
    await L.shot(p, prof + '-31-accepted');
    console.log('SERIAL after accept\n', await L.serial(p));
    console.log('PROBLEMS\n', await L.problems(p));
    console.log('CODE\n', await L.code(p));
  } else console.log('NO ACCEPT BUTTON');
}
console.log('ERRS', errs.join('\n'));
await ctx.close();
