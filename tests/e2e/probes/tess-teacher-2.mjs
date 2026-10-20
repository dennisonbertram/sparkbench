import { chromium } from 'playwright';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const OUT = 'test-results/qa/tess-teacher';
const ids = ['esp32-weather-imu','pico-traffic-light','rpi-thermostat','555-blinker','esp32-neopixel-thermo'];
const browser = await chromium.launch();
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`http://localhost:5173/?example=${id}&notour`);
  await page.waitForSelector('.part'); await page.waitForTimeout(800);
  const res = await page.evaluate(() => {
    const pins = [...document.querySelectorAll('circle.pin')].map(c => { const r = c.getBoundingClientRect(); return { id: c.getAttribute('data-pin'), x: r.x + r.width/2, y: r.y + r.height/2 }; });
    const wires = [...document.querySelectorAll('path.wire-core')].map(p => {
      const L = p.getTotalLength(); const m = p.getScreenCTM();
      const pt = (s) => { const q = p.getPointAtLength(s); return { x: q.x*m.a + q.y*m.c + m.e, y: q.x*m.b + q.y*m.d + m.f }; };
      return { stroke: p.getAttribute('stroke'), a: pt(0), b: pt(L) };
    });
    const near = (q) => pins.map(p => ({ id: p.id, d: Math.hypot(p.x-q.x, p.y-q.y) })).sort((u,v)=>u.d-v.d)[0];
    return wires.map(w => ({ stroke: w.stroke, a: near(w.a), b: near(w.b) }));
  });
  const jf = readdirSync(join(OUT,id)).find(f => f.endsWith('.json'));
  const proj = JSON.parse(readFileSync(join(OUT,id,jf),'utf8'));
  let mism = 0;
  proj.wires.forEach((w, i) => {
    const r = res[i]; const exp = [`${w.a.part}:${w.a.pin}`, `${w.b.part}:${w.b.pin}`].sort().join(' ');
    const got = r ? [r.a.id, r.b.id].sort().join(' ') : 'none';
    if (exp !== got || (r && (r.a.d > 6 || r.b.d > 6))) { mism++; console.log(id, w.id, 'expected', exp, 'drawn', got, r && r.a.d.toFixed(1), r && r.b.d.toFixed(1)); }
  });
  console.log(id, 'wires', proj.wires.length, 'drawn', res.length, 'mismatches', mism);
  // blog schematic screenshot
  await page.click('.tabs button:has-text("Blog post")');
  await page.waitForSelector('[data-testid=doc-blog] .schematic');
  await page.locator('[data-testid=doc-blog] .schematic').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, id, 'blog-schematic.png') });
  await page.close();
}
// I3: import the exported json into a fresh session
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/?example=pico-traffic-light&notour');
await page.waitForSelector('.part');
await page.click('button.brand');
await page.waitForSelector('.projects-menu');
await page.screenshot({ path: join(OUT, 'projects-menu.png') });
const jf = join(OUT, 'rpi-thermostat', readdirSync(join(OUT,'rpi-thermostat')).find(f => f.endsWith('.json')));
page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss(); });
await page.setInputFiles('.projects-menu input[type=file]', jf);
await page.waitForTimeout(1500);
console.log('title after import:', await page.locator('header.topbar').innerText());
console.log('parts on canvas:', await page.locator('.part').count());
await page.screenshot({ path: join(OUT, 'after-import.png') });
// import the zip-contained json too
await page.click('button.brand'); await page.waitForSelector('.projects-menu');
await page.setInputFiles('.projects-menu input[type=file]', join(OUT,'unz/555-blinker/555-led-blinker/project.sparkbench.json'));
await page.waitForTimeout(1500);
console.log('title after zip-json import:', (await page.locator('header.topbar').innerText()).split('\n').slice(0,3).join(' | '));
await page.click('button.brand'); await page.waitForSelector('.projects-menu');
console.log('projects menu:', await page.locator('.projects-menu').innerText());
await page.screenshot({ path: join(OUT, 'projects-menu-after.png') });
await browser.close();
