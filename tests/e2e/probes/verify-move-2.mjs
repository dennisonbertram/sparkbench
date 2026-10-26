import { chromium } from 'playwright';
const OUT='test-results/qa/verify-move/off-';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1400,height:900}}); await p.route('**/api/status', r => r.fulfill({json:{ai:{enabled:false}}}));
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('.hero-input textarea', 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU');
await p.click('button.primary.big');
await p.waitForSelector('.part', { timeout: 30000 });
await p.waitForTimeout(1500);
async function proj() { return p.evaluate(() => { const id = localStorage.getItem('sparkbench.current.v1'); return JSON.parse(localStorage.getItem('sparkbench.projects.v1'))[id]; }); }
async function say(s){ await p.fill('.composer textarea', s); await p.press('.composer textarea', 'Enter'); await p.waitForTimeout(4000);
 const m = await p.locator('.ds-msg-bubble').allInnerTexts(); const pr=await proj();
 console.log('\n>>', s, '\n', m[m.length-1], '\nFEAT', JSON.stringify(pr.features?.map(f => [f.label, f.pins])));
 console.log('parts', await p.locator('.part').evaluateAll(es=>es.map(e=>e.dataset.part).join(',')));
 console.log('code pins', (pr.files['main.py']||pr.files['sketch.ino']||'').split('\n').filter(l=>/Pin\(|BUTTON|button/i.test(l)).join(' | '));
}
await say('add a buzzer');
await say('use a Raspberry Pi Pico instead');
await p.screenshot({ path: OUT + '1-before.png' });
await say('move button A to GP14');
await p.screenshot({ path: OUT + '2-moveA.png' });
await say('move the button to GPIO 14');
await p.screenshot({ path: OUT + '3-move2.png' });
await b.close();
