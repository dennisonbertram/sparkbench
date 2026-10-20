// E2E: "Your board" panel against a fake USB board (Web Serial + MicroPython raw REPL protocol):
// connect, copy the program, run the self-test (compared with the simulator), multimeter guide,
// and, when Claude is available, "Ask AI what is wrong" on a faulty self-test.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const fake = readFileSync(new URL('./fake-board.js', import.meta.url), 'utf8');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(fake);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:5173/?example=esp32-weather-imu&notour');
await p.waitForSelector('.part');
await p.click('[data-testid=board-open]');
await p.click('[data-testid=board-connect]');
await p.waitForSelector('[data-testid=board-info]');
console.log('info:', await p.textContent('[data-testid=board-info]'));
await p.click('[data-testid=board-copy]');
await p.waitForFunction(() => document.querySelector('[data-testid=board-monitor]').textContent.includes('soft reboot'), null, { timeout: 60000 });
const files = await p.evaluate(() => Object.fromEntries(Object.entries(window.__fakeBoardFiles).map(([k, v]) => [k, v.length])));
console.log('files on board:', files);
await p.click('[data-testid=board-selftest]');
await p.waitForFunction(() => /all automatic checks passed|problem/.test(document.querySelector('[data-testid=selftest-results] h3')?.textContent ?? ''), null, { timeout: 90000 });
const st = await p.textContent('[data-testid=selftest-results]');
const filesAfter = await p.evaluate(() => Object.fromEntries(Object.entries(window.__fakeBoardFiles).map(([k, v]) => [k, v.length])));
console.log('files after self-test:', filesAfter);
console.log('self-test:', st.replace(/\s+/g, ' ').slice(0, 400));
await p.screenshot({ path: 'test-results/board-selftest.png' });
await p.click('[data-testid=multimeter] summary');
await p.waitForFunction(() => document.querySelectorAll('[data-testid=multimeter] li').length > 0, null, { timeout: 30000 });
console.log('multimeter:', (await p.textContent('[data-testid=multimeter] li')).replace(/\s+/g, ' ').slice(0, 200));
let aiOk = true;
if (process.argv.includes('--ai')) {
  // A faulty board: OLED doesn't answer. Ask the AI.
  await p.evaluate(() => (window.__selftestOverride = "SELFTEST START: x\nINFO I2C: devices at 0x68\nFAIL OLED display: no reply at 0x3c: check SDA (D21) and SCL (D22) are not swapped, and its VCC/GND\nPASS IMU: answers on I2C at 0x68\nSELFTEST DONE: 1 passed, 1 failed, 0 to check by eye\n"));
  await p.click('[data-testid=board-selftest]');
  await p.waitForFunction(() => /problem/.test(document.querySelector('[data-testid=selftest-results] h3')?.textContent ?? ''), null, { timeout: 90000 });
  await p.fill('.bp-debug textarea', 'the screen stays black');
  await p.click('[data-testid=board-ask]');
  await p.waitForSelector('[data-testid=board-answer]', { timeout: 240000 });
  const ans = await p.textContent('[data-testid=board-answer]');
  console.log('AI:', ans.replace(/\s+/g, ' ').slice(0, 600));
  aiOk = /SDA|SCL|swap/i.test(ans);
  await p.screenshot({ path: 'test-results/board-ai.png' });
}
console.log('errors:', errors);
await b.close();
const pass = /all automatic checks passed/.test(st) && files['main.py'] > 100 && filesAfter['selftest.py'] > 100 && !/In the simulator/.test(st) && aiOk && !errors.length;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
