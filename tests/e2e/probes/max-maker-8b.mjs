import { open, OUT } from './max-maker-lib.mjs';
const { b, p } = await open('http://localhost:5173/?example=pico-mood-lamp&notour');
await p.waitForSelector('.part'); await p.waitForTimeout(1000);
await p.selectOption('select[aria-label="Simulation speed"]', '0.25');
await p.click('button.run');
for (let i = 0; i < 6; i++) { await p.waitForTimeout(1000); console.log(i, await p.locator('.status').innerText(), '|', await p.locator('.sim-time').innerText().catch(()=>'-')); }
await p.screenshot({ path: OUT + '55-quarter-speed.png' });
await p.selectOption('select[aria-label="Simulation speed"]', '5');
for (let i = 0; i < 4; i++) { await p.waitForTimeout(1000); console.log('5x', i, await p.locator('.status').innerText(), '|', await p.locator('.sim-time').innerText().catch(()=>'-')); }
await b.close();
