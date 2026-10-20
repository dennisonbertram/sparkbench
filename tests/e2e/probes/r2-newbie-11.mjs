import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/');
await p.waitForTimeout(2500);
console.log(await p.$$eval('circle.pin[data-pin^="ssd13061:"]', els=>els.map(e=>e.getAttribute('data-pin'))));
const pin = p.locator('circle.pin[data-pin="ssd13061:SDA"]');
await pin.hover(); await p.waitForTimeout(600);
await shot(p,'72-hover-sda');
// click the OLED part to see info
await p.click('.part[data-part=ssd13061]'); await p.waitForTimeout(800);
await shot(p,'73-oled-info');
console.log((await p.locator('body').innerText()).match(/Project[\s\S]{0,900}/)?.[0]);
await ctx.close();
