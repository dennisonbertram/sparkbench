import { chromium } from 'playwright';
const D='test-results/qa2/repro-r47/';
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1400,height:900}});
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('.hero-input textarea','a little gadget for my desk that tells me if my room is too cold, with a screen');
await p.click('.hero-input button');
await p.waitForSelector('button.run',{timeout:240000});
await p.waitForTimeout(4000);
await p.screenshot({path:D+'01-design.png'});
const parts = await p.$$eval('.part', els=>els.map(e=>e.getAttribute('data-part')+': '+e.textContent.trim().slice(0,60)));
console.log('PARTS', parts);
async function ask(q,i){
  const n = await p.locator('.msg.ai:not(.pending)').count();
  await p.fill('.composer textarea',q); await p.press('.composer textarea','Enter');
  await p.waitForFunction(n=>document.querySelectorAll('.msg.ai:not(.pending)').length>n && !document.querySelector('.msg.ai.pending'),n,{timeout:180000});
  await p.waitForTimeout(1000);
  const t = await p.locator('.msg.ai:not(.pending)').last().innerText();
  console.log('\n##### Q:',q,'\n',t);
  await p.screenshot({path:D+`1${i}-answer.png`});
}
await ask('how do I put it together?',1);
await ask('what do I buy?',2);
for(const tab of ['Parts list','Build guide']){
  await p.click(`.tabs button:has-text("${tab}")`); await p.waitForTimeout(1500);
  await p.screenshot({path:D+'2-'+tab.replace(' ','_')+'.png'});
  const txt = await p.locator('body').innerText();
  console.log('\n#####',tab, txt.split('\n').filter(l=>/resist|Ω|ohm|DHT|LED/i.test(l)).join('\n'));
}
await b.close();
