import { chromium } from 'playwright';
const out = 'test-results/qa2/engineer';
const b = await chromium.launch();
for (const id of process.argv.slice(2)) {
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto(`http://localhost:5173/?example=${id}&notour`);
await page.waitForTimeout(2000);
await page.click('button.run');
await page.waitForTimeout(6000);
const st = await page.evaluate(async () => { const { useStore } = await import('/src/ui/store.ts'); const s = useStore.getState().sim; return { nets: s.nets, parts: s.parts, pins: s.pins, serial: s.serial.slice(-15) }; });
console.log('=====', id, JSON.stringify(st, null, 0).slice(0, 3000));
await page.screenshot({ path: `${out}/${id}-serial.png` });
await page.close();
}
await b.close();
