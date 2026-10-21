// Classroom grading: each requirement becomes an acceptance test written for this student's design
// (Claude), run in the simulator; plus "the design checks pass" and "the program runs".
import type { Project } from '../src/core/types';
import { runChecks } from '../src/core/checks';
import { deriveTests } from '../src/core/acceptance';
import { runTests } from '../src/sim/run-tests';
import { registerProjectParts } from '../src/core/customParts';

export async function gradeSubmission(project: Project, requirements: string[]) {
  registerProjectParts(project);
  const items: { label: string; pass: boolean; detail: string }[] = [];
  const errors = runChecks(project).filter((c) => c.severity === 'error');
  items.push({ label: 'The wiring passes the design checks', pass: errors.length === 0, detail: errors.length ? errors.map((e) => e.title).join('; ') : 'No errors.' });
  const boots = (await runTests(project, deriveTests(project).filter((t) => t.id === 'boots' || t.id === 'blinks'))).every((r) => r.pass);
  items.push({ label: 'The program runs without crashing', pass: boots, detail: boots ? 'Ran in the simulator.' : 'It stopped with an error in the simulator.' });
  const { aiStatus, aiGradeRequirement } = await import('./ai');
  for (const req of requirements) {
    if (!aiStatus().enabled) {
      items.push({ label: req, pass: false, detail: 'Not graded: automatic checking of requirements needs Claude on this server. Your teacher will check it.' });
      continue;
    }
    try {
      const g = await aiGradeRequirement(project, req);
      if (!g.applies) {
        items.push({ label: req, pass: false, detail: g.why });
        continue;
      }
      const results = await runTests(project, g.tests.slice(0, 2));
      const pass = results.length > 0 && results.every((r) => r.pass);
      items.push({ label: req, pass, detail: results.map((r) => `${r.pass ? '✓' : '✗'} ${r.title}${r.pass ? '' : ` — ${r.detail}`}`).join(' ') || 'No test could be written for this design.' });
    } catch (e: any) {
      items.push({ label: req, pass: false, detail: `Couldn't check: ${e?.message ?? e}` });
    }
  }
  return { score: items.filter((i) => i.pass).length, max: items.length, items };
}
