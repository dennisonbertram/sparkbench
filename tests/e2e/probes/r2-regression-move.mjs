import { open, OUT, parts, proj, say } from './r2-regression-lib.mjs';
const offline = process.argv[2]==='offline';
const {b,ctx,p} = await open(null);
if (offline) await p.route('**/api/status', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ai:{enabled:false}})}));
await p.goto('http://localhost:5173/?example=esp32-weather-imu&notour'); await p.waitForSelector('.part'); await p.waitForTimeout(1000);
const wkey = w=>`${w.a.part}:${w.a.pin}-${w.b.part}:${w.b.pin}`;
const tag = offline?'off':'ai2';
for (const s of ['move button A to GPIO 14', ...(offline?["make it beep when it's too hot",'make the text bigger','what is a DHT22?']:[])]){
  const before = await proj(p);
  const r = await say(p, s);
  const pr = await proj(p);
  console.log(`\n[${tag}] >> ${s} (${r.secs}s)\nREPLY: ${JSON.stringify(r.reply)}`);
  console.log('parts', pr.parts.map(x=>x.id).join(','));
  console.log('button wires', pr.wires.filter(w=>/pushbutton/.test(w.a.part+w.b.part)).map(wkey));
  console.log('code btn lines', Object.values(pr.files).join('\n').split('\n').filter(l=>/^btn|Pin\(1[34]/.test(l)));
  console.log('wires changed', pr.wires.filter(w=>{const o=before.wires.find(x=>x.id===w.id); return o && wkey(o)!==wkey(w);}).map(wkey));
  await p.screenshot({path:`${OUT}${tag}-${s.replace(/\W+/g,'_').slice(0,20)}.png`});
}
// press button A in sim to see if code responds
await p.click('button.run'); await p.waitForTimeout(3000);
const s0 = await p.textContent('[data-testid=serial]');
const btn = p.locator('.part[data-part=pushbutton1]'); const bb = await btn.boundingBox();
await p.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await p.mouse.down(); await p.waitForTimeout(400); await p.mouse.up(); await p.waitForTimeout(1500);
const s1 = await p.textContent('[data-testid=serial]');
console.log('serial before press', JSON.stringify(s0.slice(-300)), '\nafter press', JSON.stringify(s1.slice(-300)));
await p.screenshot({path:`${OUT}${tag}-pressA.png`});
await p.click('button:has-text("Fit")').catch(()=>{}); await p.waitForTimeout(500);
await p.screenshot({path:`${OUT}${tag}-fit.png`});
await b.close();
