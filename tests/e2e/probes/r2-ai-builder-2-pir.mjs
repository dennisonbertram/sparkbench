import * as L from './r2-ai-builder-2-lib.mjs';
const { ctx, p, errs } = await L.open('http://localhost:5173/?notour', 'pir');
console.log('STATE', JSON.stringify(await L.state(p)));
await L.run(p); await p.waitForTimeout(1500);
const slider = p.locator('.simctl input[type=range]').first();
await slider.evaluate((el) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '2'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
await p.waitForTimeout(2500);
const btn = p.locator('.momentary', { hasText: 'Motion' }).first();
await btn.hover(); await p.mouse.down(); await p.waitForTimeout(1500); await L.shot(p, 'pir-40-motion'); await p.mouse.up();
await p.waitForTimeout(3000); await L.shot(p, 'pir-41-after');
console.log('SERIAL\n', await L.serial(p));
await L.consoleTab(p, /pins/i);
console.log(await p.evaluate(() => [...document.querySelectorAll('tr')].map(r => r.innerText.replace(/\s+/g,' ')).join('\n')));
// raise light while lamp on
await slider.evaluate((el) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '2000'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
await p.waitForTimeout(3000);
console.log('SERIAL2\n', await L.serial(p));
console.log('ERRS', errs.join('\n'));
await ctx.close();
