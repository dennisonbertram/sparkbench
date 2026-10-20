// Zoomed crop of a region of the breadboard after optional run. Usage:
// node r3-visual-zoom.mjs id x y w h out [--run] [--dark]
import { chromium } from 'playwright';
const [id, x, y, w, h, out] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: process.argv.includes('--dark') ? 'dark' : 'light' });
const page = await ctx.newPage();
await page.goto(`http://localhost:5173/?example=${id}&notour`);
await page.waitForSelector('[data-testid="breadboard"] .part');
await page.waitForTimeout(900);
if (process.argv.includes('--run')) { await page.click('button.run'); await page.waitForTimeout(4000); }
await page.screenshot({ path: out, clip: { x: +x, y: +y, width: +w, height: +h } });
await browser.close();
