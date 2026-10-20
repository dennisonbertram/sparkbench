import { open, OUT, proj, say } from './r2-regression-lib.mjs';
const {b,p} = await open('?example=esp32-weather-imu&notour'); await p.waitForSelector('.part');
async function pressTest(tag){
  await p.click('button.run'); await p.waitForTimeout(2500);
  await p.locator('.part[data-part=pushbutton1]').click(); await p.waitForTimeout(300);
  const oled = async()=>p.locator('.part[data-part=ssd13061]').screenshot({path:`${OUT}move3-${tag}-oled.png`});
  const pressBtn = p.locator('aside button, .inspector button',{hasText:/^Press$/}).first();
  await pressBtn.dispatchEvent('pointerdown').catch(()=>{}); await pressBtn.dispatchEvent('mousedown').catch(()=>{});
  await p.waitForTimeout(500);
  await pressBtn.dispatchEvent('pointerup').catch(()=>{}); await pressBtn.dispatchEvent('mouseup').catch(()=>{});
  await p.waitForTimeout(1500); await oled();
  await p.locator('.console-tabs button',{hasText:'Pins'}).click(); await p.waitForTimeout(200);
  console.log(tag, (await p.locator('.console').innerText()).split('\n').filter(l=>/GPIO1[34]/.test(l)));
  await p.click('button.run'); await p.waitForTimeout(500);
}
await pressTest('before');
await say(p,'move button A to GPIO 14');
await pressTest('after');
await p.locator('.console-tabs button',{hasText:'Problems'}).click();
console.log('problems', await p.locator('[data-testid=problems]').innerText());
await b.close();
