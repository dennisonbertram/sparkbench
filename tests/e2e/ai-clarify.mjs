// E2E (live Claude): a vague idea gets up to 3 multiple-choice questions; answering designs it.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('http://localhost:5173/?welcome&notour');
await p.evaluate(() => localStorage.clear());
await p.goto('http://localhost:5173/?notour');
await p.fill('.hero-input textarea', 'a little gadget for my desk that keeps me company');
await p.click('.hero-input button[type=submit]');
await p.waitForSelector('[data-testid=questions], [data-testid=requirements]', { timeout: 300000 });
const asked = await p.locator('[data-testid=questions]').count();
let qs = '';
if (asked) {
  qs = (await p.textContent('[data-testid=questions]')).replace(/\s+/g, ' ');
  console.log('questions:', qs.slice(0, 500));
  await p.screenshot({ path: 'test-results/ai-clarify-questions.png' });
  // Pick the second option of the first question.
  const second = p.locator('[data-testid=questions] fieldset').first().locator('label').nth(1);
  if (await second.count()) await second.click();
  await p.click('[data-testid=questions-go]');
  await p.waitForSelector('[data-testid=requirements]', { timeout: 400000 });
}
await p.waitForTimeout(1000);
console.log('requirements:', (await p.textContent('[data-testid=requirements]')).replace(/\s+/g, ' ').slice(0, 300));
await p.screenshot({ path: 'test-results/ai-clarify-design.png' });
console.log('errors:', errors);
await b.close();
const pass = asked > 0 && !errors.length;
console.log(pass ? 'PASS' : 'FAIL (no questions asked for a vague idea)');
process.exit(pass ? 0 : 1);
