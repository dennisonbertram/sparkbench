// Sample SimEngine frames for analog examples to see whether the simulator produces analog results that simulation.log omits.
import { buildExample } from '../../../src/core/examples';
import { simulate } from '../../../src/sim/node-runner';
for (const id of ['555-tone', 'transistor-switch']) {
  const at = [250, 500, 750, 1000, 1250, 1500, 1750, 2000, 6000, 7000];
  const { engine, snapshots, final } = await simulate(buildExample(id), { untilMs: 8000, onFrameAt: at, inputs: id === 'transistor-switch' || id === '555-tone' ? [{ atMs: 1000, part: 'pushbutton1', key: 'pressed', value: 1 }] : [] });
  console.log('==', id, 'status', engine.status, 'err', engine.error?.raw ?? 'none', 'frame keys', Object.keys(final));
  for (const s of snapshots) console.log(s.atMs, JSON.stringify(s.frame).slice(0, 300));
}
