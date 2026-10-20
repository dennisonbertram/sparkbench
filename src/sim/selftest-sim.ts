// Run the project's self-test in the simulator with a patient virtual user, to get the output a
// correct build prints (for comparison with the real board).
import type { Project } from '../core/types';
import { generateSelfTest } from '../core/selftest';
import { simulate, type ScriptedInput } from './node-runner';

export function patientUser(p: Project, untilMs: number): ScriptedInput[] {
  const out: ScriptedInput[] = [];
  for (let t = 500; t < untilMs; t += 700) {
    for (const part of p.parts) {
      if (part.type === 'pushbutton') out.push({ atMs: t, part: part.id, key: 'pressed', value: 1 }, { atMs: t + 120, part: part.id, key: 'pressed', value: 0 });
      if (part.type === 'potentiometer') out.push({ atMs: t, part: part.id, key: 'position', value: (t / 700) % 2 ? 10 : 90 });
      if (part.type === 'slide-switch') out.push({ atMs: t, part: part.id, key: 'position', value: (t / 700) % 2 ? 1 : 0 });
      if (part.type === 'pir') out.push({ atMs: t, part: part.id, key: 'motion', value: 1 }, { atMs: t + 300, part: part.id, key: 'motion', value: 0 });
    }
  }
  return out;
}

export async function simulateSelfTest(project: Project): Promise<string> {
  const code = generateSelfTest(project);
  if (!code) return '';
  const p: Project = { ...project, files: { ...project.files, 'main.py': code } };
  const r = await simulate(p, { untilMs: 60000, inputs: patientUser(p, 60000) });
  return r.engine.serialAll.join('\n') + (r.engine.error ? `\n${r.engine.error.raw}` : '');
}
