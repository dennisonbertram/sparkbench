import {open,shot} from './r3-newbie-lib.mjs';
import fs from 'fs';
const {ctx,p,errs}=await open('http://localhost:5173/?notour');
await p.waitForTimeout(2500);
const ls = await p.evaluate(()=>{const o={}; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); o[k]=localStorage.getItem(k);} return o;});
fs.writeFileSync('test-results/qa3/newbie/localstorage.json', JSON.stringify(ls,null,1));
console.log(Object.keys(ls).map(k=>k+':'+ls[k].length));
await ctx.close();
