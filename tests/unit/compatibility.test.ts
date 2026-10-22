import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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

  it('validates custom-part metadata while preserving the original project and hash', () => {
    const p = structuredClone(compatibilityFixtures[2].project);
    const custom = p.customParts![0] as unknown as Record<string, unknown>;
    custom.futureMetadata = { source: 'kept' };
    (custom.sim as Record<string, unknown>).futureSimMetadata = { source: 'kept' };
    const originalHash = projectHash(p);

    expect(validateCompatibilityProject(p)).toBe(p);
    expect(projectHash(p)).toBe(originalHash);
    expect(custom.futureMetadata).toEqual({ source: 'kept' });
    expect((custom.sim as Record<string, unknown>).futureSimMetadata).toEqual({ source: 'kept' });
  });

  it('rejects malformed custom-part metadata consumed by specToDef', () => {
    const invalidCases: [string, (part: Record<string, unknown>) => void][] = [
      ['missing name', (part) => { delete part.name; }],
      ['missing description', (part) => { delete part.description; }],
      ['missing eli5', (part) => { delete part.eli5; }],
      ['missing interface', (part) => { delete part.interface; }],
      ['object mpn', (part) => { part.mpn = { value: 'module' }; }],
      ['non-numeric price', (part) => { part.priceUsd = 'free'; }],
      ['non-string supplier query', (part) => { part.supplierQuery = {}; }],
      ['non-string footprint', (part) => { part.footprint = 42; }],
      ['non-finite electrical value', (part) => { part.vmax = Number.POSITIVE_INFINITY; }],
      ['malformed optional metadata', (part) => { part.keywords = 'sensor'; }],
      ['bad pin role', (part) => { (part.pins as Record<string, unknown>[])[0].role = 'signal'; }],
      ['malformed pin electrical data', (part) => { (part.pins as Record<string, unknown>[])[0].load = { ohms: 'high', to: 'gnd' }; }],
      ['malformed control', (part) => { (part.sim as Record<string, unknown>).controls = [{ key: {}, quantity: 'Humidity', min: 0, max: 100 }]; }],
      ['malformed digital output', (part) => { (part.sim as Record<string, unknown>).digitalOutputs = [{ pin: 'OUT', control: {} }]; }],
      ['malformed input bit', (part) => { (part.sim as Record<string, unknown>).inputBits = [{ reg: '0x00', bit: 0, control: 1 }]; }],
      ['malformed keypad keys', (part) => { (part.sim as Record<string, unknown>).keys = [['A', 2]]; }],
      ['malformed shift inputs', (part) => { (part.sim as Record<string, unknown>).shift = { type: '165', inputs: ['A', 2] }; }],
      ['malformed TM1638 keys', (part) => { (part.sim as Record<string, unknown>).tm1638 = { keys: [{ control: {}, k: 1, ks: 1 }] }; }],
      ['invalid IR protocol', (part) => { (part.sim as Record<string, unknown>).ir = { protocol: 'sony' }; }],
      ['malformed measures container', (part) => { (part.sim as Record<string, unknown>).measures = 'measure'; }],
      ['malformed response collection', (part) => { (part.sim as Record<string, unknown>).responses = [null]; }],
      ['malformed FIFO container', (part) => { (part.sim as Record<string, unknown>).fifo = []; }],
      ['non-finite simulation range', (part) => { (part.sim as Record<string, unknown>).min = Number.POSITIVE_INFINITY; }],
      ['unsupported simulation kind', (part) => { (part.sim as Record<string, unknown>).kind = 'unknown-kind'; }],
    ];

    for (const [label, mutate] of invalidCases) {
      const project = structuredClone(compatibilityFixtures[2].project);
      mutate(project.customParts![0] as unknown as Record<string, unknown>);
      expect(() => validateCompatibilityProject(project), label).toThrow();
    }
  });

  it('rejects duplicate custom-part types and pin names', () => {
    const duplicateType = structuredClone(compatibilityFixtures[2].project);
    duplicateType.customParts!.push(structuredClone(duplicateType.customParts![0]));
    expect(() => validateCompatibilityProject(duplicateType)).toThrow(/Duplicate custom part type/);

    const duplicatePin = structuredClone(compatibilityFixtures[2].project);
    duplicatePin.customParts![0].pins[1].name = duplicatePin.customParts![0].pins[0].name;
    expect(() => validateCompatibilityProject(duplicatePin)).toThrow(/Duplicate pin name/);
  });

  it('accepts checked-in custom part specs', async () => {
    const skillsDir = join(process.cwd(), '.claude', 'skills');
    const entries = await readdir(skillsDir, { withFileTypes: true });
    let checked = 0;
    for (const entry of entries.filter((item) => item.isDirectory() && item.name.startsWith('part-'))) {
      const file = join(skillsDir, entry.name, 'part.json');
      let spec: unknown;
      try { spec = JSON.parse(await readFile(file, 'utf8')); }
      catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') continue;
        throw error;
      }
      const project = { ...compatibilityFixtures[2].project, customParts: [spec] };
      expect(() => validateCompatibilityProject(project), file).not.toThrow();
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
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
