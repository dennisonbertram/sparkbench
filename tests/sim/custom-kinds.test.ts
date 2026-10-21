// Regression tests for the datasheet-part simulator kinds: each fixture is wired to both boards the
// way the app wires it, and its example program must pass its test (the same path as the part check).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { exampleTest, staticStages, testProject, CHECK_BOARDS } from '../../src/core/partcheck';
import { runTests } from '../../src/sim/run-tests';
import type { CustomPartSpec } from '../../src/core/customParts';

const dir = 'tests/fixtures/parts';
const specs: CustomPartSpec[] = readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

describe('datasheet-part simulator kinds', () => {
  for (const spec of specs)
    for (const board of CHECK_BOARDS)
      it(`${spec.mpn} (${spec.sim.kind}) on ${board}`, async () => {
        const { project, notes } = testProject(spec, board);
        const st = staticStages(spec, project, notes).filter((s) => s.status === 'fail');
        expect(st).toEqual([]);
        const [r] = await runTests(project, [exampleTest(spec, project)!]);
        expect(r.detail).toBe('Passed in the simulator.');
      }, 60000);

  it('rejects UART pins the Pico cannot use for that UART', async () => {
    const gps = specs.find((s) => s.sim.kind === 'uart-device' && s.sim.uartStream)!;
    const { project } = testProject(gps, 'pico');
    project.files['main.py'] = 'from machine import UART, Pin\nu = UART(0, baudrate=9600, tx=Pin(4), rx=Pin(5))\n';
    const [r] = await runTests(project, [{ id: 'x', title: 'boots', source: 'user', steps: [{ kind: 'wait', ms: 500 }, { kind: 'expect', what: 'no-error' }] }]);
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/bad TX\/RX pin/);
  }, 60000);
});
