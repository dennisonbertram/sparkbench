// Design-system ratchet: counts UI built outside src/ui/ds (raw controls and hand-rolled
// banners, chips, menus, tabs and dialogs) per file. The count may only go down.
//   npx tsx scripts/ds-check.ts           check against scripts/ds-baseline.json
//   npx tsx scripts/ds-check.ts --write   record the current (lower) counts
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const UI = join(ROOT, 'src/ui');
const BASELINE = join(ROOT, 'scripts/ds-baseline.json');

/** Patterns that mean "built by hand instead of taken from the design system". Class patterns match
 *  whole class names only, so `net-banner` or `projects-menu` passed to a DS component is fine. */
export const AD_HOC: [string, RegExp][] = [
  ['button', /<button[\s>]/g],
  ['input', /<input[\s>]/g],
  ['select', /<select[\s>]/g],
  ['textarea', /<textarea[\s>]/g],
  ['banner', /className=["'{`](?:[^"'}`]*\s)?banner(?=[\s"'}`])/g],
  ['chip', /className=["'{`](?:[^"'}`]*\s)?(board-)?chip(?=[\s"'}`])/g],
  ['modal', /className=["'{`](?:[^"'}`]*\s)?modal(-back)?(?=[\s"'}`])/g],
  ['menu', /className=["'{`](?:[^"'}`]*\s)?menu(?=[\s"'}`])/g],
  ['tabs', /role=["']tablist["']/g],
  ['card', /className=["'{`](?:[^"'}`]*\s)?card(?=[\s"'}`])/g],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return p.endsWith('/ds') ? [] : files(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

export function scan(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const f of files(UI)) {
    const src = readFileSync(f, 'utf8');
    const counts: Record<string, number> = {};
    for (const [k, re] of AD_HOC) {
      const n = src.match(re)?.length ?? 0;
      if (n) counts[k] = n;
    }
    if (Object.keys(counts).length) out[relative(ROOT, f)] = counts;
  }
  return out;
}

export function regressions(now = scan(), base: Record<string, Record<string, number>> = JSON.parse(readFileSync(BASELINE, 'utf8'))): string[] {
  const bad: string[] = [];
  for (const [file, counts] of Object.entries(now))
    for (const [k, n] of Object.entries(counts)) {
      const was = base[file]?.[k] ?? 0;
      if (n > was) bad.push(`${file}: ${n} ad-hoc ${k} (allowed ${was}). Use the design system in src/ui/ds, or add the component there first.`);
    }
  return bad;
}

if (process.argv[1]?.endsWith('ds-check.ts')) {
  const now = scan();
  const total = Object.values(now).reduce((s, c) => s + Object.values(c).reduce((a, b) => a + b, 0), 0);
  if (process.argv.includes('--write')) {
    writeFileSync(BASELINE, JSON.stringify(now, null, 2) + '\n');
    console.log(`Recorded ${total} remaining ad-hoc elements.`);
  } else {
    const bad = regressions(now);
    if (bad.length) {
      console.error(bad.join('\n'));
      process.exit(1);
    }
    console.log(`Design system check passed. ${total} ad-hoc elements left to migrate.`);
  }
}
