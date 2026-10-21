// E2E (uses Claude): the designer reaches for a checked library part when no built-in part fits.
// "CO2 monitor with an OLED" must pick the SCD40 from the parts library, wire it, write code with its
// driver, and pass a hidden test: CO2 slider at 1500 ppm → the screen shows 1500.
// Run: npx tsx tests/e2e/ai-library.mts
import { aiDesign } from '../../server/ai';
import { runTests } from '../../src/sim/run-tests';
import { runChecks } from '../../src/core/checks';

const r = await aiDesign('A CO2 monitor for my bedroom: show the CO2 level in ppm on a small OLED screen.', undefined, [{ role: 'user', content: 'A CO2 monitor' }, { role: 'assistant', content: 'Sure.' }]);
const p = r.project!;
const scd = p.parts.find((x) => x.type === 'custom-scd40');
const oled = p.parts.find((x) => x.type === 'ssd1306');
console.log('reply:', r.reply.slice(0, 300));
console.log('parts:', p.parts.map((x) => `${x.ref}:${x.type}`).join(' '));
console.log('log:', r.log.join(' | '));
const errors = runChecks(p).filter((c) => c.severity === 'error');
const hidden = scd && oled ? await runTests(p, [{ id: 'co2', title: 'Screen shows the CO2 level', source: 'user', steps: [{ kind: 'set', part: scd.ref!, control: 'value', value: 1500 }, { kind: 'wait', ms: 6000 }, { kind: 'expect', what: 'screen', part: oled.ref!, text: '1500', within: 8000 }] }]) : [];
console.log('hidden:', hidden.map((h) => `${h.pass ? '✓' : '✗'} ${h.detail}`).join(' '));
console.log('own tests:', (r.results ?? []).map((t) => `${t.pass ? '✓' : '✗'} ${t.title}`).join(' | '));
console.log('design errors:', errors.map((e) => e.title));
const pass = !!scd && !!oled && !errors.length && hidden.length === 1 && hidden[0].pass;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
