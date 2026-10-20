import { open, OUT, tab } from './max-maker-lib.mjs';
const { b, p } = await open();
await p.fill('.hero-input textarea', 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
await p.click('button.primary.big');
await p.waitForSelector('.part', { timeout: 30000 }); await p.waitForTimeout(1500);
async function proj() { return p.evaluate(() => { const id = localStorage.getItem('sparkbench.current.v1'); return JSON.parse(localStorage.getItem('sparkbench.projects.v1'))[id]; }); }
await tab(p, 'Code');
const l = p.locator('.cm-line', { hasText: 'import dht' }).first();
await l.click(); await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.keyboard.type('x = 1');
await p.waitForTimeout(300);
const pr = await proj();
console.log(JSON.stringify(pr.files['main.py'].split('\n').slice(10, 22)));
await b.close();
