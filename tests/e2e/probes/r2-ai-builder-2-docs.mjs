import * as L from './r2-ai-builder-2-lib.mjs';
import fs from 'fs';
const prof = process.argv[2];
const { ctx, p, errs } = await L.open('http://localhost:5173/?notour', prof);
let out = '';
for (const t of ['Parts list', 'Build guide', 'Blog post', 'Schematic']) {
  await L.tab(p, t); await p.waitForTimeout(800);
  await L.shot(p, prof + '-80-' + t.replace(' ', '_'));
  out += '\n\n######## ' + t + '\n' + await p.locator('main, .main, .center, .workspace').first().innerText().catch(() => p.locator('body').innerText());
}
fs.writeFileSync(L.OUT + prof + '-docs.txt', out);
console.log(out.length, 'ERRS', errs.join('\n'));
await ctx.close();
