import { open, OUT, runSim, stop, problems } from './max-maker-lib.mjs';
const { b, p, errs } = await open();
await p.fill('.hero-input textarea', 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
await p.click('button.primary.big');
await p.waitForSelector('.part', { timeout: 30000 });
await p.waitForTimeout(2000);
async function proj() { return p.evaluate(() => { const id = localStorage.getItem('sparkbench.current.v1'); return JSON.parse(localStorage.getItem('sparkbench.projects.v1'))[id]; }); }
const steps = ['add a buzzer', 'use a Raspberry Pi Pico instead', 'remove the buzzer', 'add two more LEDs'];
let i = 4;
for (const s of steps) {
  const before = (await p.locator('.ds-msg-bubble').count());
  await p.fill('.composer textarea', s);
  await p.press('.composer textarea', 'Enter');
  await p.waitForFunction(n => document.querySelectorAll('.ds-msg-bubble').length >= n + 2, before, { timeout: 30000 }).catch(() => console.log('no reply?'));
  await p.waitForTimeout(2500);
  const msgs = await p.locator('.ds-msg-bubble').allInnerTexts();
  console.log('\n===== STEP:', s);
  console.log('REPLY:', msgs[msgs.length - 1]);
  const pr = await proj();
  console.log('BOARD', pr.board, 'NAME', pr.name);
  console.log('PARTS', pr.parts.map(x => x.id + '(' + x.type + ')').join(', '));
  console.log('FEATURES', JSON.stringify(pr.features?.map(f => [f.label, f.pins])));
  console.log('WIRES', pr.wires.map(w => `${w.a.part}:${w.a.pin}-${w.b.part}:${w.b.pin}`).join(' '));
  await p.screenshot({ path: OUT + `${String(i).padStart(2,'0')}-${s.replace(/\W+/g,'_')}.png` });
  const serial = await runSim(p, 4000);
  console.log('SERIAL:', serial);
  await p.screenshot({ path: OUT + `${String(i).padStart(2,'0')}b-${s.replace(/\W+/g,'_')}-run.png` });
  await stop(p);
  console.log('PROBLEMS:', await problems(p));
  i++;
}
const pr = await proj();
console.log('MAIN.PY\n', pr.files['main.py']);
console.log('FILES', Object.keys(pr.files));
console.log('ERRS', errs);
await b.close();
