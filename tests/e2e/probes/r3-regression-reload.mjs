import { open, OUT, proj, say } from './r3-regression-lib.mjs';
const start = process.argv[2] || '?example=pico-traffic-light&notour';
const {b,p} = await open(start);
await p.waitForSelector('.part');
const r = await say(p, 'what does the amber LED do?');
console.log('reply', r.secs, JSON.stringify(r.reply.slice(0,150)));
console.log('url before reload', p.url());
const keys = await p.evaluate(()=>Object.keys(localStorage).map(k=>k+':'+localStorage.getItem(k).length));
console.log('ls keys', keys);
const before = await p.locator('.msg').count();
await p.reload(); await p.waitForTimeout(3000);
console.log('url after reload', p.url(), 'msgs before', before, 'after', await p.locator('.msg').count());
await p.screenshot({path:OUT+'reload-1.png'});
// try bare URL
await p.goto('http://localhost:5173/?notour'); await p.waitForTimeout(3000);
console.log('bare url msgs', await p.locator('.msg').count(), 'project', (await proj(p))?.name);
await p.screenshot({path:OUT+'reload-2-bare.png'});
await b.close();
