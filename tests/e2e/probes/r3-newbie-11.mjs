import {open,shot} from './r3-newbie-lib.mjs';
import fs from 'fs';
const {ctx,p,errs}=await open('http://localhost:5173/?notour');
await p.waitForTimeout(2500);
for (const tab of ['Parts list','Build guide']){
  await p.locator('.tabs button',{hasText:tab}).click(); await p.waitForTimeout(1500);
  const main = await p.evaluate(()=>{const t=document.querySelector('.tabs'); let el=t.parentElement; return el.innerText;});
  fs.writeFileSync(`test-results/qa3/newbie/${tab.replace(' ','-')}.txt`, main);
  await shot(p,`80-${tab.replace(' ','-')}`);
}
await ctx.close();
