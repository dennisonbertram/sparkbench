import { open, OUT, problems, tab } from './max-maker-lib.mjs';
const { b, p, errs } = await open('http://localhost:5173/?example=esp32-weather-imu&notour');
await p.waitForSelector('.part'); await p.waitForTimeout(1000);
async function proj() { return p.evaluate(() => { const id = localStorage.getItem('sparkbench.current.v1'); return JSON.parse(localStorage.getItem('sparkbench.projects.v1'))[id]; }); }
await p.click('text=+ Add part'); await p.fill('input[placeholder*=earch]', 'LED 5'); await p.locator('text=LED 5 mm').first().click(); await p.waitForTimeout(500);
await p.keyboard.press('Escape');
async function clickPin(k) { await p.locator(`circle.pin[data-pin="${k}"]`).first().click({ force: true }); await p.waitForTimeout(250); }
await clickPin('led1:A'); await clickPin('esp32devkit1:D25'); await clickPin('led1:C'); await clickPin('esp32devkit1:GND.2');
const tabs = p.locator('.console-tabs button'); await tabs.filter({ hasText: 'Problems' }).click(); await p.waitForTimeout(300);
await p.screenshot({ path: OUT + '70-led-problem.png' });
await p.locator('[data-testid=problems] button', { hasText: /resistor/i }).first().click(); await p.waitForTimeout(500);
let pr = await proj();
console.log('WIRES led', pr.wires.filter(w => /led1|resistor/.test(w.a.part + w.b.part)).map(w => w.a.part+':'+w.a.pin+'-'+w.b.part+':'+w.b.pin));
console.log('PROBLEMS after fix', await p.locator('[data-testid=problems]').innerText());
await p.screenshot({ path: OUT + '71-led-fixed.png' });
await tab(p, 'Code');
console.log('led in code before regen?', /Pin\(25/.test(pr.files['main.py']));
p.once('dialog', d => { console.log('DIALOG', d.message()); d.accept(); });
await p.click('text=Regenerate main.py'); await p.waitForTimeout(800);
pr = await proj();
console.log('led in code after regen?', /Pin\(25/.test(pr.files['main.py']), pr.files['main.py'].split('\n').filter(l => /25/.test(l)).join(' / '));
await p.screenshot({ path: OUT + '72-regen.png' });
// schematic shows the new parts?
await tab(p, 'Schematic'); await p.waitForTimeout(800); await p.screenshot({ path: OUT + '73-schematic.png' });
console.log('ERRS', errs);
await b.close();
