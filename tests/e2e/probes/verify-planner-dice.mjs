import { chromium } from 'playwright';
const out='test-results/qa/verify-planner';
const prompts={dice:'Raspberry Pi Pico electronic dice: press a button and 7 LEDs show a random dice face 1-6',
door:'Raspberry Pi 4 doorbell with a push button, a buzzer that rings and an LED that flashes when someone presses it'};
const b=await chromium.launch();
for (const [k,p] of Object.entries(prompts)){
const pg=await b.newPage({viewport:{width:1440,height:900}});
await pg.goto('http://localhost:5173/?welcome&notour');
await pg.fill('.hero-input textarea',p);
await pg.click('button.primary.big');
await pg.waitForTimeout(6000);
await pg.screenshot({path:`${out}/${k}-01.png`});
const body=await pg.evaluate(()=>document.body.innerText);
console.log('=====',k,'\n',body.slice(0,2500));
const run=pg.locator('button.run'); if(await run.count()){await run.first().click(); await pg.waitForTimeout(2500);}
const btns=pg.locator('.momentary button'); const n=await btns.count();
for(let i=0;i<3&&n;i++){await btns.first().dispatchEvent('pointerdown');await pg.mouse.down();await pg.waitForTimeout(300);await btns.first().dispatchEvent('pointerup');await pg.mouse.up();await pg.waitForTimeout(500);}
await pg.waitForTimeout(1000);
await pg.screenshot({path:`${out}/${k}-02-run.png`});
console.log('SERIAL:',await pg.locator('[data-testid=serial]').innerText().catch(()=>'n/a'));
await pg.close();}
await b.close();
