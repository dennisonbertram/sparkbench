import { open, proj } from './r2-regression-lib.mjs';
const {b,p} = await open('?example=esp32-weather-imu&notour'); await p.waitForSelector('.part');
const s=JSON.stringify(await proj(p)); const i=s.indexOf('pushbutton1'); 
console.log([...s.matchAll(/.{60}pushbutton1.{60}/g)].map(m=>m[0]).slice(0,8));
await b.close();
