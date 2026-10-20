import { open, OUT, parts, proj, say } from './r3-regression-lib.mjs';
const {b,ctx,p} = await open('?example=esp32-weather-imu&notour');
await p.waitForSelector('.part');
const wkey = w=>`${w.a.part}:${w.a.pin}-${w.b.part}:${w.b.pin}`;
const pinsOf = pr => { const m={}; for (const w of pr.wires) { m[w.id]=wkey(w); } return m; };
let before = await proj(p);
console.log('BTN wires before', before.wires.filter(w=>/button/i.test(w.a.part+w.b.part)).map(wkey));
let r = await say(p, 'move button A to GPIO 14');
let pr = await proj(p);
console.log(`\n[MOVE] ${r.secs}s REPLY: ${JSON.stringify(r.reply)}`);
console.log('BTN wires after', pr.wires.filter(w=>/button/i.test(w.a.part+w.b.part)).map(wkey));
const code = Object.values(pr.files).join('\n');
console.log('code button lines', code.split('\n').filter(l=>/btn|button|Pin\(1[2-5]/i.test(l)).slice(0,12));
await p.screenshot({path:OUT+'ai-move-1.png'});
// highlight button A on breadboard
const btnIds = pr.parts.filter(x=>/button/i.test(x.type)).map(x=>x.id+':'+x.type+':'+(x.label||x.props?.label||''));
console.log('button parts', btnIds);
// follow-up: add part
before = pr;
r = await say(p, "add a buzzer that beeps when it's too hot");
pr = await proj(p);
console.log(`\n[ADD] ${r.secs}s REPLY: ${JSON.stringify(r.reply)}`);
const bm = pinsOf(before), am = pinsOf(pr);
const changed = Object.keys(bm).filter(k=>am[k] && am[k]!==bm[k]).map(k=>`${bm[k]} -> ${am[k]}`);
const removed = Object.keys(bm).filter(k=>!am[k]).map(k=>bm[k]);
console.log('wires changed', changed, '\nremoved', removed);
const newParts = pr.parts.filter(x=>!before.parts.find(y=>y.id===x.id)).map(x=>x.id+':'+x.type);
console.log('new parts', newParts);
const vp = p.viewportSize();
for (const np of pr.parts.filter(x=>!before.parts.find(y=>y.id===x.id))) {
  const bb = await p.locator(`.part[data-part="${np.id}"]`).boundingBox().catch(()=>null);
  const canvas = await p.locator('.center').boundingBox().catch(()=>null);
  console.log('new part box', np.id, JSON.stringify(bb), 'center', JSON.stringify(canvas));
}
await p.screenshot({path:OUT+'ai-move-2-add.png'});
// item 5: reload
const msgsBefore = await p.locator('.msg').allInnerTexts();
await p.reload(); await p.waitForTimeout(3000);
const msgsAfter = await p.locator('.msg').allInnerTexts();
console.log('\n[RELOAD] msgs before', msgsBefore.length, 'after', msgsAfter.length);
console.log('after texts', JSON.stringify(msgsAfter.map(m=>m.slice(0,80))));
await p.screenshot({path:OUT+'ai-move-3-reload.png'});
await b.close();
