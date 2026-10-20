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
await p.fill('.composer textarea', "add a buzzer that beeps when it's too hot"); await p.press('.composer textarea','Enter'); await p.waitForTimeout(2500);
console.log('CHAT LAST:', (await p.innerText('[data-tour=copilot]')).slice(-700));
await p.click('.tabs button:has-text("Code")'); await p.waitForTimeout(800);
const code = await p.evaluate(()=>document.querySelector('.cm-content')?.innerText||document.querySelector('textarea')?.value||'');
console.log('CODE (buzzer/temp lines):\n', code.split('\n').filter(l=>/buzz|beep|tone|temp|hot|THRESH|> ?\d/i.test(l)).join('\n'));
await p.click('.tabs button:has-text("Breadboard")');
await p.click('button.run'); await p.waitForTimeout(1500);
await p.locator('input[aria-label=Temperature]').first().fill('45'); await p.waitForTimeout(3000);
console.log('SERIAL 45C:', (await p.innerText('[data-testid=serial]')).slice(-300));
const bz = await p.$eval('.part[data-part=buzzer1]', e=>e.outerHTML.slice(0,400)).catch(()=> 'none');
console.log('BUZZ el', bz);
await p.screenshot({ path: D+'40-hot45.png' });
await p.click('button.run'); // stop
for (const t of ['Schematic','Parts list','Build guide','Blog post']){
  await p.click(`.tabs button:has-text("${t}")`); await p.waitForTimeout(1000);
  await p.screenshot({ path: D+`41-${t.replace(' ','_')}.png` });
  const txt = await p.innerText('.center, main').catch(()=>'');
  console.log(`\n#### TAB ${t}:\n`, txt.slice(0,2500));
}
await p.click('.console-tabs button:has-text("Problems")'); await p.waitForTimeout(300);
console.log('PROBLEMS', await p.innerText('[data-testid=problems]'));
console.log('ERRS', errs);
await b.close();
