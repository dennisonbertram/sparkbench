import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const out = 'test-results/qa/labelrepro';
for (const ex of ['pico-traffic-light','esp32-parking-sensor','555-blinker']) {
  await p.goto(`http://localhost:5173/?example=${ex}&notour`);
  await p.waitForSelector('.part', { timeout: 15000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/${ex}.png` });
  // label overlap analysis
  const info = await p.evaluate(() => {
    const tags = [...document.querySelectorAll('.part-tag, [class*=tag], [class*=label]')].filter(e => e.closest('svg') || e.closest('.canvas, .breadboard'));
    const r = tags.map(t => { const b = t.getBoundingClientRect(); return { cls: t.getAttribute('class'), text: t.textContent.trim().slice(0,30), x: b.x|0, y: b.y|0, w: b.width|0, h: b.height|0 }; }).filter(o=>o.w>0);
    const ov = [];
    for (let i=0;i<r.length;i++) for (let j=i+1;j<r.length;j++){const a=r[i],c=r[j]; if(a.x<c.x+c.w&&c.x<a.x+a.w&&a.y<c.y+c.h&&c.y<a.y+a.h && !a.text.includes(c.text) && !c.text.includes(a.text)) ov.push([a.text,c.text]);}
    return { n: r.length, sample: r.slice(0,40), ov };
  });
  console.log(ex, JSON.stringify(info));
}
await b.close();
