import {open,shot,waitAI} from './r3-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/?notour');
await p.waitForTimeout(2500);
const qs = [
 "what is a neopixel and why is there a resistor next to it?",
 "can i plug this into a phone charger and leave it on all night? is it safe for a kid's room?",
 "how do i actually get the code onto the esp32 thing? i've never done this",
];
let i=0;
for (const q of qs){
  i++;
  const before = await p.locator('.msg.ai:not(.pending)').count();
  const partsBefore = JSON.stringify(await p.$$eval('.part[data-part]', e=>e.map(x=>x.getAttribute('data-part'))));
  await p.fill('.composer textarea', q);
  await p.press('.composer textarea','Enter');
  await p.waitForTimeout(1500); await shot(p,`40-q${i}-pending`);
  const ms = await waitAI(p,before,'Q'+i);
  await p.waitForTimeout(800);
  await shot(p,`41-q${i}-answer`);
  const ans = await p.locator('.msg.ai:not(.pending)').last().innerText();
  const partsAfter = JSON.stringify(await p.$$eval('.part[data-part]', e=>e.map(x=>x.getAttribute('data-part'))));
  console.log(`\n=== Q${i} (${(ms/1000).toFixed(0)}s): ${q}\n${ans}\nPARTS CHANGED? ${partsBefore!==partsAfter}`);
}
console.log('ERRS',errs);
await ctx.close();
