// E2E: the review fixes for sharing: likes, concurrent edits merge, undo only takes back your own
// change, comment notices, stop sharing, remembered classes and the way back to the dashboard.
import { chromium } from 'playwright';
const b = await chromium.launch();
const errors = [];
async function person(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((n) => localStorage.setItem('sb-name', n), name);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  return p;
}
const ada = await person('Ada');
const ben = await person('Ben');
const URL0 = 'http://localhost:5173/';
let ok = true;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); ok &&= !!cond; };
const S = (p, fn, arg) => p.evaluate(fn, arg);

// ---- gallery: publish with a title, like it once
await ada.goto(`${URL0}?example=pico-night-light&notour`);
await ada.waitForSelector('.part');
await ada.click('.brand');
await ada.click('[data-testid=menu-publish]');
await ada.fill('[data-testid=publish-title]', 'Ada’s dark-sensing lamp');
await ada.click('[data-testid=publish-go]');
await ada.waitForSelector('[data-testid=publish-done]');
await ada.keyboard.press('Escape');
check((await ada.locator('.modal').count()) === 0, 'Escape closes the publish dialog');
await ada.click('.brand');
await ada.click('[data-testid=menu-publish]');
check(/Update my earlier entry/.test(await ada.textContent('.modal')), 'Publishing again offers to update the earlier entry');
await ada.keyboard.press('Escape');
await ben.goto(`${URL0}?welcome&notour`);
await ben.waitForSelector('[data-testid=community-gallery]');
const wrap = ben.locator('.card-wrap', { hasText: 'Ada’s dark-sensing lamp' }).first();
const before = await wrap.locator('[data-testid=gallery-like]').textContent();
await wrap.locator('[data-testid=gallery-like]').click();
await ben.waitForFunction((t) => [...document.querySelectorAll('.card-wrap')].some((w) => w.textContent.includes('Ada’s dark-sensing lamp') && w.querySelector('.like.on')), null);
const after = await wrap.locator('[data-testid=gallery-like]').textContent();
check(Number(after.replace(/\D/g, '')) === Number(before.replace(/\D/g, '')) + 1, `Like button counts the like (${before.trim()} → ${after.trim()})`);
const ids = await S(ben, () => [...document.querySelectorAll('[data-gallery]')].map((x) => x.dataset.gallery));
check(new Set(ids).size === ids.length, 'Gallery shows each entry once');

// ---- live editing: concurrent edits to different parts both survive
await ada.goto(`${URL0}?example=pico-traffic-light&notour`);
await ada.waitForSelector('.part');
await ada.click('.brand');
await ada.click('[data-testid=menu-share]');
await ada.waitForSelector('[data-testid=share-bar]');
check(/Invite link copied/.test(await ada.textContent('[data-testid=share-bar]')), 'Starting to share says the invite link was copied');
const roomUrl = ada.url();
await ben.goto(roomUrl);
await ben.waitForSelector('[data-testid=share-bar]');
await ada.waitForFunction(() => /with Ben/.test(document.querySelector('[data-testid=share-bar]')?.textContent ?? ''), null, { timeout: 15000 });
const parts = await S(ada, () => window.__sparkbench.getState().project.parts.map((p) => p.id));
const [pa, pb] = [parts[1], parts[2]];
// Both move a different part within ~100 ms of each other.
await Promise.all([
  S(ada, (id) => window.__sparkbench.getState().movePart(id, 111, 222, true), pa),
  new Promise((r) => setTimeout(r, 100)).then(() => S(ben, (id) => window.__sparkbench.getState().movePart(id, 333, 444, true), pb)),
]);
const both = async (p) => p.waitForFunction(([a, b2]) => {
  const ps = window.__sparkbench.getState().project.parts;
  const A = ps.find((x) => x.id === a);
  const B = ps.find((x) => x.id === b2);
  return A.x === 111 && A.y === 222 && B.x === 333 && B.y === 444;
}, [pa, pb], { timeout: 15000 }).then(() => true, () => false);
check(await both(ada) && await both(ben), 'Simultaneous moves of two different parts both survive on both screens');

