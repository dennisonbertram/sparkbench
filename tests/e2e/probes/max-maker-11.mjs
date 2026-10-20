import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 })).newPage();
await p.goto('http://localhost:5173/?example=esp32-weather-imu&notour');
await p.waitForSelector('.part'); await p.waitForTimeout(800);
await p.click('button.run'); await p.waitForTimeout(3000);
const bb = await p.locator('.part[data-part=ssd13061]').boundingBox();
await p.screenshot({ path: 'test-results/qa/max-maker/75-oled-zoom.png', clip: bb });
await b.close();
