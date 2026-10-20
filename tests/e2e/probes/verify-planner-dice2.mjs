import { chromium } from 'playwright';
const out='test-results/qa/verify-planner';
const prompts={dice:'Raspberry Pi Pico electronic dice: press a button and 7 LEDs show a random dice face 1-6',
door:'Raspberry Pi 4 doorbell with a push button, a buzzer that rings and an LED that flashes when someone presses it'};
const b=await chromium.launch();
for (const [k,p] of Object.entries(prompts)){
const pg=await b.newPage({viewport:{width:1440,height:900}});
pg.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await pg.goto('http://localhost:5173/?welcome&notour');
await pg.fill('.hero-input textarea',p);
await pg.click('button.primary.big');
try{await pg.waitForSelector('button.run',{timeout:90000});}catch(e){console.log('no run btn');}
await pg.waitForTimeout(4000);
await pg.screenshot({path:`${out}/${k}-01.png`});
const body=await pg.evaluate(()=>document.body.innerText);
console.log('=====',k,'\n',body.slice(0,3000));
await pg.locator('button.run').first().click().catch(()=>{}); await pg.waitForTimeout(3000);
const btns=pg.locator('.momentary button'); const n=await btns.count(); console.log('momentary',n);
for(let i=0;i<3&&n;i++){const bb=await btns.first().boundingBox();await pg.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await pg.mouse.down();await pg.waitForTimeout(400);await pg.screenshot({path:`${out}/${k}-02-press${i}.png`});await pg.mouse.up();await pg.waitForTimeout(800);}
await pg.screenshot({path:`${out}/${k}-03-run.png`});
console.log('SERIAL:',await pg.locator('[data-testid=serial]').innerText().catch(()=>'n/a'));
const code=pg.locator('.tabs button',{hasText:'Code'}); await code.click().catch(()=>{}); await pg.waitForTimeout(1000);
await pg.screenshot({path:`${out}/${k}-04-code.png`});
await pg.close();}
await b.close();
