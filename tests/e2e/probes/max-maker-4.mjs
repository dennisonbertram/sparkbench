import { open, OUT, state } from './max-maker-lib.mjs';
const { b, p, errs } = await open('http://localhost:5173/?example=esp32-weather-imu&notour');
await p.waitForSelector('.part'); await p.waitForTimeout(1000);
await p.click('text=+ Add part'); await p.waitForTimeout(600);
await p.screenshot({ path: OUT + '20-addpart.png' });
const inp = p.locator('input[type=search], input[placeholder*=earch]').first();
console.log('search input count', await inp.count());
if (await inp.count()) { await inp.fill('led'); await p.waitForTimeout(400); await p.screenshot({ path: OUT + '21-addpart-led.png' }); }
console.log(await p.evaluate(() => document.body.innerText.slice(0, 3000)));
await b.close();
