import { chromium } from 'playwright';
const out = 'test-results/qa2/engineer';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto(`http://localhost:5173/?example=555-tone&notour`);
await page.waitForTimeout(2000);
await page.click('button.run');
await page.waitForTimeout(1000);
const bb = await page.locator('.momentary').first().boundingBox();
await page.mouse.move(bb.x + bb.width/2, bb.y + bb.height/2);
await page.mouse.down();
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/555-tone-held.png` });
const res = await page.evaluate(async () => {
  const { useStore } = await import('/src/ui/store.ts');
  const s = useStore.getState();
  const sc = s.sim.scope;
  const keys = Object.keys(sc[sc.length-1]?.v ?? {});
  return { n: sc.length, keys, sample: sc.slice(-400).map(x => [x.t, x.v]), parts: s.sim.parts, warnings: s.sim.warnings };
});
await page.mouse.up();
console.log('n', res.n, 'keys', res.keys);
console.log(JSON.stringify(res.parts).slice(0, 1500));
console.log('warnings', JSON.stringify(res.warnings));
// estimate freq from OUT key
const outKey = res.keys.find(k => /OUT/.test(k)) ?? res.keys[0];
const pts = res.sample;
const dts = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
console.log('scope dt median', dts.sort((a,b)=>a-b)[dts.length>>1]);
let rises = [];
for (let i = 1; i < pts.length; i++) { const a = pts[i-1][1][outKey], c = pts[i][1][outKey]; if (a < 4 && c >= 4) rises.push(pts[i][0]); }
console.log(outKey, 'rises', rises.length, rises.length > 1 ? 'f≈' + ((rises.length-1)/(rises.at(-1)-rises[0])).toFixed(1) : '');
await b.close();
