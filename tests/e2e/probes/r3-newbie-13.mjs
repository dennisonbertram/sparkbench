import {open,shot} from './r3-newbie-lib.mjs';
const {ctx,p,errs}=await open('http://localhost:5173/?welcome&notour');
await p.waitForTimeout(2500);
await shot(p,'90-welcome-again');
console.log((await p.innerText('body')).slice(0,600));
await p.click('text=Sparkbench').catch(()=>{}); await p.waitForTimeout(1500);
await shot(p,'91-after-logo');
console.log('URL',p.url(), (await p.innerText('body')).slice(0,200));
await ctx.close();
