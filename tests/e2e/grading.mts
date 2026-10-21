// Live (needs Claude + dev server): classroom grading must tell a correct project from a wrong one.
// Run: npx tsx tests/e2e/grading.mts
import { buildExample } from '../../src/core/examples';
const URL0 = 'http://localhost:5173';
const a = await (await fetch(`${URL0}/api/class`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Traffic light', brief: '', teacher: 'T', requirements: ['The red LED lights up after it starts', 'The green LED lights up within 8 seconds'] }) })).json();
const scores: Record<string, number> = {};
for (const [who, ex] of [['wrong', 'pico-night-light'], ['right', 'pico-traffic-light']]) {
  const sub = await (await fetch(`${URL0}/api/class/${a.code}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student: who, project: buildExample(ex) }) })).json();
  scores[who] = sub.grade.score;
  console.log(who, `${sub.grade.score}/${sub.grade.max}`, sub.grade.items.map((i: any) => `${i.pass ? '✓' : '✗'} ${i.label}`).join(' | '));
}
const pass = scores.right === 4 && scores.wrong <= 2;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
