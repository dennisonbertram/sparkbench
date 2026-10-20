import { chromium } from 'playwright';
const out='test-results/qa2/r2-tone';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1400,height:900}});
await p.goto('http://localhost:5173/?example=555-tone&notour'); await p.waitForTimeout(3000);
await p.screenshot({path:`${out}/1-open.png`});
const body=await p.innerText('body'); console.log('---BODY---\n'+body.slice(0,2500));
console.log('parts:', await p.$$eval('.part', els=>els.map(e=>e.dataset.part)));
const tabs=await p.$$('.tabs button'); for(const t of tabs){ if((await t.innerText()).includes('Blog')){await t.click();}}
await p.waitForTimeout(2000); await p.screenshot({path:`${out}/2-blog.png`});
const b2=await p.innerText('body'); const i=b2.indexOf('Build a'); console.log('---BLOG---\n'+b2.slice(Math.max(0,i-200), i+2500));
await b.close();
