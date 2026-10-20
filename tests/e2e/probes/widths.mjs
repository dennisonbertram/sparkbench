// Screenshot welcome + one example at narrow widths, in light and dark.
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [w, h] of [[1024, 768], [800, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme })).newPage();
    await p.goto('http://localhost:5173/?example=esp32-weather-imu&notour');
    await p.waitForSelector('.part');
    await p.waitForTimeout(700);
    await p.screenshot({ path: `test-results/widths/${w}-${scheme}.png` });
    await p.close();
  }
}
await b.close();
