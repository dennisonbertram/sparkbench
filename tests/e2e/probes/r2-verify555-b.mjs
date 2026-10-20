import { chromium } from 'playwright';
const dir='test-results/qa2/verify555';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1500,height:950}});
await p.goto('http://localhost:5173/?example=555-tone&notour'); await p.waitForTimeout(3000);
await p.locator('button.run').click(); await p.waitForTimeout(1500);
const m=p.locator('.momentary'); console.log('momentary count', await m.count());
const box=await m.first().boundingBox(); await p.mouse.move(box.x+box.width/2,box.y+box.height/2); await p.mouse.down();
await p.waitForTimeout(2000);
const ct=p.locator('.console-tabs button'); for(let i=0;i<await ct.count();i++){const t=await ct.nth(i).innerText(); if(/Pins/i.test(t)) await ct.nth(i).click();}
await p.waitForTimeout(800);
await p.screenshot({path:dir+'/running-pressed.png'});
const body=await p.locator('body').innerText(); const i=body.indexOf('VCC'); console.log(i>=0?body.slice(Math.max(0,i-300),i+500):'no VCC');
await p.mouse.up(); await b.close();
