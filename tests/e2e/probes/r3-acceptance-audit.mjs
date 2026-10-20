// Acceptance audit over out/<project>/ deliverables. Run from repo root: node tests/e2e/probes/r3-acceptance-audit.mjs
import fs from 'node:fs';
import path from 'node:path';
const root = 'out';
function parseCsv(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const out = {};
for (const p of fs.readdirSync(root).sort()) {
  const d = path.join(root, p); const r = { issues: [] }; out[p] = r;
  const proj = JSON.parse(fs.readFileSync(path.join(d, 'project.sparkbench.json'), 'utf8'));
  const parts = proj.parts; const wires = proj.wires;
  // BOM
  const rows = parseCsv(fs.readFileSync(path.join(d, 'bom.csv'), 'utf8'));
  const hdr = rows[0]; const ncol = hdr.length;
  const bad = rows.slice(1).filter((x) => x.length !== ncol);
  if (bad.length) r.issues.push(`bom: ${bad.length} rows with wrong column count`);
  const refs = new Map(); let qtyMismatch = [];
  for (const x of rows.slice(1)) {
    if (x[9] !== 'part') continue;
    const rs = x[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (Number(x[0]) !== rs.length) qtyMismatch.push(`${x[1]} qty=${x[0]}`);
    for (const ref of rs) refs.set(ref, x);
    const up = Number(x[7]), lp = Number(x[8]);
    if (Math.abs(up * Number(x[0]) - lp) > 0.011) r.issues.push(`bom: line price ${x[8]} != ${x[0]}x${x[7]} for ${x[1]}`);
  }
  if (qtyMismatch.length) r.issues.push('bom qty!=refs: ' + qtyMismatch.join('; '));
  const partRefs = parts.map((x) => x.ref).filter(Boolean);
  const missing = partRefs.filter((x) => !refs.has(x));
  const extra = [...refs.keys()].filter((x) => !partRefs.includes(x));
  r.bomPartsMissing = missing; r.bomExtra = extra;
  if (missing.length) r.issues.push('bom missing refs: ' + missing.join(','));
  if (extra.length) r.issues.push('bom extra refs: ' + extra.join(','));
  // values
  for (const pt of parts) {
    const row = refs.get(pt.ref); if (!row) continue;
    const v = row[3];
    if (pt.props?.ohms != null) {
      const o = pt.props.ohms; const exp = o >= 1e6 ? `${o / 1e6}MΩ` : o >= 1000 ? `${o / 1000}kΩ` : `${o}Ω`;
      if (v !== exp) r.issues.push(`bom value ${pt.ref}: '${v}' vs ohms=${o}`);
    }
  }
  // KiCad sch refs/values
  const sch = fs.readFileSync(path.join(d, `${p}.kicad_sch`), 'utf8');
  const schRefs = [...sch.matchAll(/\(property "Reference" "([^"]+)"/g)].map((m) => m[1]).filter((x) => !x.startsWith('#'));
  const schSet = new Set(schRefs);
  const notInSch = partRefs.filter((x) => !schSet.has(x));
  if (notInSch.length) r.issues.push('parts not in kicad_sch: ' + notInSch.join(','));
  const schExtra = [...schSet].filter((x) => !partRefs.includes(x) && !/^(PWR|FLG|#)/.test(x));
  if (schExtra.length) r.issues.push('kicad_sch extra refs: ' + schExtra.join(','));
  // SVG
  const svg = fs.readFileSync(path.join(d, 'schematic.svg'), 'utf8');
  r.svgBytes = svg.length;
  if (/undefined|NaN/.test(svg)) r.issues.push('svg contains undefined/NaN');
  const svgMissing = partRefs.filter((x) => !svg.includes(`>${x}<`) && !svg.includes(`>${x} `));
  if (svgMissing.length) r.issues.push('refs not found as text in svg: ' + svgMissing.join(','));
  // BLOG
  const blog = fs.readFileSync(path.join(d, 'BLOG.md'), 'utf8');
  const words = blog.replace(/```[\s\S]*?```/g, ' ').replace(/[#|*>`-]/g, ' ').split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  const wordsAll = blog.split(/\s+/).filter(Boolean).length;
  r.blogWordsProse = words; r.blogWordsAll = wordsAll;
  if (words < 900) r.issues.push(`blog prose words ${words} < 900 (all tokens ${wordsAll})`);
  for (const bad of ['undefined', 'NaN', '[object Object]', 'TODO', 'lorem']) if (blog.includes(bad)) r.issues.push(`blog contains '${bad}'`);
  if (!blog.toLowerCase().includes(proj.name.toLowerCase())) r.issues.push('blog does not mention project name');
  // BUILD
  const build = fs.readFileSync(path.join(d, 'BUILD.md'), 'utf8');
  for (const bad of ['undefined', 'NaN', '[object Object]']) if (build.includes(bad)) r.issues.push(`build contains '${bad}'`);
  const wt = build.split('## Wiring table')[1]?.split('\n## ')[0] ?? '';
  const wrows = wt.split('\n').filter((l) => /^\| \d+ \|/.test(l));
  r.wiringRows = wrows.length; r.wires = wires.length;
  if (wrows.length !== wires.length) r.issues.push(`wiring table rows ${wrows.length} != wires ${wires.length}`);
  for (const sec of ['## Wiring table', '## Step-by-step assembly', '## Test it']) if (!build.includes(sec)) r.issues.push('BUILD missing ' + sec);
  const hasFw = Object.keys(proj.files || {}).length > 0;
  r.hasFirmware = hasFw;
  if (hasFw && !/## Load the program/.test(build)) r.issues.push('BUILD missing firmware loading');
  // every firmware file mentioned in BUILD
  for (const f of Object.keys(proj.files || {})) if (!build.includes(f)) r.issues.push(`BUILD does not mention firmware file ${f}`);
  // Sim
  const sim = fs.readFileSync(path.join(d, 'simulation.log'), 'utf8');
  const serial = sim.split('--- serial ---')[1].trim().split('\n').filter(Boolean);
  r.serialLines = serial.length;
  if (!/error: none/.test(sim)) r.issues.push('sim error');
  if (/warning:/.test(sim)) r.issues.push('sim warnings');
  if (serial.length === 0) r.issues.push('simulation.log has no output at all');
}
fs.mkdirSync('test-results/qa3/acceptance', { recursive: true });
fs.writeFileSync('test-results/qa3/acceptance/audit.json', JSON.stringify(out, null, 2));
for (const [p, r] of Object.entries(out)) console.log(p.padEnd(32), `blog=${r.blogWordsProse}/${r.blogWordsAll} wt=${r.wiringRows}/${r.wires} serial=${r.serialLines}`, r.issues.length ? '\n   - ' + r.issues.join('\n   - ') : 'OK');
