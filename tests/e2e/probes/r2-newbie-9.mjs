import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/');
await p.waitForTimeout(2500);
await p.click('button.run'); await p.waitForTimeout(2500);
const t = p.locator('.simctl input[aria-label=Temperature]');
await t.fill('12');
const bz = p.locator('.part[data-part=buzzer1]');
for(let i=0;i<6;i++){ await p.waitForTimeout(250); await bz.screenshot({path:D+`70-buzzer-${i}.png`}); console.log(i, (await bz.getAttribute('class')), (await bz.innerHTML()).length); }
console.log('sound btn:', await p.locator('button:has-text("Sound")').first().getAttribute('title'));
await p.click('.tabs button:has-text("Build guide")'); await p.waitForTimeout(1500);
const g = await p.locator('body').innerText();
const i = g.indexOf('Wiring table'); console.log(g.slice(i, i+1500));
console.log('mentions 10k/pull-up:', /10\s?k|pull-up/i.test(g));
await ctx.close();
