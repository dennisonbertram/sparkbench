import { open, OUT, parts, proj, say } from './r2-regression-lib.mjs';
const ex = process.argv[2] || 'esp32-weather-imu';
const tag = process.argv[3] || 'ai1';
const {b,p} = await open(`?example=${ex}&notour`);
await p.waitForSelector('.part');
const boxes = () => p.$$eval('.part[data-part]', es=>es.map(e=>{const r=e.getBoundingClientRect(); return {id:e.dataset.part,x:r.x,y:r.y,w:r.width,h:r.height};}));
function overlaps(bx){ const o=[]; for(let i=0;i<bx.length;i++)for(let j=i+1;j<bx.length;j++){const a=bx[i],c=bx[j]; const ix=Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x), iy=Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y); if(ix>4&&iy>4) o.push(`${a.id}~${c.id} (${ix.toFixed(0)}x${iy.toFixed(0)})`);} return o; }
const wkey = w=>`${w.a.part}:${w.a.pin}-${w.b.part}:${w.b.pin}`;
const pr0 = await proj(p);
console.log('PARTS0', await parts(p)); console.log('OVERLAP0', overlaps(await boxes()));
await p.click('button.run'); await p.waitForTimeout(4000);
console.log('RUN btn', await p.textContent('button.run'));
const serial0 = (await p.textContent('[data-testid=serial]')).slice(-200);
await p.screenshot({path:OUT+tag+'-0-running.png'});
// (2) question
let r = await say(p, 'what is a DHT22?');
const pr1 = await proj(p);
console.log('\n[Q] reply', r.secs, JSON.stringify(r.reply?.slice(0,400)));
console.log('[Q] parts same', JSON.stringify(pr1.parts.map(x=>x.id))===JSON.stringify(pr0.parts.map(x=>x.id)), 'wires same', JSON.stringify(pr1.wires)===JSON.stringify(pr0.wires), 'files same', JSON.stringify(pr1.files)===JSON.stringify(pr0.files));
console.log('[Q] run btn', await p.textContent('button.run'));
await p.screenshot({path:OUT+tag+'-1-question.png'});
// (1)(3)(5) make follow-up
r = await say(p, "make it beep when it's too hot");
const pr2 = await proj(p);
console.log('\n[MAKE] reply', r.secs, JSON.stringify(r.reply?.slice(0,500)));
console.log('[MAKE] parts', pr2.parts.map(x=>x.id+':'+x.type).join(','));
const before = new Map(pr1.wires.map(w=>[w.id,wkey(w)]));
const changed=[]; for (const w of pr2.wires) if (before.has(w.id) && before.get(w.id)!==wkey(w)) changed.push(`${w.id}: ${before.get(w.id)} -> ${wkey(w)}`);
const removed=[...before.keys()].filter(id=>!pr2.wires.find(w=>w.id===id));
console.log('[MAKE] wires changed', changed, 'removed', removed.map(id=>before.get(id)));
console.log('[MAKE] OVERLAP', overlaps(await boxes()));
console.log('[MAKE] run btn', await p.textContent('button.run'));
await p.screenshot({path:OUT+tag+'-2-make.png'});
await p.waitForTimeout(4000);
console.log('[MAKE] serial tail', JSON.stringify((await p.textContent('[data-testid=serial]')).slice(-300)));
console.log('[MAKE] code has buzzer?', /buzz|tone|beep/i.test(Object.values(pr2.files).join('\n')));
// (4) move
r = await say(p, 'move button A to GPIO 14');
const pr3 = await proj(p);
console.log('\n[MOVE] reply', r.secs, JSON.stringify(r.reply?.slice(0,500)));
console.log('[MOVE] parts', pr3.parts.map(x=>x.id).join(','));
const btnW = pr3.wires.filter(w=>/btn|button/i.test(w.a.part+w.b.part)).map(wkey);
console.log('[MOVE] button wires', btnW);
console.log('[MOVE] features', JSON.stringify(pr3.features?.filter(f=>/button/i.test(f.kind+f.label)).map(f=>[f.label,f.pins])));
const code = Object.values(pr3.files).join('\n');
console.log('[MOVE] code pin lines', code.split('\n').filter(l=>/14|BTN|BUTTON/i.test(l)).slice(0,10));
console.log('[MOVE] OVERLAP', overlaps(await boxes()));
await p.screenshot({path:OUT+tag+'-3-move.png'});
await b.close();
