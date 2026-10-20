// eli-engineer: D2 (schematic follows wiring), D5 (net click -> breadboard highlight), J3 Check in KiCad, H6 zip
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = 'test-results/qa/eli-engineer';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
await p.goto('http://localhost:5173/?example=esp32-parking-sensor&notour');
await p.waitForSelector('.part'); await p.waitForTimeout(800);
// D5: click a net label / wire in schematic
await p.click('.tabs button:has-text("Schematic")'); await p.waitForTimeout(600);
const lbl = p.locator('[data-testid=schematic] [data-net="GPIO17"]').first();
console.log('GPIO17 elements in schematic:', await p.locator('[data-testid=schematic] [data-net="GPIO17"]').count());
await lbl.click({ force: true }); await p.waitForTimeout(300);
await lbl.hover({ force: true }); await p.waitForTimeout(300);
console.log('schematic has-hl class after click/hover:', await p.getAttribute('[data-testid=schematic]', 'class'));
console.log('schematic hl elements:', await p.locator('[data-testid=schematic] .hl').count());
await p.screenshot({ path: `${OUT}/d5-schematic-click.png` });
await p.click('.tabs button:has-text("Breadboard")'); await p.waitForTimeout(500);
console.log('breadboard highlighted wires after schematic click:', await p.locator('g.wire.hl').count(), 'pins hl:', await p.locator('circle.pin.hl').count());
// reverse: hover breadboard wire then check schematic hl
await p.locator('g.wire').nth(0).hover({ force: true }); await p.waitForTimeout(200);
// D2: delete LED resistor and see schematic change
await p.click('.part[data-part=resistor3]', { force: true }); await p.keyboard.press('Delete'); await p.waitForTimeout(300);
await p.click('.tabs button:has-text("Schematic")'); await p.waitForTimeout(600);
const svg = await p.innerHTML('[data-testid=schematic]');
console.log('D2: schematic still contains R3?', /R3</.test(svg), '; contains 220?', svg.includes('>220<'));
await p.screenshot({ path: `${OUT}/d2-schematic-after-delete.png` });
// J3: Check in KiCad
await p.keyboard.press('Meta+z'); await p.waitForTimeout(300);
await p.click('button:has-text("Check in KiCad")'); await p.waitForTimeout(15000);
console.log('kicad banner:', await p.textContent('.docview .banner').catch(() => 'none'));
await p.screenshot({ path: `${OUT}/j3-check-in-kicad.png` });
// H6 zip
await p.click('button:has-text("Export")');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.menu button:has-text("Everything")')]);
mkdirSync(`${OUT}/zip`, { recursive: true });
await dl.saveAs(`${OUT}/zip/${dl.suggestedFilename()}`);
console.log('zip saved', dl.suggestedFilename());
// D4: download SVG
const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download SVG")')]);
console.log('svg download', dl2.suggestedFilename());
await b.close();
