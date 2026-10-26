import { open, OUT } from './max-maker-lib.mjs';
const { b, p, errs } = await open();
await p.fill('.hero-input textarea', 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
await p.click('button.primary.big');
await p.waitForSelector('.part', { timeout: 30000 });
await p.waitForTimeout(1500);
console.log('after design run btn:', await p.locator('button.run').innerText(), await p.locator('.sim-time').innerText().catch(()=>'-'));
async function proj() { return p.evaluate(() => { const id = localStorage.getItem('sparkbench.current.v1'); return JSON.parse(localStorage.getItem('sparkbench.projects.v1'))[id]; }); }
await p.fill('.composer textarea', 'add a buzzer'); await p.press('.composer textarea', 'Enter');
await p.waitForTimeout(3000);
console.log('after buzzer run btn:', await p.locator('button.run').innerText(), await p.locator('.sim-time').innerText().catch(()=>'-'));
const pr = await proj();
console.log(pr.files['main.py'].split('\n').filter(l => /buzz|beep|tone/i.test(l)).join('\n'));
await p.fill('.composer textarea', 'use a Raspberry Pi Pico instead'); await p.press('.composer textarea', 'Enter');
for (let i=0;i<5;i++){ await p.waitForTimeout(1000); console.log('pico t', i, await p.locator('button.run').innerText(), await p.locator('.sim-time').innerText().catch(()=>'-')); }
// copilot extras
for (const s of ['move button A to GP14', 'move the button to GPIO 14', 'remove the LED', 'add 40 potentiometers']) {
  await p.fill('.composer textarea', s); await p.press('.composer textarea', 'Enter');
  await p.waitForTimeout(2500);
  const m = await p.locator('.ds-msg-bubble').allInnerTexts();
  const pr2 = await proj();
  console.log('\n>>', s, '\n', m[m.length-1], '\nFEAT', JSON.stringify(pr2.features?.map(f => [f.label, f.pins])));
}
await p.screenshot({ path: OUT + '10-extras.png' });
await b.close();
