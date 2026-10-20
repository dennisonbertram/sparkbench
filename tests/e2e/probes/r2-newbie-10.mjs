import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/');
await p.waitForTimeout(2500);
await p.click('.tabs button:has-text("Build guide")'); await p.waitForTimeout(1500);
const g = await p.locator('body').innerText();
for (const m of g.matchAll(/[^\n]*(10\s?k|pull-up)[^\n]*/gi)) console.log('>>',m[0]);
// pin zoom of OLED
await p.click('.tabs button:has-text("Breadboard")'); await p.waitForTimeout(1500);
await p.locator('.part[data-part=ssd13061]').screenshot({path:D+'71-oled.png'});
await ctx.close();
