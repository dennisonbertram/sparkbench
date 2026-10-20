// The generated self-test firmware must run cleanly in the simulator, pass on a correct build,
// and pinpoint a wiring fault on a broken one.
import { describe, it, expect } from 'vitest';
import { EXAMPLES, buildExample } from '../../src/core/examples';
import { generateSelfTest, parseSelfTest } from '../../src/core/selftest';
import { simulate, type ScriptedInput } from '../../src/sim/node-runner';
import type { Project } from '../../src/core/types';

/** A patient "user": presses every button, turns every knob, flips switches and waves at the PIR, over and over. */
function stimulate(p: Project, untilMs: number): ScriptedInput[] {
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

describe('self-test firmware', { timeout: 120000 }, () => {
  for (const e of EXAMPLES) {
    const p0 = buildExample(e.id);
    if (p0.board === 'none') continue;
    it(`${e.id}: passes on the correct build`, async () => {
      const code = generateSelfTest(p0)!;
      expect(code).toContain('SELFTEST DONE');
      const p: Project = { ...p0, files: { ...p0.files, 'main.py': code } };
      const r = await simulate(p, { untilMs: 60000, inputs: stimulate(p, 60000) });
      const out = r.engine.serialAll.join('\n');
      if (r.engine.error) console.log(e.id, r.engine.error.raw, '\n', code);
      expect(r.engine.error).toBeUndefined();
      const { lines, done } = parseSelfTest(out);
      if (!done || done.failed) console.log(e.id, out);
      expect(done).not.toBeNull();
      expect(done!.failed).toBe(0);
      expect(lines.filter((l) => l.kind === 'PASS').length + done!.look).toBeGreaterThan(0);
    });
  }

  it('pinpoints a wiring fault: OLED SDA and SCL swapped', async () => {
    const p0 = buildExample('esp32-weather-imu');
    const oled = p0.parts.find((x) => x.type === 'ssd1306')!.id;
    const swap = (r: { part: string; pin: string }) => (r.part === oled && (r.pin === 'SDA' || r.pin === 'SCL') ? { ...r, pin: r.pin === 'SDA' ? 'SCL' : 'SDA' } : r);
    const bad: Project = { ...p0, wires: p0.wires.map((w) => ({ ...w, a: swap(w.a), b: swap(w.b) })), files: { ...p0.files, 'main.py': generateSelfTest(p0)! } };
    const r = await simulate(bad, { untilMs: 40000, inputs: stimulate(bad, 40000) });
    expect(r.engine.error).toBeUndefined();
    const { lines, done } = parseSelfTest(r.engine.serialAll.join('\n'));
    expect(done!.failed).toBe(1);
    expect(lines.find((l) => l.kind === 'FAIL')!.text).toMatch(/SDA .* SCL .*swapped/);
    expect(lines.some((l) => l.kind === 'PASS' && l.part === 'IMU')).toBe(true);
  });
});
