import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { compatibilityFixtures } from './compatibility-fixtures';
import { runCompatibility } from '../server/compatibility';

const dir = resolve(process.argv[2] ?? 'out/compatibility');
await mkdir(dir, { recursive: true });
const reports = [];
for (const fixture of compatibilityFixtures) {
  const report = await runCompatibility(fixture.project, join(dir, fixture.id), { expected: fixture.expected, sourceCommit: process.env.GITHUB_SHA });
  reports.push(report);
  console.log(`${fixture.id}: ${report.status} (KiCad ${report.tool.version ?? 'unavailable'})`);
}

// A valid, importable circuit with swapped SDA/SCL must fail the frozen expectations.
const i2c = compatibilityFixtures.find((f) => f.id === 'i2c-display')!;
const mutated = structuredClone(i2c.project);
for (const w of mutated.wires) if (w.a.pin === 'D21') w.a.pin = 'D22'; else if (w.a.pin === 'D22') w.a.pin = 'D21';
const negative = await runCompatibility(mutated, join(dir, 'negative-swapped-i2c'), { expected: i2c.expected, sourceCommit: process.env.GITHUB_SHA });
const caught = negative.checks.some((c) => c.id === 'import' && c.status === 'passed') && negative.checks.some((c) => c.id === 'connectivity' && c.status === 'failed');
const summary = {
  schemaVersion: 1, sourceCommit: process.env.GITHUB_SHA ?? null,
  passed: reports.every((r) => r.status === 'passed') && caught,
  reports, negativeControl: { detected: caught, report: negative },
};
await writeFile(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
await writeFile(join(dir, 'SUMMARY.md'), [
  '# Sparkbench compatibility lab', '',
  `Commit: ${summary.sourceCommit ?? 'local working tree'}`, '',
  ...reports.map((r) => `- ${r.project.name}: **${r.status}**, KiCad ${r.tool.version ?? 'unavailable'}, snapshot ${r.project.sha256}`),
  `- Swapped I²C negative control: **${caught ? 'detected' : 'NOT detected'}**`, '',
  'Scope: schematic import, component values, footprint identifiers, physical-pin connectivity, ERC and SVG generation.',
  'Library warnings remain in each report. No PCB/firmware/hardware certification. Flux and other adapters are not tested.',
].join('\n'));
process.exitCode = summary.passed ? 0 : 1;
