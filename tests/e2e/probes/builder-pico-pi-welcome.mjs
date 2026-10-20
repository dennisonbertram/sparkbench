import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('console', (m) => console.log('console', m.type(), m.text()));
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('request', (r) => { if (!/\.(ts|tsx|js|css|svg|png|woff2?)(\?|$)/.test(r.url()) && !r.url().includes('@')) console.log('req', r.method(), r.url()); });
await p.goto('http://localhost:5173/?welcome&notour');
await p.fill('textarea', process.argv[2]);
await p.click('button.primary.big'); await p.waitForTimeout(700); await p.screenshot({ path: 'test-results/qa/builder-pico-pi/welcome-after-click.png' });
for (let i = 0; i < 10; i++) { await p.waitForTimeout(2000); const n = await p.locator('.part').count(); console.log('t', (i+1)*2, 'parts', n); if (n) break; }
await p.screenshot({ path: 'test-results/qa/builder-pico-pi/welcome-retry.png' });
await b.close();
