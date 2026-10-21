// E2E: a board knows what it was built from. Unreleased boards say "Draft"; releasing a revision asks for a
// rebuild (not "you changed the design"); after a reload a design change still marks the board out of date.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); ok &&= !!cond; };
const U = 'http://localhost:5173/';
await p.goto(`${U}?example=pico-traffic-light&notour`);
await p.evaluate(() => localStorage.clear());
await p.goto(`${U}?example=pico-traffic-light&notour`);
await p.waitForSelector('.part');
await p.click('.tabs button:has-text("Circuit board")');
await p.click('[data-testid=pcb-build]');
// A board built earlier by another test is reused and can arrive before the progress list shows.
await p.waitForSelector('[data-testid=pcb-progress], [data-testid=pcb-result]');
// While it runs, the last step must never show as done.
let early = false;
while (!(await p.locator('[data-testid=pcb-result]').count())) {
  const n = await p.locator('[data-testid=pcb-progress] li').count();
  const lastDone = n && (await p.locator('[data-testid=pcb-progress] li').last().getAttribute('class')) === 'done';
  if (lastDone && !(await p.locator('[data-testid=pcb-result]').count())) early = true;
  await p.waitForTimeout(400);
}
check(!early, 'Progress keeps the last step running until the board arrives');
const fileUrl = async (path) => {
  const job = await p.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith('sb-pcb-job-'))?.[1]);
  return `${U}api/pcb/file?id=${job}&path=${encodeURIComponent(path)}`;
};
const test = await (await fetch(`${await fileUrl('TEST.md')}&view`)).text();
check(/<h1>.*Draft/.test(test) && /text\/html|<!doctype/i.test(test), 'Test procedure opens as a page and says Draft before any release');
const job = await p.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith('sb-pcb-job-'))?.[1]);
const st = await (await fetch(`${U}api/pcb/status?id=${job}`)).json();
const pcbPath = st.result.files.find((f) => /\.kicad_pcb$/.test(f) && !/panel/.test(f));
const pcbText = await (await fetch(await fileUrl(pcbPath))).text();
check(/LED_D5\.0mm_Yellow\.step/.test(pcbText) && /LED_D5\.0mm_Green\.step/.test(pcbText), 'Yellow and green LEDs use coloured 3D models');
check(!(await p.locator('[data-testid=pcb-stale]').count()), 'A fresh board is not marked out of date');
const minor = await p.locator('[data-testid=pcb-minor]').textContent().catch(() => '');
if (minor) check(!/[a-z]\s[A-Z]/.test(minor.replace(/minor notes:/, '')) || /\.\s/.test(minor), `Minor notes read as sentences (${minor.slice(0, 80)})`);
// Release Rev A: the board asks for a rebuild to print the letter, not "you changed the design".
await p.click('[data-testid=revisions] summary');
await p.click('[data-testid=rev-release]');
await p.waitForSelector('[data-testid=pcb-rev-stale]');
check(!(await p.locator('[data-testid=pcb-stale]').count()), 'Releasing a revision does not claim the design changed');
check(/Rebuild so the board prints Rev A/.test(await p.textContent('[data-testid=pcb-build]')), 'Button offers to rebuild so the board prints Rev A');
const date = await p.textContent('.rev-history li');
const d = new Date();
const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
check(date.includes(local), `Revision date is today's local date (${local})`);
// Reload, then change a part: the board is out of date.
await p.reload();
await p.waitForSelector('.part');
await p.click('.tabs button:has-text("Circuit board")');
await p.waitForSelector('[data-testid=pcb-result]', { timeout: 30000 });
await p.evaluate(() => {
  const s = window.__sparkbench.getState();
  const r = s.project.parts.find((x) => x.type === 'resistor');
  s.setPartProp(r.id, 'ohms', 330);
});
await p.waitForSelector('[data-testid=pcb-stale]');
check(/Update the board/.test(await p.textContent('[data-testid=pcb-build]')), 'After a reload, a design change marks the board out of date');
await p.screenshot({ path: 'test-results/pcb-revisions.png' });
console.log('errors:', errors);
await b.close();
process.exit(ok && !errors.length ? 0 : 1);
