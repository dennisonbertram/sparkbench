// E2E (live Claude): vague idea → clarifying questions → requirements card → acceptance tests pass → add a test in words.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:5173/?welcome&notour');
await p.evaluate(() => localStorage.clear());
await p.goto('http://localhost:5173/?notour');
const box = p.locator('textarea').first();
await box.fill('I want something that tells me when my houseplant needs watering');
await box.press('Enter');
const first = await Promise.race([
  p.waitForSelector('[data-testid=questions]', { timeout: 240000 }).then(() => 'questions'),
  p.waitForSelector('[data-testid=requirements]', { timeout: 240000 }).then(() => 'designed'),
]);
console.log('first response:', first);
await p.screenshot({ path: 'test-results/ai-intent-1.png' });
if (first === 'questions') {
  console.log('questions:', (await p.textContent('[data-testid=questions]')).replace(/\s+/g, ' ').slice(0, 400));
  await p.click('[data-testid=questions-go]');
  await p.waitForSelector('[data-testid=requirements]', { timeout: 400000 });
}
await p.waitForTimeout(1500);
await p.screenshot({ path: 'test-results/ai-intent-2.png' });
console.log('requirements:', (await p.textContent('[data-testid=requirements]')).replace(/\s+/g, ' ').slice(0, 500));
const reply = await p.locator('.msg.ai').last().textContent();
console.log('reply tail:', reply.replace(/\s+/g, ' ').slice(-300));
await p.click('[data-testid=tests-tab]');
await p.waitForFunction(() => document.querySelectorAll('[data-testid=test-result]').length > 0 && !document.querySelector('.tests-intro .muted'), null, { timeout: 120000 });
const results = await p.$$eval('[data-testid=test-result]', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
console.log('tests:\n ' + results.join('\n '));
await p.screenshot({ path: 'test-results/ai-intent-3.png' });
// Add a test in plain words.
await p.fill('.test-add input', 'when the soil is very dry the serial console mentions water');
await p.click('.test-add button[type=submit]');
await p.waitForFunction((n) => document.querySelectorAll('[data-testid=test-result]').length > n, results.length, { timeout: 240000 });
await p.waitForFunction(() => !document.querySelector('.tests-intro .muted'), null, { timeout: 120000 });
const after = await p.$$eval('[data-testid=test-result]', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
console.log('after adding:\n ' + after.join('\n '));
await p.screenshot({ path: 'test-results/ai-intent-4.png' });
console.log('errors:', errors);
await b.close();
const pass = results.length >= 3 && results.every((r) => r.startsWith('✓')) && after.length > results.length && !errors.length;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
