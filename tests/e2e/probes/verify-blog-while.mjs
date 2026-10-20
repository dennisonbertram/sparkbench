import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1400,height:1000}});
for (const id of ['pico-traffic-light','rpi-thermostat','esp32-weather-imu']) {
  await p.goto(`http://localhost:5173/?example=${id}&notour`); await p.waitForTimeout(2500);
  await p.locator('.tabs button', {hasText:'Blog post'}).click(); await p.waitForTimeout(1500);
  const h = p.locator('h3', {hasText:'The main loop'}).first();
  await h.scrollIntoViewIfNeeded();
  const txt = await p.evaluate(()=>{const h=[...document.querySelectorAll('h3')].find(e=>e.textContent.includes('The main loop'));let n=h;while(n&&n.tagName!=='PRE')n=n.nextElementSibling;return n?n.textContent.split('\n').slice(0,4).join('\n'):'NOPRE';});
  console.log(id, JSON.stringify(txt));
  const body = await p.evaluate(()=>document.body.innerText.includes('works like Arduino'));
  console.log(' scale note:', body);
  await p.screenshot({path:`test-results/qa/verify-blog/${id}.png`});
}
await b.close();
