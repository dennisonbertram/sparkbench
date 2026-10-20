// eli-engineer: LED currents in inspector, pin hover voltages
import { chromium } from 'playwright';
const OUT = 'test-results/qa/eli-engineer';
const b = await chromium.launch();
async function open(id) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(`http://localhost:5173/?example=${id}&notour`);
  await p.waitForSelector('.part'); await p.waitForTimeout(800);
  return p;
}
async function setRange(p, sel, val) {
  await p.$eval(sel, (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, String(val));
}
async function hover(p, pin) {
  await p.hover(`circle.pin[data-pin="${pin}"]`, { force: true }); await p.waitForTimeout(400);
  return (await p.textContent('.pintip').catch(() => 'no tip'));
}
// 555
{
  const p = await open('555-blinker');
  await p.click('button.run'); await p.waitForTimeout(2500);
  await p.click('.part[data-part=led1]', { force: true }); await p.waitForTimeout(200);
  const samples = [];
  for (let i = 0; i < 10; i++) { samples.push(await p.textContent('.inspector .live').catch(() => '-')); await p.waitForTimeout(150); }
  console.log('555 LED inspector samples:', samples);
  await p.screenshot({ path: `${OUT}/555-inspector.png` });
  for (const pin of ['ne5551:CTRL', 'ne5551:THR', 'ne5551:OUT', 'led1:A']) console.log('555 hover', pin, '=>', await hover(p, pin));
  await p.screenshot({ path: `${OUT}/555-hover.png` });
}
// parking
{
  const p = await open('esp32-parking-sensor');
  await p.click('button.run'); await p.waitForTimeout(2000);
  await p.click('.part[data-part=hcsr041]', { force: true }); await p.waitForTimeout(300);
  const sl = await p.$$('.inspector .simctl input[type=range]'); console.log('sliders', sl.length);
  if (sl.length) await setRange(p, '.inspector .simctl input[type=range]', 10);
  await p.waitForTimeout(2500);
  console.log('serial tail', (await p.textContent('[data-testid=serial]')).slice(-200));
  await p.click('.part[data-part=led1]', { force: true }); await p.waitForTimeout(300);
  console.log('parking LED inspector:', await p.textContent('.inspector .live').catch(() => '-'));
  for (const pin of ['resistor1:1', 'resistor1:2', 'esp32devkit1:D13', 'hcsr041:ECHO', 'led1:A', 'hcsr041:VCC']) console.log('park hover', pin, '=>', await hover(p, pin).catch(e=>'ERR '+e.message.slice(0,80)));
  await p.screenshot({ path: `${OUT}/parking-hover.png` });
}
// plant waterer: soil divider / I2C voltages
{
  const p = await open('rpi-plant-waterer');
  await p.click('button.run'); await p.waitForTimeout(2500);
  for (const pin of ['soil1:AOUT', 'lcd16021:SDA', 'relay1:IN']) console.log('plant hover', pin, '=>', await hover(p, pin).catch(e=>'ERR '+e.message.slice(0,80)));
  await p.click('.part[data-part=relay1]', { force: true }); await p.waitForTimeout(300);
  console.log('relay inspector:', await p.textContent('.inspector .live').catch(() => '-'));
}
await b.close();
