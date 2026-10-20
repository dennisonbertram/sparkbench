import { chromium } from 'playwright';
import fs from 'fs';
const dir = 'test-results/qa/builder-pico-pi/weather';
const ai = JSON.parse(fs.readFileSync(`${dir}/ai.json`, 'utf8'));
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://localhost:5173/?notour');
await p.evaluate((proj) => { localStorage.setItem('sparkbench.projects.v1', JSON.stringify({ [proj.id]: proj })); localStorage.setItem('sparkbench.current.v1', proj.id); }, ai.project);
await p.goto('http://localhost:5173/?notour');
await p.waitForSelector('.part');
const opts = await p.$$eval('header select option', (o) => o.map((x) => x.value + ':' + x.textContent));
console.log('speed options', opts);
await p.selectOption('header select', { index: opts.length - 1 });
await p.click('button.run');
for (let i = 0; i < 40; i++) { await p.waitForTimeout(2000); const t = await p.textContent('.sim-time').catch(() => ''); if (parseFloat(t) > 70) break; }
console.log(await p.textContent('.sim-time'));
console.log(await p.locator('[data-testid=serial]').innerText());
await p.screenshot({ path: `${dir}/30-after-70s.png` });
await b.close();
