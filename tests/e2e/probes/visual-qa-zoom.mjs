import { chromium } from 'playwright';
const BASE='http://localhost:5173'; const OUT='test-results/qa/visual-qa/zoom';
import { mkdirSync } from 'node:fs'; mkdirSync(OUT,{recursive:true});
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:2});
const page = await ctx.newPage();
async function open(id){ await page.goto(`${BASE}/?example=${id}&notour`); await page.waitForSelector('[data-testid="breadboard"] .part'); await page.waitForTimeout(900); }
// traffic light labels
await open('pico-traffic-light');
await page.screenshot({path:`${OUT}/traffic-labels.png`, clip:{x:330,y:180,width:330,height:500}});
// weather imu running: OLED + badge
await open('esp32-weather-imu'); await page.click('button.run'); await page.waitForTimeout(2500);
await page.screenshot({path:`${OUT}/weather-oled.png`, clip:{x:820,y:120,width:310,height:320}});
await page.screenshot({path:`${OUT}/weather-buttons.png`, clip:{x:330,y:270,width:300,height:220}});
// plant waterer: No power
await open('rpi-plant-waterer'); await page.click('button.run'); await page.waitForTimeout(2500);
await page.screenshot({path:`${OUT}/plant-nopower.png`, clip:{x:340,y:250,width:780,height:280}});
const np = await page.evaluate(()=>[...document.querySelectorAll('[data-testid=breadboard] text, [data-testid=breadboard] *')].filter(e=>e.childElementCount===0 && /no power/i.test(e.textContent)).map(e=>e.outerHTML.slice(0,200)));
console.log('nopower', JSON.stringify(np));
// neopixel ring at several temps
await open('esp32-neopixel-thermo'); await page.click('button.run'); await page.waitForTimeout(2500);
await page.screenshot({path:`${OUT}/neo-22.png`, clip:{x:340,y:270,width:280,height:220}});
const sliders = page.locator('.simctl input[type=range]');
console.log('sliders', await sliders.count());
await sliders.nth(0).fill('35'); await page.waitForTimeout(2000);
await page.screenshot({path:`${OUT}/neo-35.png`, clip:{x:340,y:270,width:280,height:220}});
await sliders.nth(0).fill('5'); await page.waitForTimeout(2000);
await page.screenshot({path:`${OUT}/neo-5.png`, clip:{x:340,y:270,width:280,height:220}});
console.log('serial', (await page.textContent('[data-testid=serial]')).slice(-200));
// motion alarm right edge label
await open('esp32-motion-alarm');
await page.screenshot({path:`${OUT}/motion-right.png`, clip:{x:960,y:260,width:180,height:220}});
await ctx.close();
// dark mode zooms
const dctx = await browser.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:2, colorScheme:'dark'});
const d = await dctx.newPage();
await d.goto(`${BASE}/?example=esp32-weather-imu&notour`); await d.waitForSelector('[data-testid="breadboard"] .part'); await d.waitForTimeout(800);
await d.click('button.run'); await d.waitForTimeout(1500);
await d.screenshot({path:`${OUT}/dark-header-running.png`, clip:{x:420,y:0,width:600,height:50}});
const st = await d.evaluate(()=>{const b=document.querySelector('button.run'); const s=getComputedStyle(b); return {bg:s.backgroundColor,color:s.color,text:b.textContent};});
console.log('dark stop button', JSON.stringify(st));
await d.click('button.run');
await d.locator('.tabs button',{hasText:'Code'}).click(); await d.waitForTimeout(600);
await d.screenshot({path:`${OUT}/dark-code.png`, clip:{x:320,y:140,width:600,height:300}});
await d.locator('.tabs button',{hasText:'Schematic'}).click(); await d.waitForTimeout(600);
await d.screenshot({path:`${OUT}/dark-schematic.png`, clip:{x:390,y:190,width:420,height:290}});
await browser.close();
