// E2E: upload breadboard photos in the Build guide and check Claude's verdict.
// Uses the rendered eval boards (npx tsx scripts/vision-eval/render.ts) for the Pico traffic light.
import { chromium } from 'playwright';
const IMG = 'test-results/vision/images';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:5173/?example=pico-traffic-light&notour');
await p.waitForSelector('.part');
await p.click('.tabs button:has-text("Build guide")');
await p.waitForSelector('[data-testid=photo-check]');
await p.screenshot({ path: 'test-results/photo-check-empty.png' });

async function check(file) {
  await p.setInputFiles('[data-testid=photo-input]', `${IMG}/${file}`);
  await p.click('[data-testid=photo-check] button:has-text("Check wiring")');
  await p.waitForSelector('[data-testid=photo-result], [data-testid=photo-check] .banner.error', { timeout: 240000 });
  const text = await p.textContent('[data-testid=photo-check]');
  const verdict = await p.getAttribute('[data-testid=photo-result]', 'class').catch(() => 'error');
  await p.screenshot({ path: `test-results/photo-check-${file.split('.')[0]}.png` });
  console.log(`\n== ${file}: ${verdict}\n${text.replace(/\s+/g, ' ').slice(0, 900)}`);
  return { verdict, text };
}
const bad = await check('traffic__missing-wire__photo.jpg');
const good = await check('traffic__ok__photo.jpg');
console.log('\nerrors:', errors);
await b.close();
const pass = /problems/.test(bad.verdict) && /B-45|j45|D3|green/i.test(bad.text) && /looks-right/.test(good.verdict) && !/problems/.test(good.verdict) && !errors.length;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
