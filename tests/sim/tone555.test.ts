import { it, expect } from 'vitest';
import { planFromPrompt } from '../../src/core/planner';
import { simulate } from '../../src/sim/node-runner';

it('555 buzzer: sounds ~465 Hz only while the button is held', async () => {
  const p = planFromPrompt('a 555 timer that drives a buzzer');
  expect(p.name).toBe('555 Tone Generator');
  const sw = p.parts.find((x) => x.type === 'pushbutton')!.id;
  const bz = p.parts.find((x) => x.type === 'buzzer')!.id;
  const t0 = Date.now();
  const { snapshots } = await simulate(p, { untilMs: 600, inputs: [{ atMs: 100, part: sw, key: 'pressed', value: 1 }, { atMs: 400, part: sw, key: 'pressed', value: 0 }], onFrameAt: [80, 350, 550] });
  console.log('wall ms for 0.6 s sim:', Date.now() - t0, snapshots.map((s) => s.frame.parts[bz].tone));
  expect(snapshots[0].frame.parts[bz].tone).toBe(0);
  const f = snapshots[1].frame.parts[bz].tone!;
  expect(f).toBeGreaterThan(465 * 0.8);
  expect(f).toBeLessThan(465 * 1.2);
  expect(snapshots[2].frame.parts[bz].tone).toBe(0);
}, 60000);
