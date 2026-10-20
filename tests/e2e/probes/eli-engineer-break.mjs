// eli-engineer: break designs and see if Problems/sim catch it
import { chromium } from 'playwright';
const OUT = 'test-results/qa/eli-engineer';
const b = await chromium.launch();
async function open(id) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(`http://localhost:5173/?example=${id}&notour`);
  await p.waitForSelector('.part'); await p.waitForTimeout(800);
  return p;
}
const wireIdx = async (p, a, bb) => p.evaluate(([a, bb]) => {
  // find wire by its inspector text: click each? Use DOM order == project.wires order; read project from localStorage-free path: rely on store not exposed, so return -1
  return -1;
}, [a, bb]);
async function delWireBetween(p, pinA, pinB) {
  const n = await p.locator('g.wire').count();
  for (let i = 0; i < n; i++) {
    await p.locator('g.wire').nth(i).dispatchEvent('pointerdown');
    await p.waitForTimeout(60);
    const t = await p.textContent('.inspector').catch(() => '');
    if (t.includes(pinA) && t.includes(pinB)) { await p.click('.inspector button.danger'); await p.waitForTimeout(200); return true; }
  }
  return false;
}
async function wire(p, a, c) {
  await p.click(`circle.pin[data-pin="${a}"]`, { force: true }); await p.waitForTimeout(100);
  await p.click(`circle.pin[data-pin="${c}"]`, { force: true }); await p.waitForTimeout(200);
}
async function delPart(p, id) {
  await p.click(`.part[data-part=${id}]`, { force: true }); await p.waitForTimeout(150);
  await p.keyboard.press('Delete'); await p.waitForTimeout(300);
}
async function problems(p) {
  await p.click('.console-tabs button:has-text("Problems")'); await p.waitForTimeout(300);
  return (await p.textContent('[data-testid=problems]')).trim();
}
async function serial(p) {
  await p.click('.console-tabs button >> nth=0'); await p.waitForTimeout(300);
  return (await p.textContent('[data-testid=serial]').catch(() => '(no serial)')).slice(-500);
}
const scen = process.argv[2] || 'all';
if (scen === 'all' || scen === 'led555') {
  const p = await open('555-blinker');
  await delPart(p, 'resistor3');
  await wire(p, 'ne5551:OUT', 'led1:A');
  console.log('[555 LED no resistor] problems before run:', await problems(p));
  await p.click('button.run'); await p.waitForTimeout(3000);
  await p.click('.part[data-part=led1]', { force: true }); await p.waitForTimeout(300);
  const s = []; for (let i = 0; i < 6; i++) { s.push(await p.textContent('.inspector .live').catch(() => '-')); await p.waitForTimeout(150); }
  console.log('  LED inspector:', s);
  console.log('  problems running:', await problems(p));
  await p.screenshot({ path: `${OUT}/break-555-noresistor.png` });
}
if (scen === 'all' || scen === 'ledpark') {
  const p = await open('esp32-parking-sensor');
  await delPart(p, 'resistor3');
  await wire(p, 'esp32devkit1:TX2', 'led1:A');
  console.log('[parking LED no resistor] problems:', await problems(p));
  await p.click('button.run'); await p.waitForTimeout(1500);
  await p.click('.part[data-part=hcsr041]', { force: true }); await p.waitForTimeout(300);
  await p.$eval('.inspector .simctl input[type=range]', (el) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '10'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(2500);
  await p.click('.part[data-part=led1]', { force: true }); await p.waitForTimeout(300);
  console.log('  LED inspector:', await p.textContent('.inspector .live').catch(() => '-'));
  console.log('  serial:', await serial(p));
  console.log('  problems running:', await problems(p));
  await p.screenshot({ path: `${OUT}/break-park-noresistor.png` });
}
if (scen === 'all' || scen === 'echo5v') {
  const p = await open('esp32-parking-sensor');
  console.log('deleted', await delWireBetween(p, 'U2.ECHO', 'R1'));
  await wire(p, 'hcsr041:ECHO', 'esp32devkit1:D13');
  console.log('[parking ECHO 5V direct to GPIO13] problems:', await problems(p));
  await p.click('button.run'); await p.waitForTimeout(3000);
  console.log('  problems running:', await problems(p));
  console.log('  serial:', await serial(p));
  await p.screenshot({ path: `${OUT}/break-park-echo5v.png` });
}
if (scen === 'all' || scen === 'sr04on3v3') {
  const p = await open('esp32-parking-sensor');
  console.log('deleted', await delWireBetween(p, 'U2.VCC', 'VIN'));
  await wire(p, 'hcsr041:VCC', 'esp32devkit1:3V3');
  console.log('[HC-SR04 powered from 3V3] problems:', await problems(p));
  await p.click('button.run'); await p.waitForTimeout(3000);
  console.log('  problems running:', await problems(p));
  console.log('  serial:', await serial(p));
  await p.screenshot({ path: `${OUT}/break-park-sr04-3v3.png` });
}
if (scen === 'all' || scen === 'swapi2c') {
  const p = await open('esp32-weather-imu');
  console.log('deleted', await delWireBetween(p, 'DS1.SDA', 'D21'), await delWireBetween(p, 'DS1.SCL', 'D22'));
  await wire(p, 'ssd13061:SDA', 'esp32devkit1:D22');
  await wire(p, 'ssd13061:SCL', 'esp32devkit1:D21');
  console.log('[OLED SDA/SCL swapped] problems:', await problems(p));
  await p.click('button.run'); await p.waitForTimeout(3500);
  console.log('  problems running:', await problems(p));
  console.log('  serial:', await serial(p));
  await p.click('.tabs button:has-text("Breadboard")').catch(()=>{});
  await p.screenshot({ path: `${OUT}/break-weather-swapi2c.png` });
}
if (scen === 'all' || scen === 'nopull') {
  const p = await open('esp32-weather-imu');
  console.log('deleted', await delWireBetween(p, 'U3.GND', 'GND'));
  console.log('[DHT22 GND removed] problems:', await problems(p));
  await p.click('button.run'); await p.waitForTimeout(3500);
  console.log('  problems running:', await problems(p));
  console.log('  serial:', await serial(p));
  await p.screenshot({ path: `${OUT}/break-weather-dhtnognd.png` });
}
await b.close();
