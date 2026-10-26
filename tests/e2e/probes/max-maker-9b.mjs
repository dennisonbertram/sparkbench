import { open, OUT } from './max-maker-lib.mjs';
const { b, p, errs } = await open('http://localhost:5173/?example=esp32-weather-imu&notour');


await p.waitForSelector('.part', { timeout: 240000 });

console.log('badge', await p.locator('.ai-badge').innerText());
const t0 = Date.now();
await p.fill('.composer textarea', 'use a Raspberry Pi Pico instead'); await p.press('.composer textarea', 'Enter');
await p.waitForFunction(() => { const m=[...document.querySelectorAll('.ds-msg-bubble')]; return m.length >= 2 && !/designing/i.test(m[m.length-1].innerText); }, null, { timeout: 240000 }).catch(e => console.log('wait fail', e.message));
console.log('secs', (Date.now()-t0)/1000);
await p.waitForTimeout(1000);
await p.screenshot({ path: OUT + '61-claude-pico-from-example.png' });
console.log('BODY', (await p.evaluate(() => document.body.innerText)).slice(0, 2500));
console.log('ERRS', errs.join('\n'));
await b.close();
