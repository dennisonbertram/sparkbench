// Checks a part's resolution.json: every settled difference must quote its source verbatim (the quoted span has to
// appear in the fetched page or PDF). Run: npx tsx scripts/parts/quotecheck.ts <slug>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { quoteFound } from './publish';

for (const slug of process.argv.slice(2)) {
  const f = join('parts-staging', `part-${slug}`, 'resolution.json');
  if (!existsSync(f)) {
    console.log(`MISSING ${f}`);
    continue;
  }
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const bad = r.diffs.filter((d: any) => d.verdict !== 'unresolved' && !quoteFound(d.evidence, d.source));
  console.log(`${bad.length ? 'UNVERIFIED' : 'VERIFIED'} ${slug} (${r.diffs.length - bad.length}/${r.diffs.length})`);
  for (const d of bad) console.log(`  - ${d.diff}\n    source: ${d.source}`);
}
