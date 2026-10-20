import { chromium } from 'playwright';
const dir='test-results/qa/verify-claudechecks';
const prompt=process.argv[2]||'make a robot', tag=process.argv[3]||'robot';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('http://localhost:5173/?welcome&notour',{waitUntil:'networkidle'});
await p.waitForTimeout(1500);
await p.locator('.hero-input textarea').click();
await p.keyboard.type(prompt);
await p.click('button.primary.big');
await p.waitForSelector('.composer',{timeout:60000});
for(let i=0;i<240;i++){ const t=await p.locator('body').innerText(); if(!/Claude is|Designing…|Thinking…/.test(t)) break; await p.waitForTimeout(1000);}
await p.waitForTimeout(2000);
await p.screenshot({path:`${dir}/${tag}-chat.png`});
console.log('BODYCHAT', (await p.locator('body').innerText()).slice(0,3000));
await p.locator('.console-tabs button',{hasText:'Problems'}).click();
await p.waitForTimeout(500);
console.log('PROBLEMS',await p.locator('[data-testid=problems]').innerText());
await p.screenshot({path:`${dir}/${tag}-problems.png`});
await b.close();
