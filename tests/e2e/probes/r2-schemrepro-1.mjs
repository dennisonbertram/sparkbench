import { chromium } from 'playwright';
const out = 'test-results/qa2/schem-repro';
const b = await chromium.launch();
for (const [w,h] of [[1440,900],[1024,768]]) for (const ex of ['rpi-plant-waterer','esp32-weather-imu']) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.goto(`http://localhost:5173/?example=${ex}&notour`);
  await p.waitForTimeout(2500);
  await p.locator('.tabs button', { hasText: 'Schematic' }).click();
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const svg = document.querySelector('.schematic svg');
    if (!svg) return { nosvg: true, html: document.querySelector('main')?.innerHTML.slice(0,300) };
    const sb = svg.getBoundingClientRect();
    const hs = [...svg.querySelectorAll('text')].map(t => t.getBoundingClientRect().height).filter(x=>x>0).sort((a,b)=>a-b);
    const ctrls = [...document.querySelectorAll('button')].filter(b=>b.offsetParent && /^(\+|−|-|Fit|Zoom)/i.test(b.textContent.trim()) ).map(b=>b.textContent.trim());
    const host = svg.parentElement;
    return { svgW: sb.width, svgH: sb.height, n: hs.length, min: hs[0], med: hs[hs.length>>1], max: hs.at(-1), ctrls, hostClass: host.className, viewBox: svg.getAttribute('viewBox') };
  });
  const box0 = await p.locator('.schematic svg').boundingBox();
  // try wheel zoom
  if (box0) { await p.mouse.move(box0.x+box0.width/2, box0.y+box0.height/2); await p.keyboard.down('Control'); await p.mouse.wheel(0,-500); await p.keyboard.up('Control'); await p.mouse.wheel(0,-300); await p.waitForTimeout(500); }
  const box1 = await p.locator('.schematic svg').boundingBox();
  console.log(w, ex, JSON.stringify(r), 'before', JSON.stringify(box0), 'afterWheel', JSON.stringify(box1));
  await p.screenshot({ path: `${out}/${w}-${ex}.png` });
  await p.close();
}
await b.close();
