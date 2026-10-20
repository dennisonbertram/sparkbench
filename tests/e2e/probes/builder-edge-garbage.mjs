import { chromium } from 'playwright';
const prompt = process.argv[2];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('response', async (r) => { if (r.url().includes('/api/ai/design')) console.log('RESP', r.status(), (await r.text().catch(()=>'')).slice(0, 1500)); });
await p.goto('http://localhost:5173/?welcome&notour'); await p.waitForTimeout(800);
await p.fill('.hero-input textarea', prompt);
await p.click('button.primary.big');
for (let i = 0; i < 150; i++) { await p.waitForTimeout(1000); if (await p.locator('.composer textarea').count()) { console.log('workspace at', i); break; } }
await p.waitForTimeout(3000);
await p.screenshot({ path: `test-results/qa/builder-edge/${process.argv[3]}.png` });
console.log('composer', await p.locator('.composer textarea').count(), 'body:', (await p.locator('body').innerText()).replace(/\s+/g,' ').slice(0, 300));
await b.close();
