// Build a circuit board for one example (or --all): npx tsx scripts/make-pcb.ts pico-traffic-light
import { EXAMPLES, buildExample } from '../src/core/examples';
import { buildPcb } from '../server/pcb';

const ids = process.argv.includes('--all') ? EXAMPLES.map((e) => e.id) : process.argv.slice(2).filter((a) => !a.startsWith('--'));
let bad = 0;
for (const id of ids) {
  const t0 = Date.now();
  try {
    const r = await buildPcb(buildExample(id), `out/${id}/pcb`, (m) => console.log(`  [${id}] ${m}`));
    const ok = r.routed && r.drc.errors.length === 0 && r.drc.unconnected === 0 && !r.problems.length;
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${id}: ${r.widthMm}×${r.heightMm} mm, ${r.tracks} tracks, ${r.vias} vias, DRC ${r.drc.errors.length} errors / ${r.drc.warnings.length} warnings, ${r.drc.unconnected} unconnected ${r.problems.join('; ')} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    for (const e of r.drc.errors.slice(0, 6)) console.log(`    error ${e.type}: ${e.description}`);
  } catch (e: any) {
    bad++;
    console.log(`✗ ${id}: ${e.message}`);
  }
}
process.exit(bad ? 1 : 0);
