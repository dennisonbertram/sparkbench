import { open, OUT, problems, runSim, stop } from './max-maker-lib.mjs';
const { b, p, errs } = await open();
await p.fill('.hero-input textarea', 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
await p.click('button.primary.big');
await p.waitForSelector('.part', { timeout: 30000 }); await p.waitForTimeout(1500);
async function proj() { return p.evaluate(() => { const id = localStorage.getItem('sparkbench.current.v1'); return JSON.parse(localStorage.getItem('sparkbench.projects.v1'))[id]; }); }
const before = await proj();
await p.click('text=+ Add part'); await p.waitForTimeout(400);
await p.fill('input[placeholder*=earch]', 'LED 5');
await p.waitForTimeout(300);
await p.locator('text=LED 5 mm').first().click();
await p.waitForTimeout(800);
let pr = await proj();
const newPart = pr.parts.find(x => !before.parts.some(y => y.id === x.id));
console.log('new part', JSON.stringify(newPart));
await p.screenshot({ path: OUT + '30-led-added.png' });
const pins = await p.$$eval(`circle.pin`, els => els.map(e => e.getAttribute('data-pin')).filter(s => /led|D25|GND/.test(s)));
console.log('pins', pins);
async function clickPin(k) { await p.locator(`circle.pin[data-pin="${k}"]`).first().click({ force: true }); await p.waitForTimeout(300); }
await clickPin(`${newPart.id}:A`);
await p.screenshot({ path: OUT + '31-wiring-from.png' });
await clickPin('esp32devkit1:D25');
await clickPin(`${newPart.id}:C`);
const gnd = pins.find(s => s.startsWith('esp32devkit1:GND'));
await clickPin(gnd);
pr = await proj();
console.log('wires now', pr.wires.length, 'was', before.wires.length, pr.wires.slice(-2).map(w => `${w.a.part}:${w.a.pin}-${w.b.part}:${w.b.pin}`));
await p.screenshot({ path: OUT + '32-wired.png' });
console.log('PROBLEMS', await problems(p));
// hover pin
await p.locator(`circle.pin[data-pin="esp32devkit1:D25"]`).hover({ force: true }); await p.waitForTimeout(500);
await p.screenshot({ path: OUT + '33-hover-pin.png' });
// select the LED, edit props
await p.locator(`.part[data-part="${newPart.id}"]`).click(); await p.waitForTimeout(400);
await p.screenshot({ path: OUT + '34-inspector.png' });
console.log('INSPECTOR', await p.locator('.inspector').innerText());
const sel = p.locator('.inspector select').first();
if (await sel.count()) { const opts = await sel.locator('option').allInnerTexts(); console.log('opts', opts); await sel.selectOption({ index: opts.length - 1 }); await p.waitForTimeout(400); }
pr = await proj(); console.log('props now', JSON.stringify(pr.parts.find(x => x.id === newPart.id).props));
await p.screenshot({ path: OUT + '35-prop-changed.png' });
// drag part
const bb = await p.locator(`.part[data-part="${newPart.id}"]`).boundingBox();
await p.mouse.move(bb.x + bb.width/2, bb.y + bb.height/2); await p.mouse.down();
await p.mouse.move(bb.x + 300, bb.y + 400, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(400);
pr = await proj(); const np = pr.parts.find(x => x.id === newPart.id); console.log('moved to', np.x, np.y, 'from', newPart.x, newPart.y);
await p.screenshot({ path: OUT + '36-dragged.png' });
// select a wire and delete
const nW = pr.wires.length;
await p.keyboard.press('Escape');
const wire = p.locator('g.wire').last();
const wb = await p.locator('g.wire path.wire-hit').last().boundingBox();
console.log('wire bbox', wb);
await p.locator('g.wire path.wire-hit').last().click({ force: true }); await p.waitForTimeout(300);
console.log('INSPECTOR2', await p.locator('.inspector').innerText());
await p.click('text=Delete wire').catch(e => console.log('no delete btn', e.message));
await p.waitForTimeout(300);
pr = await proj(); console.log('wires after delete', pr.wires.length, 'was', nW);
await p.screenshot({ path: OUT + '37-wire-deleted.png' });
await p.locator('body').click({ position: { x: 1300, y: 880 } });
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
pr = await proj(); console.log('after ctrl+z', pr.wires.length);
await p.keyboard.press('Meta+z'); await p.waitForTimeout(300);
pr = await proj(); console.log('after meta+z', pr.wires.length);
await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(300);
pr = await proj(); console.log('after ctrl+shift+z', pr.wires.length);
await p.click('text=Undo'); await p.waitForTimeout(300); pr = await proj(); console.log('after Undo btn', pr.wires.length);
await p.click('text=Redo'); await p.waitForTimeout(300); pr = await proj(); console.log('after Redo btn', pr.wires.length);
// keep undoing back to the start
for (let i = 0; i < 12; i++) { const dis = await p.locator('button', { hasText: /^Undo$/ }).isDisabled(); if (dis) { console.log('undo disabled after', i); break; } await p.click('text=Undo'); await p.waitForTimeout(150); }
pr = await proj(); console.log('fully undone parts', pr.parts.length, 'wires', pr.wires.length, 'board', pr.board);
await p.screenshot({ path: OUT + '38-fully-undone.png' });
console.log('ERRS', errs);
await b.close();
