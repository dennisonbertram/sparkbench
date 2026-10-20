// Plan the breadboard layout of every example; print problems and write SVGs to test-results/breadboards/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { EXAMPLES, buildExample } from '../src/core/examples';
import { planBreadboard } from '../src/core/bbplace';
import { renderBreadboardSvg } from '../src/core/breadboard';

const OUT = 'test-results/breadboards';
mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const e of EXAMPLES) {
  const plan = planBreadboard(buildExample(e.id));
  writeFileSync(`${OUT}/${e.id}.svg`, renderBreadboardSvg(plan.layout));
  writeFileSync(`${OUT}/${e.id}.txt`, plan.steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n'));
  if (plan.problems.length) bad++;
  console.log(`${plan.problems.length ? '✗' : '✓'} ${e.id.padEnd(24)} cols ${plan.layout.cols} parts ${plan.layout.parts.length} wires ${plan.layout.wires.length}${plan.problems.length ? '\n    ' + plan.problems.join('\n    ') : ''}`);
}
process.exit(bad ? 1 : 0);
