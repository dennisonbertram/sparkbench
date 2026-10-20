import { open, OUT } from './max-maker-lib.mjs';
const { b, p, errs } = await open('http://localhost:5173/?example=esp32-weather-imu&notour');


await p.waitForSelector('.part', { timeout: 240000 });

console.log('badge', await p.locator('.ai-badge').innerText());
const t0 = Date.now();
await p.fill('.composer textarea', 'move button A to GPIO 14'); await p.press('.composer textarea', 'Enter');
await p.waitForFunction(() => { const m=[...document.querySelectorAll('.msg-text')]; return m.length >= 2 && !/designing/i.test(m[m.length-1].innerText); }, null, { timeout: 240000 }).catch(e => console.log('wait fail', e.message));
console.log('secs', (Date.now()-t0)/1000);
await p.waitForTimeout(1000);
await p.screenshot({ path: OUT + '62-claude-move-button.png' });
const pr = await p.evaluate(() => { const id = localStorage.getItem('sparkbench.current.v1'); return JSON.parse(localStorage.getItem('sparkbench.projects.v1'))[id]; }); console.log('REPLY', (await p.locator('.msg-text').allInnerTexts()).slice(-1)[0]); console.log('FEAT', JSON.stringify(pr.features.map(f=>[f.label,f.pins]))); console.log('WIRES', pr.wires.filter(w=>/pushbutton/.test(w.a.part+w.b.part)).map(w => w.a.part+':'+w.a.pin+'-'+w.b.part+':'+w.b.pin).join(' ')); console.log('code', pr.files['main.py'].split('\n').filter(l=>/btn_a = /.test(l)).join());
console.log('ERRS', errs.join('\n'));
await b.close();
