import { open, OUT, tab } from './r3-regression-lib.mjs';
const ex = process.argv[2] || 'pico-traffic-light';
const ask = process.argv[3] || 'make the green light stay on for 10 seconds instead and add a short yellow flash 3 times before red';
const {b,p} = await open(`?example=${ex}&notour`);
const grab = async (tag) => { await tab(p,'Blog post'); await p.waitForTimeout(1000); const t = await p.locator('body').innerText(); const i = t.indexOf('What it does'); console.log('--', tag, '\n', t.slice(i, i + 900)); await p.screenshot({ path: OUT + 'code-'+ex+'-' + tag + '.png' }); };
await grab('fresh');
await tab(p,'Code'); await p.waitForTimeout(800);
const ca = p.locator('[data-testid=code-assistant]');
await ca.locator('textarea').fill(ask);
await ca.locator('button[type=submit]').click();
const t0 = Date.now();
while (Date.now() - t0 < 240000) { await p.waitForTimeout(3000); if (await p.locator('[data-testid=ai-proposal]').count()) break; }
await p.waitForTimeout(1000);
console.log('PROPOSAL secs', (Date.now()-t0)/1000, (await ca.innerText()).slice(0, 600));
await p.locator('[data-testid=ai-proposal] button', { hasText: /Accept/ }).first().click();
await p.waitForTimeout(6000);
await grab('after-accept');
await b.close();