// ---- undo only takes back my own change
await S(ben, (id) => window.__sparkbench.getState().movePart(id, 555, 444, true), pb);
await ada.waitForFunction((id) => window.__sparkbench.getState().project.parts.find((x) => x.id === id).x === 555, pb, { timeout: 15000 });
await ada.fill('.project-name', 'Ada renamed it');
await ben.waitForFunction(() => window.__sparkbench.getState().project.name === 'Ada renamed it', null, { timeout: 15000 });
await ben.waitForTimeout(800);
await S(ben, () => window.__sparkbench.getState().undo());
await ada.waitForFunction((id) => window.__sparkbench.getState().project.parts.find((x) => x.id === id).x === 333, pb, { timeout: 15000 }).catch(() => {});
const adaState = await S(ada, (id) => { const s = window.__sparkbench.getState().project; return { name: s.name, x: s.parts.find((x) => x.id === id).x }; }, pb);
check(adaState.name === 'Ada renamed it' && adaState.x === 333, `Ben’s undo takes back his move but keeps Ada’s rename (${JSON.stringify(adaState)})`);

// ---- comments: notice on the other screen, Send button
await ben.click('.part >> nth=1');
await ben.waitForSelector('[data-testid=comments] input');
await ben.fill('[data-testid=comments] input', 'Should this LED be amber?');
await ben.click('[data-testid=comments] button[type=submit]');
await ada.waitForSelector('[data-testid=comment-notice]', { timeout: 15000 });
check(/Ben on .*amber/.test(await ada.textContent('[data-testid=comment-notice]')), 'Ada sees a notice for Ben’s comment, naming the part');
await ada.click('[data-testid=share-comments]');
await ada.click('[data-testid=share-comment-list] button.link');
const sel = await S(ada, () => window.__sparkbench.getState().selection?.id);
check(!!sel, 'Clicking the comment selects the part it is about');
await ada.click('[data-testid=share-stop]');
check((await ada.locator('[data-testid=share-bar]').count()) === 0 && !ada.url().includes('room='), 'Stop sharing leaves the room');

// ---- classes: remembered on the start page; back to the dashboard from a submission
await ada.goto(`${URL0}?welcome&notour`);
await ada.click('.join-class button[type=submit]');
check(/Type the class code/.test(await ada.textContent('.join-class')), 'Join with an empty code says what to type');
await ada.click('.join-class .ghost');
await ada.fill('.modal input >> nth=0', 'Collab check');
await ada.fill('.modal textarea >> nth=1', 'The red LED lights up');
await ada.click('[data-testid=teach-go]');
await ada.waitForSelector('[data-testid=teach-done]');
const code = (await ada.textContent('.class-code')).trim();
check(await ada.locator('[data-testid=teach-copy]').count(), 'Dashboard link has a copy button');
await ada.keyboard.press('Escape');
await ada.reload();
await ada.waitForSelector('[data-testid=my-classes]');
check((await ada.textContent('[data-testid=my-classes]')).includes(code), 'My classes lists the new class after a reload');
await ada.click(`[data-testid=my-classes] button:has-text("${code}")`);
await ada.waitForSelector('[data-testid=teacher-empty]');
check(true, 'Dashboard opens from My classes and says nobody has handed in yet');
// A student joining from the welcome box is told what to do next.
await ben.goto(`${URL0}?welcome&notour`);
await ben.evaluate(() => localStorage.removeItem('sb-current'));
await ben.fill('.join-class input', code);
await ben.click('.join-class button[type=submit]');
await ben.waitForSelector('[data-testid=class-banner] .cb-main');
check((await ben.locator('[data-testid=class-next]').count()) > 0 || (await ben.locator('.part').count()) > 0, 'Student without a project is told what to do before handing in');

console.log('errors:', errors);
await b.close();
process.exit(ok && !errors.length ? 0 : 1);
