// Compare bom.csv (Sparkbench) with kicad-cli's BOM of the .kicad_sch: refs, footprints, R/C values.
import fs from 'node:fs';
const csv = (t) => t.trim().split('\n').map((l) => { const r = []; let f = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ',') { r.push(f); f = ''; } else f += c; } r.push(f); return r; });
const norm = (v) => v.replace(/Ω/g, '').replace(/µ/g, 'u').replace(/\s/g, '').toLowerCase();
for (const p of fs.readdirSync('out').sort()) {
  const sb = csv(fs.readFileSync(`out/${p}/bom.csv`, 'utf8')).slice(1).filter((r) => r[9] === 'part');
  const kc = csv(fs.readFileSync(`test-results/qa3/acceptance/kinet/${p}.bom.csv`, 'utf8')).slice(1);
  const kmap = new Map(kc.map((r) => [r[0], r]));
  const issues = [];
  const seen = new Set();
  for (const r of sb) for (const ref of r[1].split(',').map((s) => s.trim())) {
    seen.add(ref);
    const k = kmap.get(ref);
    if (!k) { issues.push(`${ref} not in kicad bom`); continue; }
    if (k[2] !== r[6]) issues.push(`${ref} footprint '${r[6]}' vs kicad '${k[2]}'`);
    if (/^[RC]\d/.test(ref) && norm(k[1]) !== norm(r[3])) issues.push(`${ref} value '${r[3]}' vs kicad '${k[1]}'`);
  }
  for (const k of kc) if (!seen.has(k[0])) issues.push(`${k[0]} only in kicad bom`);
  console.log(p.padEnd(32), issues.length ? issues.join('; ') : 'match');
}
