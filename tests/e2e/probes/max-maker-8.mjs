import { open } from './max-maker-lib.mjs';
const { b, p } = await open('http://localhost:5173/?example=pico-mood-lamp&notour');
await p.waitForSelector('.part'); await p.waitForTimeout(1000);
for (const sp of ['5', '2', '0.25']) {
  await p.selectOption('select[aria-label="Simulation speed"]', sp);
  await p.click('button.run'); await p.waitForTimeout(3000);
  const t0 = Date.now(); const s0 = parseFloat(await p.locator('.sim-time').innerText());
  await p.waitForTimeout(3000);
  const s1 = parseFloat(await p.locator('.sim-time').innerText());
  console.log('speed', sp, 'ratio', ((s1 - s0) / ((Date.now() - t0) / 1000)).toFixed(2));
  await p.click('button.run'); await p.waitForTimeout(300);
}
await p.click('button.run'); await p.waitForTimeout(2500);
await p.selectOption('select[aria-label="Simulation speed"]', '5');
const t0 = Date.now(); const s0 = parseFloat(await p.locator('.sim-time').innerText());
await p.waitForTimeout(3000);
console.log('change while running 1->5 ratio', ((parseFloat(await p.locator('.sim-time').innerText()) - s0) / ((Date.now() - t0) / 1000)).toFixed(2));
await b.close();
