import { open, OUT, proj, say } from './r2-regression-lib.mjs';
const {b,p} = await open(null);
await p.route('**/api/status', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ai:{enabled:false}})}));
await p.goto('http://localhost:5173/?example=esp32-weather-imu&notour'); await p.waitForSelector('.part'); await p.waitForTimeout(1000);
await say(p, "make it beep when it's too hot");
const pr = await proj(p);
console.log(Object.values(pr.files).join('\n').split('\n').filter(l=>/buzz|TEMP|hot/i.test(l)).join('\n'));
await p.click('button.run'); await p.waitForTimeout(2500);
const sl = await p.$$('.simctl label, .simctl > *'); console.log((await p.locator('.simctl').allInnerTexts()).join(' | '));
// set temperature slider to max
const ranges = p.locator('.simctl input[type=range]');
const n = await ranges.count();
for (let i=0;i<n;i++){ const lab = await ranges.nth(i).evaluate(e=>e.closest('label,div')?.innerText||''); if(/temp/i.test(lab)) await ranges.nth(i).evaluate(el=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(el, el.max); el.dispatchEvent(new Event('input',{bubbles:true}));}); }
await p.waitForTimeout(4000);
await p.locator('.console-tabs button',{hasText:'Pins'}).click(); await p.waitForTimeout(300);
console.log(await p.locator('.console').innerText());
await p.screenshot({path:OUT+'off-make-hot.png'});
await b.close();
