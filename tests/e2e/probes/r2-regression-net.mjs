import { open, OUT } from './r2-regression-lib.mjs';
const {b,p} = await open('?example=esp32-parking-sensor&notour');
await p.locator('.tabs button',{hasText:'Schematic'}).click(); await p.waitForTimeout(800);
const nets = await p.$$eval('[data-net]', els=>[...new Set(els.map(e=>e.getAttribute('data-net')))]);
console.log('nets', nets.join(','));
const target = nets.find(n=>/17/.test(n));
const el = p.locator(`[data-net="${target}"]`).first();
const bb = await el.boundingBox();
await p.mouse.click(bb.x+bb.width/2, bb.y+bb.height/2); await p.waitForTimeout(600);
console.log('banner', await p.locator('text=/is highlighted/').allInnerTexts());
await p.screenshot({path:OUT+'net-schematic.png'});
await p.locator('.tabs button',{hasText:'Breadboard'}).click(); await p.waitForTimeout(800);
const hl = await p.$$eval('.hl', es=>es.map(e=>e.tagName+'.'+e.getAttribute('class')+' '+(e.getAttribute('data-pin')||e.getAttribute('data-wire')||'')));
console.log('bb hl', hl.length, hl.slice(0,20));
await p.screenshot({path:OUT+'net-breadboard.png'});
// click empty breadboard to see if it clears; then check schematic still says highlighted
await b.close();
