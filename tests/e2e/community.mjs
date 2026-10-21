// E2E: two people on one Sparkbench server. Gallery (publish → browse → remix), live editing with
// comments, and a class assignment graded in the simulator (live Claude) with the teacher dashboard.
import { chromium } from 'playwright';
const b = await chromium.launch();
const errors = [];
async function person(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((n) => localStorage.setItem('sb-name', n), name);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('dialog', (d) => d.accept());
  return p;
}
const ada = await person('Ada');
const ben = await person('Ben');
const URL0 = 'http://localhost:5173/';
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); ok &&= !!cond; };

// ---- gallery
await ada.goto(`${URL0}?example=pico-night-light&notour`);
await ada.waitForSelector('.part');
await ada.click('.brand');
await ada.click('[data-testid=menu-publish]');
await ada.fill('.modal textarea', 'A lamp that turns on when it gets dark.');
await ada.click('[data-testid=publish-go]');
await ada.waitForSelector('[data-testid=publish-done]');
await ada.keyboard.press('Escape');
await ben.goto(`${URL0}?welcome&notour`);
await ben.waitForSelector('[data-testid=community-gallery]');
const card = ben.locator('[data-testid=community-gallery] .card', { hasText: 'Night light' }).first();
check(await card.count(), 'Ben sees Ada’s project in the gallery');
await card.click();
await ben.waitForSelector('.part');
await ben.click('.brand');
await ben.click('[data-testid=menu-publish]');
const remixNote = await ben.textContent('.modal');
check(/remix of Ada/.test(remixNote), 'Ben’s copy is credited as a remix of Ada’s');
await ben.click('[data-testid=publish-go]');
await ben.waitForSelector('[data-testid=publish-done]');
const list = await (await fetch(`${URL0}api/gallery`)).json();
const orig = list.entries.find((e) => e.author === 'Ada' && /Night light/i.test(e.name));
check(orig && orig.remixes >= 1, `Ada’s entry counts the remix (${orig?.remixes})`);

// ---- live editing
await ada.goto(`${URL0}?example=pico-traffic-light&notour`);
await ada.waitForSelector('.part');
await ada.click('.brand');
await ada.click('[data-testid=menu-share]');
await ada.waitForSelector('[data-testid=share-bar]');
const roomUrl = ada.url();
await ben.goto(roomUrl);
await ben.waitForSelector('[data-testid=share-bar]');
await ada.waitForFunction(() => /with Ben/.test(document.querySelector('[data-testid=share-bar]')?.textContent ?? ''), null, { timeout: 15000 });
check(true, 'Ada sees Ben join');
await ada.fill('.project-name', 'Crossing light');
await ben.waitForFunction(() => document.querySelector('.project-name')?.value === 'Crossing light', null, { timeout: 15000 });
check(true, 'Ben sees Ada rename the project live');
// Ben comments on a part; Ada sees it.
await ben.click('.part >> nth=1');
await ben.waitForSelector('[data-testid=comments] input');
const target = await ben.evaluate(() => window.__sparkbench.getState().selection?.id);
await ben.fill('[data-testid=comments] input', 'Should this LED be amber?');
await ben.press('[data-testid=comments] input', 'Enter');
await ada.waitForFunction((t) => (window.__sparkbench.getState().room?.comments ?? []).some((c) => c.target === t && /amber/.test(c.text)), target, { timeout: 15000 });
check(true, 'Ada receives Ben’s comment on the part');
await ben.screenshot({ path: 'test-results/community-live.png' });

// ---- classroom
const teacher = ada;
await teacher.goto(`${URL0}?welcome&notour`);
await teacher.click('.join-class .ghost');
await teacher.fill('.modal input >> nth=0', 'Traffic light');
await teacher.fill('.modal textarea >> nth=1', 'The red LED lights up after it starts\nThe green LED lights up within 8 seconds');
await teacher.click('[data-testid=teach-go]');
await teacher.waitForSelector('[data-testid=teach-done]');
const code = (await teacher.textContent('.class-code')).trim();
const dash = await teacher.getAttribute('[data-testid=teach-dashboard-link]', 'href');
console.log('class code', code);
await ben.goto(`${URL0}?class=${code}&example=pico-traffic-light&notour`);
await ben.waitForSelector('[data-testid=class-banner] .cb-main');
await ben.click('[data-testid=class-submit]');
await ben.waitForSelector('[data-testid=class-grade]', { timeout: 300000 });
const grade = await ben.textContent('[data-testid=class-grade]');
console.log('grade:', grade.replace(/\s+/g, ' ').slice(0, 300));
check(/4 of 4 checks passed/.test(grade), 'Ben’s traffic light passes all 4 checks');
await ben.screenshot({ path: 'test-results/community-class.png' });
await teacher.goto(dash);
await teacher.waitForSelector('[data-testid=teacher-row]', { timeout: 20000 });
const row = await teacher.textContent('[data-testid=teacher-row]');
check(/Ben/.test(row) && /4\/4/.test(row), `Teacher dashboard shows Ben 4/4 (${row.replace(/\s+/g, ' ').slice(0, 80)})`);
await teacher.screenshot({ path: 'test-results/community-teacher.png' });

console.log('errors:', errors);
await b.close();
process.exit(ok && !errors.length ? 0 : 1);
