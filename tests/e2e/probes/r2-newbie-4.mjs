import {open,shot,D} from './r2-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/');
await p.waitForTimeout(2500);
const qs = JSON.parse(process.argv[2]);
const tag = process.argv[3]||'30';
let k=0;
for(const q of qs){
  const before = await p.locator('.msg.ai:not(.pending)').count();
  await p.fill('.composer textarea', q);
  await p.press('.composer textarea','Enter');
  const t0=Date.now();
  await p.waitForTimeout(1500);
  await shot(p,`${tag}-${k}-pending`);
  console.log('PENDING UI:', (await p.locator('.msg.pending, .msg.ai.pending').allInnerTexts()).join(' / '));
  let ok=false;
  for(let i=0;i<120;i++){ await p.waitForTimeout(1000); if(await p.locator('.msg.ai:not(.pending)').count()>before){ok=true;break;} }
  await p.waitForTimeout(1500);
  const last = p.locator('.msg.ai:not(.pending)').last();
  console.log(`\n=== Q: ${q}  (${((Date.now()-t0)/1000).toFixed(0)}s ok=${ok})\n`, await last.innerText());
  await last.scrollIntoViewIfNeeded().catch(()=>{});
  await shot(p,`${tag}-${k}-answer`);
  k++;
}
console.log('TABS selected:', await p.locator('.tabs button.active, .tabs button[aria-selected=true]').allInnerTexts());
console.log('ERRS',errs.filter(e=>!e.includes('Lit is in dev')));
await ctx.close();
