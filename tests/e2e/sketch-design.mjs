// E2E (live Claude): design from a hand sketch attached on the Welcome screen, no text.
import { chromium } from 'playwright';
const sketch = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" style="background:#fffef8;font-family:'Comic Sans MS','Marker Felt',cursive">
<path d="M120 90 q 300 -14 640 6 q 14 200 -4 410 q -330 12 -640 -4 q -12 -200 4 -412" fill="none" stroke="#222" stroke-width="4"/>
<rect x="190" y="140" width="300" height="160" rx="8" fill="none" stroke="#222" stroke-width="3"/>
<text x="230" y="215" font-size="44">23.5°C</text><text x="230" y="265" font-size="30">58% humid</text>
<text x="190" y="128" font-size="22">little OLED screen</text>
<circle cx="600" cy="190" r="34" fill="none" stroke="#222" stroke-width="3"/><text x="580" y="200" font-size="22">UP</text>
<circle cx="600" cy="290" r="34" fill="none" stroke="#222" stroke-width="3"/><text x="568" y="300" font-size="20">DOWN</text>
<text x="660" y="245" font-size="20">← set alarm temp</text>
<circle cx="260" cy="410" r="40" fill="none" stroke="#222" stroke-width="3"/><path d="M240 410 q 20 -30 40 0" fill="none" stroke="#222" stroke-width="3"/><text x="320" y="420" font-size="22">beeper if too hot!</text>
<rect x="560" y="380" width="70" height="60" fill="none" stroke="#222" stroke-width="3"/><text x="540" y="470" font-size="20">temp+humidity sensor</text>
<text x="300" y="560" font-size="26">powered by USB</text></svg>`;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.setContent(`<body style="margin:0">${sketch}</body>`);
await p.locator('svg').screenshot({ path: 'test-results/sketch.png' });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:5173/?welcome&notour');
await p.evaluate(() => localStorage.clear());
await p.goto('http://localhost:5173/?notour');
await p.setInputFiles('.hero-attach [data-testid=attach-input]', 'test-results/sketch.png');
await p.waitForSelector('.hero-attach .attach-thumb img');
await p.click('.hero-input button[type=submit]');
const r = await Promise.race([
  p.waitForSelector('[data-testid=requirements]', { timeout: 400000 }).then(() => 'designed'),
  p.waitForSelector('[data-testid=questions]', { timeout: 400000 }).then(() => 'questions'),
]);
if (r === 'questions') {
  await p.click('[data-testid=questions-go]');
  await p.waitForSelector('[data-testid=requirements]', { timeout: 400000 });
}
await p.waitForTimeout(1500);
const parts = await p.evaluate(() => window.__sparkbench.getState().project.parts.map((x) => x.type));
const reply = await p.locator('.msg.ai').last().textContent();
console.log('parts:', parts.join(', '));
console.log('reply:', reply.replace(/\s+/g, ' ').slice(0, 500));
await p.screenshot({ path: 'test-results/sketch-design.png' });
console.log('errors:', errors);
await b.close();
const want = ['ssd1306', 'pushbutton', 'buzzer', 'dht22'];
const pass = want.every((t) => parts.includes(t)) && parts.filter((t) => t === 'pushbutton').length >= 2 && !errors.length;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
