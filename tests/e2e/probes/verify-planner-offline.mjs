import { chromium } from 'playwright';
const out='test-results/qa/verify-planner';
const prompts={dice:'Raspberry Pi Pico electronic dice: press a button and 7 LEDs show a random dice face 1-6',
door:'Raspberry Pi 4 doorbell with a push button, a buzzer that rings and an LED that flashes when someone presses it',
clock:'Pico NeoPixel ring clock animation with a potentiometer knob to set brightness'};
const b=await chromium.launch();
for (const [k,p] of Object.entries(prompts)){
const pg=await b.newPage({viewport:{width:1440,height:900}});
await pg.route('**/api/status',r=>r.fulfill({json:{ai:{enabled:false}}}));
await pg.goto('http://localhost:5173/?welcome&notour');
await pg.fill('.hero-input textarea',p);
await pg.click('button.primary.big');
await pg.waitForSelector('button.run',{timeout:30000});
await pg.waitForTimeout(2000);
await pg.screenshot({path:`${out}/off-${k}-01.png`});
const chat=await pg.evaluate(()=>document.body.innerText);
const i=chat.indexOf(p); console.log('=====',k,'\n',chat.slice(0,120),'\n...\n',chat.slice(i,i+900));
await pg.locator('button.run').first().click(); await pg.waitForTimeout(2500);
const btn=pg.locator('.part[data-part^=button], .part[data-part^=btn], .part[data-part*=button]').first();
if(await btn.count()){const bb=await btn.boundingBox();for(let j=0;j<2;j++){await pg.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await pg.mouse.down();await pg.waitForTimeout(400);await pg.mouse.up();await pg.waitForTimeout(900);}}
await pg.waitForTimeout(1000);
await pg.screenshot({path:`${out}/off-${k}-02-run.png`});
console.log('SERIAL:',await pg.locator('[data-testid=serial]').innerText().catch(()=>'n/a'));
await pg.close();}
await b.close();
