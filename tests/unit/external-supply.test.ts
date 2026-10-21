// Parts whose power pin needs a separate supply (a motor driver's VM): wired to an external DC supply with a
// common ground, powered only when that supply is in range, and checked for the mistakes beginners make.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Project } from '../../src/core/types';
import { testProject, exampleTest, staticStages } from '../../src/core/partcheck';
import { withoutCustomPart } from '../../src/core/autowire';
import { ElectricalModel } from '../../src/core/circuit';
import { runChecks } from '../../src/core/checks';
import { planBreadboard } from '../../src/core/bbplace';
import { buildBom } from '../../src/core/bom';
import { pcbSpec } from '../../src/core/pcb';
import { annotate } from '../../src/core/netlist';
import { buildGuide } from '../../src/core/docs';
import { BOARDS } from '../../src/core/boards';
import { buildSchematic, verifySchematic } from '../../src/core/schematic';
import { runTests } from '../../src/sim/run-tests';
import { validateSpec, type CustomPartSpec } from '../../src/core/customParts';

const spec: CustomPartSpec = JSON.parse(readFileSync('tests/fixtures/parts/drv8871-ext.json', 'utf8'));
const wired = () => testProject(spec, 'esp32').project;
const supplyOf = (p: Project) => p.parts.find((x) => x.type === 'dc-supply')!;
const ids = (p: Project) => runChecks(p).filter((c) => c.severity === 'error').map((c) => c.id.split(':')[0]);

describe('external supply', () => {
  it('wires VM to a 12 V external supply whose − joins the board GND, never to the board', () => {
    const p = wired();
    const s = supplyOf(p);
    expect(s.props).toEqual({ volts: 12, amps: 5 });
    const vm = p.wires.filter((w) => [w.a, w.b].some((r) => r.part === 'dut' && r.pin === 'VM'));
    expect(vm).toHaveLength(1);
    expect([vm[0].a.part, vm[0].b.part]).toContain(s.id);
    expect(p.wires.some((w) => [w.a, w.b].some((r) => r.part === s.id && r.pin === '-') && [w.a, w.b].some((r) => r.part === 'board' && r.pin === BOARDS.esp32.gnd))).toBe(true);
    expect(ids(p)).toEqual([]);
  });

  it('is powered only while the supply is within VM range', () => {
    const p = wired();
    expect(new ElectricalModel(p).modulePowered('dut')).toBe(true);
    supplyOf(p).props.volts = 5;
    expect(new ElectricalModel(p).modulePowered('dut')).toBe(false);
  });

  it('the driver does nothing in the simulator when the supply is too low', async () => {
    const p = wired();
    supplyOf(p).props.volts = 5;
    const [r] = await runTests(p, [exampleTest(spec, p)!]);
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/IN1/);
  }, 60000);

  it('flags VM on the board 5 V, a missing supply, a supply out of range, no common ground and an overloaded supply', () => {
    const base = wired();
    const s = supplyOf(base).id;
    const onBoard = { ...base, wires: base.wires.map((w) => ([w.a, w.b].some((r) => r.part === s && r.pin === '+') ? { ...w, a: { part: 'dut', pin: 'VM' }, b: { part: 'board', pin: 'VIN' } } : w)) };
    expect(ids(onBoard)).toContain('ext-on-board');
    const none = { ...base, wires: base.wires.filter((w) => ![w.a, w.b].some((r) => r.part === s && r.pin === '+')) };
    expect(ids(none)).toContain('no-ext-supply');
    const low = structuredClone(base);
    supplyOf(low).props.volts = 5;
    expect(ids(low)).toContain('supply-range');
    const floatGnd = { ...base, wires: base.wires.filter((w) => ![w.a, w.b].some((r) => r.part === s && r.pin === '-')) };
    expect(ids(floatGnd)).toContain('ext-ground');
    const small = structuredClone(base);
    supplyOf(small).props.amps = 2;
    expect(runChecks(small).some((c) => c.id === `budget:ext:${s}` && c.severity === 'warning')).toBe(true);
  });

  it('does not count the motor supply against the USB budget', () => {
    expect(runChecks(wired()).some((c) => c.id.startsWith('budget:5v'))).toBe(false);
  });

  it('has a breadboard plan, BOM lines, a PCB edge connector and a guide that powers it last', () => {
    const p = wired();
    const plan = planBreadboard(p);
    expect(plan.problems).toEqual([]);
    expect(plan.steps.at(-1)!.text).toMatch(/Power last!.*12 V/);
    const bom = buildBom(p);
    expect(bom.some((l) => l.key === 'supply:barrel-terminal')).toBe(true);
    expect(bom.some((l) => /12 V, 5 A/.test(l.value ?? ''))).toBe(true);
    const pcb = pcbSpec(annotate(p));
    expect(pcb.parts.find((x) => x.ref === supplyOf(p).ref)?.edge).toBe(true);
    expect(pcb.powerNets.some((n) => n.startsWith('VEXT'))).toBe(true);
    expect(verifySchematic(buildSchematic(annotate(p)), annotate(p))).toEqual([]);
    expect(buildGuide(p)).toMatch(/external supply is more than the board can take/);
  });

  it('removing the part removes the supply it brought', () => {
    const p = withoutCustomPart(wired(), spec.type);
    expect(p.parts.some((x) => x.type === 'dc-supply')).toBe(false);
    expect(p.wires.some((w) => [w.a, w.b].some((r) => r.part.startsWith('extsupply')))).toBe(false);
  });

  it('only a power pin can take a separate supply', () => {
    const bad = structuredClone(spec);
    bad.pins[0].supply = { vmin: 6, vmax: 12 };
    expect(validateSpec(bad).join()).toMatch(/only a power pin/);
    const ok = testProject(spec, 'pico');
    expect(staticStages(spec, ok.project, ok.notes).filter((s) => s.status === 'fail')).toEqual([]);
  });
});
