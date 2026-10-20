import { chromium } from 'playwright';
const out='test-results/qa/verify-make';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1400,height:900}});
await p.route('**/api/status', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ai:{enabled:false}})}));
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('.hero-input textarea','a thermometer with a screen for my desk');
await p.click('button.primary.big');
await p.waitForTimeout(2500);
const parts=async()=>p.$$eval('.part[data-part]',e=>e.map(x=>x.getAttribute('data-part')));
console.log('before',await parts());
await p.screenshot({path:out+'/1-before.png'});
for (const [i,msg] of ['make it beep when it\'s too hot','make the text bigger'].entries()){
  await p.fill('.composer textarea',msg); await p.press('.composer textarea','Enter');
  await p.waitForTimeout(3000);
  console.log(msg,'->',await parts());
  const last=await p.$$eval('.msg, [class*=chat] [class*=ai]',e=>e.slice(-1).map(x=>x.innerText.slice(0,200)));
  console.log('reply',last);
  await p.screenshot({path:`${out}/${i+2}-after.png`});
}
await b.close();
