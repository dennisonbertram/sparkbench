import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, compareInventory, parseNetlist } from '../../src/core/compatibility';
import { projectHash, projectInventory, runCompatibility, validateCompatibilityProject } from '../../server/compatibility';
import { registerProjectParts } from '../../src/core/customParts';
import { exportKicadNetlist } from '../../src/core/kicad';
import { compatibilityFixtures } from '../../scripts/compatibility-fixtures';

describe('compatibility contract', () => {
  for (const fixture of compatibilityFixtures) it(`${fixture.id} matches frozen physical-pin expectations`, () => {
    registerProjectParts(fixture.project);
    expect(compareInventory(fixture.expected, projectInventory(fixture.project))).toEqual([]);
    expect(compareInventory(fixture.expected, parseNetlist(exportKicadNetlist(fixture.project)))).toEqual([]);
  });

  it('detects a removed wire, LED reversal, added short, and wrong value', () => {
    const { project, expected } = compatibilityFixtures[0];
    const missing = structuredClone(project);
    missing.wires.pop();
    const reversed = structuredClone(project);
    reversed.wires[1].b.pin = 'C';
    reversed.wires[2].a.pin = 'A';
    const short = structuredClone(project);
    short.wires.push({ id: 'short', a: { part: 'resistor', pin: '1' }, b: { part: 'resistor', pin: '2' } });
    const value = structuredClone(project);
    value.parts[1].props.ohms = 220;
    for (const mutation of [missing, reversed, short, value]) expect(compareInventory(expected, parseNetlist(exportKicadNetlist(mutation))).length).toBeGreaterThan(0);
  });

  it('ignores ordering, but rejects duplicate refs and pins', () => {
    const e = compatibilityFixtures[0].expected;
    expect(compareInventory(e, { components: [...e.components].reverse(), nets: e.nets.map((n) => [...n].reverse()).reverse() })).toEqual([]);
    expect(() => compareInventory(e, { ...e, components: [...e.components, e.components[0]] })).toThrow(/duplicate/);
    expect(() => compareInventory(e, { ...e, nets: [...e.nets, e.nets[0]] })).toThrow(/more than once/);
  });

  it('rejects truncated and malformed netlists instead of hanging or passing', () => {
    for (const bad of ['(', '(export', '(export (components))', '(export "unfinished)', '(export))', '()']) expect(() => parseNetlist(bad)).toThrow();
  });

  it('rejects dangling wires and excessive project size', () => {
    const p = structuredClone(compatibilityFixtures[0].project);
    p.wires[0].a.pin = 'nonexistent';
    expect(() => projectInventory(p)).toThrow(/Dangling/);
    expect(() => validateCompatibilityProject({ ...p, files: { 'main.py': 'x'.repeat(2_000_001) } })).toThrow(/2 MB/);
  });

  it('hashes the complete snapshot deterministically and changes with edits', () => {
    const p = compatibilityFixtures[0].project;
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(projectHash(p)).toBe(projectHash(JSON.parse(JSON.stringify(p))));
    expect(projectHash({ ...p, files: { 'main.py': 'print(1)' } })).not.toBe(projectHash(p));
  });

  it('reports missing KiCad as blocked, never as a pass', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'compatibility-test-'));
    try {
      const report = await runCompatibility(compatibilityFixtures[0].project, dir, { cli: '/nonexistent/kicad-cli' });
      expect(report.status).toBe('blocked');
      expect(report.checks.find((c) => c.id === 'tool')?.status).toBe('blocked');
      expect(report.otherTargets.every((t) => t.status === 'not-tested')).toBe(true);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('does not silently renumber existing references when some are missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'compatibility-test-'));
    try {
      const p = structuredClone(compatibilityFixtures[0].project);
      delete p.parts[0].ref;
      const report = await runCompatibility(p, dir, { cli: '/nonexistent/kicad-cli' });
      expect(report.status).toBe('failed');
      expect(report.checks[0].detail).toContain('Some parts lack references');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
