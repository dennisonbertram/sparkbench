import { chromium } from 'playwright';
import fs from 'fs';
const dir='test-results/qa2/verify-555tone';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1400,height:900}});
await p.goto('http://localhost:5173/?example=555-tone&notour'); await p.waitForTimeout(3000);
await p.screenshot({path:`${dir}/board.png`});
const parts=await p.$$eval('.part[data-part]',e=>e.map(x=>x.getAttribute('data-part')));
console.log('PARTS',parts);
for(const t of ['Build guide','Blog post']){
  await p.locator('.tabs button',{hasText:t}).first().click(); await p.waitForTimeout(1500);
  await p.screenshot({path:`${dir}/${t.replace(' ','-')}.png`});
  const txt=await p.locator('main, body').first().innerText();
  fs.writeFileSync(`${dir}/${t.replace(' ','-')}.txt`,txt);
  for(const l of txt.split('\n')) if(/LED|blink|tone|buzzer|piezo|speaker|555 blinker/i.test(l)) console.log(t,'|',l.slice(0,250));
}
await b.close();
