import { open, OUT, problems, runSim, stop, tab } from './max-maker-lib.mjs';
const { b, p, errs } = await open();
await p.fill('.hero-input textarea', 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
await p.click('button.primary.big');
await p.waitForSelector('.part', { timeout: 30000 }); await p.waitForTimeout(1500);
async function proj() { return p.evaluate(() => { const id = localStorage.getItem('sparkbench.current.v1'); return JSON.parse(localStorage.getItem('sparkbench.projects.v1'))[id]; }); }
async function gotoLine(text) {
  await p.locator('.cm-content').click();
  await p.keyboard.press('Control+Home'); await p.keyboard.press('Meta+ArrowUp');
  for (let i = 0; i < 60; i++) {
    const l = p.locator('.cm-line', { hasText: text });
    if (await l.count()) { await l.first().scrollIntoViewIfNeeded(); await l.first().click(); return; }
    await p.evaluate(() => { document.querySelector('.cm-scroller').scrollTop += 300; }); await p.waitForTimeout(100);
  }
  throw new Error('line not found ' + text);
}
await tab(p, 'Code');
await p.screenshot({ path: OUT + '40-code.png' });
await gotoLine('was_shaking = shaking');
await p.keyboard.press('End'); await p.keyboard.press('Enter');
await p.keyboard.type('print(temprature)'); await p.keyboard.press('Home'); await p.keyboard.type('  ');
await p.waitForTimeout(500);
let pr = await proj(); console.log(JSON.stringify(pr.files['main.py'].split('\n').slice(84,92))); console.log('codeCustom', pr.codeCustom, pr.files['main.py'].includes('temprature'));
const serial = await runSim(p, 3000);
console.log('SERIAL after NameError:\n', serial);
await p.screenshot({ path: OUT + '41-nameerror.png' });
console.log('PROBLEMS:\n', await problems(p));
await p.screenshot({ path: OUT + '42-nameerror-problems.png' });
console.log('run btn:', await p.locator('button.run').innerText());
await stop(p);
// fix
await gotoLine('print(temprature)');
await p.keyboard.press('End');
for (let i = 0; i < 'temprature)'.length; i++) await p.keyboard.press('Backspace');
await p.keyboard.type('temp_c)');
await p.waitForTimeout(400);
console.log('SERIAL after fix:\n', await runSim(p, 3000));
await stop(p);
console.log('PROBLEMS after fix:\n', await problems(p));
await p.screenshot({ path: OUT + '43-fixed.png' });
// syntax error
await gotoLine('print(temp_c)');
await p.keyboard.press('End'); await p.keyboard.press('Enter');
await p.keyboard.type('if shakes > 3 print("x")'); await p.keyboard.press('Home'); await p.keyboard.type('  ');
await p.waitForTimeout(400);
console.log('SERIAL syntax:\n', await runSim(p, 2500));
await p.screenshot({ path: OUT + '44-syntax.png' });
await stop(p);
console.log('PROBLEMS syntax:\n', await problems(p));
await p.screenshot({ path: OUT + '45-syntax-problems.png' });
// copilot after custom code
await p.fill('.composer textarea', 'add a buzzer'); await p.press('.composer textarea', 'Enter');
await p.waitForTimeout(8000);
const m = await p.locator('.msg-text').allInnerTexts(); console.log('REPLY:', m[m.length-1]);
pr = await proj(); console.log('custom code kept?', pr.files['main.py'].includes('if shakes > 3'), 'buzzer in code?', /buzzer/.test(pr.files['main.py']), 'codeCustom', pr.codeCustom);
await p.screenshot({ path: OUT + '46-copilot-after-custom.png' });
console.log('ERRS', errs);
await b.close();
