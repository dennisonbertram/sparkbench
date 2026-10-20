import { open, OUT } from './r3-regression-lib.mjs';
for (const ex of ['rpi-plant-waterer','rpi-thermostat']) {
const {b,p} = await open(`?example=${ex}&notour`, {deviceScaleFactor:3});
const bb = await p.locator('.part[data-part=rpi41]').boundingBox();
await p.screenshot({path:OUT+`rpi-header-${ex}.png`, clip:{x:bb.x, y:bb.y-20, width:bb.width*0.6, height:90}});
await b.close();
}
