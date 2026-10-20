import * as L from './r2-ai-builder-2-lib.mjs';
const { ctx, p, errs } = await L.open('http://localhost:5173/?notour', 'metro');
console.log('STATE', JSON.stringify(await L.state(p)));
await L.run(p); await p.waitForTimeout(1500);
const led = () => p.evaluate(() => { const e = document.querySelector('.part[data-part=led1]'); return e.innerHTML.length + ':' + [...e.querySelectorAll('*')].map(x => x.getAttribute('opacity') || x.getAttribute('filter') || x.style?.opacity || '').filter(Boolean).join(',').slice(0,120); });
const samples = []; for (let i = 0; i < 20; i++) { samples.push(await led()); await p.waitForTimeout(100); }
console.log('LED samples', [...new Set(samples)]);
await L.consoleTab(p, /pins/i); await L.shot(p, 'metro-10-pins');
console.log('PINS', await p.locator('.console-body, .console').last().innerText().catch(e=>e.message));
const slider = p.locator('.simctl input[type=range]').first();
for (const v of ['0', '100']) {
  await slider.evaluate((el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  await p.waitForTimeout(4000);
  console.log('after knob', v, '\n', await L.serial(p));
  await L.shot(p, 'metro-11-knob' + v);
}
console.log('ERRS', errs.join('\n'));
await ctx.close();
