// Probe: is real-time pacing right in the browser? node tests/e2e/probes/pace.mjs <example> [--shot]
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:5173/?example=' + (process.argv[2] || '555-blinker') + '&notour');
await p.waitForSelector('.part');
await p.waitForTimeout(900);
if (process.argv.includes('--shot')) await p.screenshot({ path: '/tmp/x.png' });
const t0 = Date.now();
await p.click('button.run');
for (let i = 0; i < 4; i++) { await p.waitForTimeout(1000); console.log(((Date.now() - t0) / 1000).toFixed(1), 's wall →', await p.textContent('.sim-time')); }
await b.close();
