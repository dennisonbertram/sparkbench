import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
async function open(id) { await page.goto(`http://localhost:5173/?example=${id}&notour`); await page.waitForSelector('[data-testid="breadboard"] .part'); await page.waitForTimeout(800); }
await open('esp32-neopixel-thermo');
await page.click('button.run'); await page.waitForTimeout(5000);
const ring = page.locator('.part[data-part]').filter({ hasText: '' });
const info = await page.$$eval('.part[data-part]', els => els.map(e => ({ part: e.getAttribute('data-part'), fills: [...new Set([...e.querySelectorAll('[fill]')].map(n => n.getAttribute('fill')))].slice(0, 30) })));
console.log(JSON.stringify(info.filter(i => /D1|ring|neo/i.test(i.part)), null, 1));
await page.locator('[data-testid="breadboard"]').screenshot({ path: 'test-results/qa3/visual/zoom/neopixel-running.png' });
// slide temp to max
const sliders = page.locator('input[type=range]');
await sliders.first().fill('40').catch(e => console.log('fill err', e.message));
await page.waitForTimeout(2500);
await page.locator('[data-testid="breadboard"]').screenshot({ path: 'test-results/qa3/visual/zoom/neopixel-hot.png' });
console.log((await page.textContent('[data-testid="serial"]')).slice(-200));
await open('555-tone');
console.log('555-tone summary:', (await page.textContent('body')).match(/555 blinker[^.]*\./)?.[0]);
await page.click('button.run'); await page.waitForTimeout(4500);
await page.screenshot({ path: 'test-results/qa3/visual/zoom/555-tone-scope.png', clip: { x: 320, y: 710, width: 820, height: 190 } });
await page.getByRole('button', { name: 'Press' }).first().dispatchEvent('pointerdown').catch(() => {});
await page.getByRole('button', { name: 'Press' }).first().dispatchEvent('mousedown').catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'test-results/qa3/visual/zoom/555-tone-scope-pressed.png', clip: { x: 320, y: 710, width: 820, height: 190 } });
await browser.close();
