import { chromium } from 'playwright';
const dir='test-results/qa2/verify555';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1500,height:950}});
await p.goto('http://localhost:5173/?example=555-tone&notour'); await p.waitForTimeout(3000);
const ct=p.locator('.console-tabs button'); const n=await ct.count();
for(let i=0;i<n;i++){const t=await ct.nth(i).innerText(); if(/Problems/i.test(t)) await ct.nth(i).click();}
await p.waitForTimeout(800);
console.log('PROBLEMS:', await p.locator('[data-testid=problems]').innerText().catch(e=>'ERR '+e));
await p.screenshot({path:dir+'/problems.png'});
await p.locator('.tabs button',{hasText:'Build guide'}).click(); await p.waitForTimeout(1500);
const body=await p.locator('body').innerText();
const i=body.indexOf('Design check'); console.log('GUIDE:', i>=0?body.slice(i-200,i+600):'no Design check text');
await p.screenshot({path:dir+'/guide.png'});
await b.close();
