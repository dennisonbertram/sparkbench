import { open, OUT, problems, runSim, stop, tab } from './max-maker-lib.mjs';
import fs from 'fs';
const { b, ctx, p, errs } = await open('http://localhost:5173/?example=pico-mood-lamp&notour');
await p.waitForSelector('.part'); await p.waitForTimeout(1000);
async function proj() { return p.evaluate(() => { const id = localStorage.getItem('sparkbench.current.v1'); return JSON.parse(localStorage.getItem('sparkbench.projects.v1') || '{}')[id]; }); }
// F3: hover pin while running
await p.click('button.run'); await p.waitForTimeout(3000);
const pr0 = await proj();
console.log('parts', pr0?.parts.map(x=>x.id+':'+x.type).join(' '));
const ledPin = await p.$$eval('circle.pin.connected', els => els.map(e => e.getAttribute('data-pin')).filter(s => /^pipico/.test(s)));
console.log('connected board pins', ledPin);
for (const k of ledPin.slice(0, 3)) {
  await p.locator(`circle.pin[data-pin="${k}"]`).hover({ force: true }); await p.waitForTimeout(400);
  console.log('TIP', k, '=>', await p.locator('.pintip').innerText().catch(()=>'none'));
}
await p.screenshot({ path: OUT + '50-running-pintip.png' });
// F4 speed & restart
await p.selectOption('select[aria-label="Simulation speed"]', '5');
const t1 = await p.locator('.sim-time').innerText(); await p.waitForTimeout(2000); const t2 = await p.locator('.sim-time').innerText();
console.log('5x speed sim time', t1, '->', t2, 'in 2s wall');
await p.click('text=Restart'); await p.waitForTimeout(800);
console.log('after restart', await p.locator('.sim-time').innerText());
await p.click('button.run'); await p.waitForTimeout(500);
console.log('status after stop:', await p.locator('.status').innerText());
// I1: rename + reload
await p.fill('input.project-name', 'Max lamp v2'); await p.waitForTimeout(500);
await p.goto('http://localhost:5173/'); await p.waitForTimeout(1500);
console.log('after reload name:', await p.locator('input.project-name').inputValue().catch(()=>'NO PROJECT (welcome?)'));
await p.screenshot({ path: OUT + '51-reload.png' });
// I2 menu
await p.click('button.brand'); await p.waitForTimeout(400);
await p.screenshot({ path: OUT + '52-projects-menu.png' });
console.log('MENU', await p.locator('.projects-menu').innerText());
await p.click('text=Duplicate this project'); await p.waitForTimeout(500);
console.log('after duplicate name:', await p.locator('input.project-name').inputValue());
// delete the currently open project from Recent
await p.click('button.brand'); await p.waitForTimeout(300);
p.once('dialog', d => d.accept());
await p.locator('.projects-menu button[aria-label="Delete Max lamp v2 (copy)"]').click();
await p.waitForTimeout(400);
console.log('MENU after delete current', await p.locator('.projects-menu').innerText().catch(()=>'(menu closed)'));
console.log('name shown:', await p.locator('input.project-name').inputValue());
await p.mouse.move(700, 600); await p.waitForTimeout(300);
await p.fill('input.project-name', 'Max lamp v2 (copy) edited'); await p.waitForTimeout(500);
await p.goto('http://localhost:5173/'); await p.waitForTimeout(1500);
console.log('after reload (deleted current project):', await p.locator('input.project-name').inputValue().catch(()=>'welcome'));
await p.click('button.brand'); await p.waitForTimeout(300);
console.log('MENU now', await p.locator('.projects-menu').innerText());
await p.screenshot({ path: OUT + '53-after-delete-reload.png' });
await p.keyboard.press('Escape'); await p.mouse.move(700, 700);
// I3 export/import
await p.click('button.primary:has-text("Export")'); await p.waitForTimeout(300);
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Project file (.json)')]);
const path = OUT + 'exported.sparkbench.json'; await dl.saveAs(path);
console.log('exported', dl.suggestedFilename(), fs.statSync(path).size);
await p.click('button.brand'); await p.waitForTimeout(300);
await p.setInputFiles('.menu-file input[type=file]', path); await p.waitForTimeout(800);
console.log('after import name:', await p.locator('input.project-name').inputValue());
console.log('ERRS', errs);
await b.close();
