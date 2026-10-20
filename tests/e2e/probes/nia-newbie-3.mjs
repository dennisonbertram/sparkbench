import { chromium } from 'playwright';
const D='test-results/qa/nia-newbie/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 820 }, storageState: D+'state.json' });
const p = await ctx.newPage();
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push('pageerror: '+e.message));
await p.goto('http://localhost:5173/');
await p.waitForSelector('.part'); await p.waitForTimeout(800);
console.log('tour visible?', !!(await p.$('.tour-card')));
// jargon tooltips?
console.log('elements with title/abbr in copilot+project:', await p.$$eval('[data-tour=copilot] [title], [data-tour=copilot] abbr, .project [title], abbr, [data-term], .term', es=>es.map(e=>e.tagName+':'+(e.getAttribute('title')||e.textContent).slice(0,60))));
// why it's wired
await p.click('text=Why it\'s wired this way'); await p.waitForTimeout(300);
await p.screenshot({ path: D+'20-why.png' });
await p.click('button.run'); await p.waitForTimeout(2500);
const slider = p.locator('input[aria-label=Temperature]').first();
await slider.fill('38');
await p.waitForTimeout(3500);
await p.screenshot({ path: D+'21-temp38.png' });
console.log('SERIAL after 38:\n', await p.innerText('[data-testid=serial]'));
async function ask(q, shot){
  await p.fill('.composer textarea', q); await p.press('.composer textarea','Enter');
  await p.waitForTimeout(3500);
  const msgs = await p.$$eval('[data-tour=copilot] .msg, [data-tour=copilot] [class*=msg]', es=>es.map(e=>e.innerText));
  console.log('\n=== Q:', q, '\nLAST:', msgs.slice(-1)[0]);
  console.log('PARTS', await p.$$eval('.part', es=>es.map(e=>e.getAttribute('data-part'))));
  await p.screenshot({ path: D+shot });
}
await ask('make it beep when it\'s too hot', '22-beep.png');
await ask('what does the resistor do?', '23-resistor.png');
await ask('what is I2C?', '24-i2c.png');
await ask('what do I need to buy?', '25-buy.png');
await ask('how do I build it?', '26-build.png');
console.log('running state:', await p.innerText('.run-group').catch(()=>'?'));
console.log('ERRS', errs);
await ctx.storageState({ path: D+'state2.json' });
await b.close();
