import { open, serial } from './r2-ai-builder-1-lib.mjs';
const [proj='reaction', wrong] = process.argv.slice(2);
const { p, shot, close } = await open(proj);
console.log(await p.evaluate(() => document.querySelector('.inspector, aside:last-of-type')?.innerText));
await p.click('button.run');
const btnFor = { led1: 'pushbutton1', led2: 'pushbutton2', led3: 'pushbutton3' };
const fire = (id, ev) => p.evaluate(([id, ev]) => { const e = document.querySelector(`.part[data-part="${id}"]`); const t = [...e.querySelectorAll('*')].find(n => n.tagName.includes('-')); t.dispatchEvent(new Event(ev)); }, [id, ev]);
let rounds = 0; const t0 = Date.now();
while (rounds < 6 && Date.now() - t0 < 60000) {
  const lit = await p.evaluate(() => [...document.querySelectorAll('.part[data-part^=led] wokwi-led')].filter(e => e.value).map(e => e.closest('.part').dataset.part));
  if (lit.length === 1) {
    let b = btnFor[lit[0]];
    if (wrong && rounds === 1) b = b === 'pushbutton1' ? 'pushbutton2' : 'pushbutton1';
    await p.waitForTimeout(150);
    await fire(b, 'button-press'); await p.waitForTimeout(120); await fire(b, 'button-release');
    rounds++; console.log('round', rounds, 'lit', lit, 'pressed', b);
    if (rounds === 1) await shot('03-round1');
    await p.waitForTimeout(800);
  }
  await p.waitForTimeout(40);
}
await p.waitForTimeout(3000);
await shot('04-game-end' + (wrong ? '-wrong' : ''));
console.log('SERIAL>>>\n' + await serial(p));
await close();
