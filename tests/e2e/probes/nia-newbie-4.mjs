import { chromium } from 'playwright';
const D='test-results/qa/nia-newbie/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 820 } });
await ctx.addInitScript(()=>{try{localStorage.setItem('sparkbench.tour.done','1')}catch{}});
const p = await ctx.newPage();
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push('pageerror: '+e.message));
await p.goto('http://localhost:5173/?welcome');
await p.fill('.hero-input textarea','a thermometer with a screen for my desk');
await p.click('button.primary.big'); await p.waitForSelector('.part'); await p.waitForTimeout(800);
// Stale sim check: run then replace design
await p.click('button.run'); await p.waitForTimeout(2000);
async function ask(q){ await p.fill('.composer textarea', q); await p.press('.composer textarea','Enter'); await p.waitForTimeout(3000);
  const msgs = await p.$$eval('[data-tour=copilot] .msg, [data-tour=copilot] [class*=msg]', es=>es.map(e=>e.innerText));
  console.log('\n=== Q:', q, '\nLAST:', msgs.slice(-2).join(' || '));
  console.log('PARTS', await p.$$eval('.part', es=>es.map(e=>e.getAttribute('data-part'))), 'TITLE', await p.title()); }
await ask("make it beep when it's too hot");
const s1 = await p.innerText('[data-testid=serial]'); await p.waitForTimeout(3000); const s2 = await p.innerText('[data-testid=serial]');
console.log('serial grew with stale Temp lines?', s2.length>s1.length, JSON.stringify(s2.slice(-120)));
console.log('code tab text:'); await p.click('.tabs button:has-text("Code")'); await p.waitForTimeout(800);
console.log((await p.innerText('main, .center, body')).match(/import[\s\S]{0,900}/)?.[0]);
await p.screenshot({ path: D+'30-code-after-beep.png' });
await p.click('.tabs button:has-text("Breadboard")');
// undo
await p.click('button:has-text("Undo")'); await p.waitForTimeout(800);
console.log('after undo parts', await p.$$eval('.part', es=>es.map(e=>e.getAttribute('data-part'))));
await ask("add a buzzer that beeps when it's too hot");
await ask("beep when the temperature is above 30");
await ask("how much will this cost?");
await ask("what is a DHT22?");
await ask("why do I need an ESP32?");
await ask("make the text bigger");
await p.screenshot({ path: D+'31-chat.png' });
// code after buzzer
await p.click('.tabs button:has-text("Code")'); await p.waitForTimeout(800);
await p.screenshot({ path: D+'32-code-buzzer.png' });
const code = await p.evaluate(()=>{const s=window.__store||null; return document.querySelector('.cm-content')?.innerText||''});
console.log('CODE:\n', code.slice(0,3000));
await p.click('.tabs button:has-text("Breadboard")');
if ((await p.innerText('button.run')).includes('Run')) await p.click('button.run'); else { await p.click('text=Restart'); }
await p.waitForTimeout(1500);
await p.locator('input[aria-label=Temperature]').first().fill('40'); await p.waitForTimeout(3000);
console.log('SERIAL 40C:', await p.innerText('[data-testid=serial]'));
await p.screenshot({ path: D+'33-hot.png' });
console.log('ERRS', errs);
await ctx.storageState({ path: D+'state3.json' });
await b.close();
