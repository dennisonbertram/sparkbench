// Smoke-test the AI paths against the real Claude backend:
//   npx tsx scripts/ai-smoke.ts code    (edit main.py of the traffic light)
//   npx tsx scripts/ai-smoke.ts design "<prompt>"
import { buildExample } from '../src/core/examples';
import { aiEditFile, aiDesign, aiStatus } from '../server/ai';
console.log('backend:', aiStatus());
const t0 = Date.now();
if (process.argv[2] === 'design') {
  const r = await aiDesign(process.argv[3] ?? 'a desk thermometer with a screen that beeps when it gets too hot');
  console.log(r.intent, '|', r.project?.name, '|', r.project?.summary, '\n', r.reply, '\n', r.log.join('\n'));
  if (r.project?.codeCustom) console.log(r.project.files['main.py'].slice(0, 2500));
} else {
  const p = buildExample('pico-traffic-light');
  const r = await aiEditFile(p, 'main.py', 'Make the green phase last 6 seconds and print the current colour name whenever it changes.');
  console.log(r.ok, r.reply, '\n', r.log.join('\n'));
  console.log(r.project.files['main.py'].split('\n').filter((l) => /phase|print|green/i.test(l)).join('\n'));
}
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
