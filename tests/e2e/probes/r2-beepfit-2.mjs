import { chromium } from 'playwright';
const D='test-results/qa2/beepfit/';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1366,height:820}});
await p.goto('http://localhost:5173/?example=esp32-weather-imu&notour'); await p.waitForTimeout(3000);
const n0 = await p.locator('.msg.ai:not(.pending)').count();
await p.fill('.composer textarea','make it beep when it\'s below 18 degrees'); await p.press('.composer textarea','Enter');
await p.waitForFunction(n=>document.querySelectorAll('.msg.ai:not(.pending)').length>n && !document.querySelector('.msg.ai.pending'), n0, {timeout:180000});
await p.waitForTimeout(1500);
await p.click('button.run'); await p.waitForTimeout(3000);
const ins = await p.$$eval('.simctl input', els=>els.map(e=>({type:e.type,min:e.min,max:e.max,value:e.value,label:e.closest('label,div')?.innerText?.slice(0,40)})));
console.log(JSON.stringify(ins));
// set first range input (temperature) to 15
await p.locator('.simctl input[type=range]').nth(3).evaluate(e=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(e,'15'); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));});
let on=0, total=0, shotDone=false;
for (let i=0;i<120;i++){ const s = await p.evaluate(()=>{const e=document.querySelector('wokwi-buzzer'); return e? !!e.hasSignal : null}); total++; if(s){on++; if(!shotDone){shotDone=true; await p.screenshot({path:D+'03-beeping.png'}); await p.locator('.part[data-part=buzzer1]').screenshot({path:D+'04-buzzer-on.png'}).catch(e=>console.log('elshot',e.message));}} await p.waitForTimeout(100);}
console.log('hasSignal true in', on, 'of', total, 'samples');
await p.screenshot({path:D+'05-cold-end.png'});
console.log('serial:', (await p.locator('[data-testid=serial]').innerText()).split('\n').filter(l=>/beep|Cold yes|COLD/i.test(l)).slice(0,5));
const body = await p.locator('body').innerText(); console.log('sound nudge?', /turn sound on|beeps/i.test(body.replace(/I added a buzzer[\s\S]*?for you\./,'')), 'soundbtn:', await p.getByText(/Sound (on|off)/).first().innerText());
await b.close();
