// Compare connectivity: kicad-cli-exported netlist of the .kicad_sch vs Sparkbench's own .net export.
import fs from 'node:fs';
function nets(txt) {
  const res = [];
  if (!/\(net \(code/.test(txt)) {
    const body = txt.split(/\(nets/)[1] || '';
    for (const chunk of body.split(/\(net\s*\n/).slice(1)) {
      const name = (chunk.match(/\(name "([^"]*)"\)/) || [])[1];
      const nodes = [...chunk.matchAll(/\(ref "([^"]+)"\)\s*\(pin "([^"]+)"\)/g)].map((n) => `${n[1]}.${n[2]}`).sort();
      if (nodes.length > 1) res.push({ name, nodes });
    }
    return res;
  }
  for (const m of txt.matchAll(/\(net \(code "?\d+"?\) \(name "([^"]*)"\)((?:\s*\(node [^\n]*?\)\))*)/g)) {
    const nodes = [...m[2].matchAll(/\(node \(ref "([^"]+)"\) \(pin "([^"]+)"/g)].map((n) => `${n[1]}.${n[2]}`).sort();
    if (nodes.length > 1) res.push({ name: m[1], nodes });
  }
  return res;
}
const key = (n) => n.nodes.join(' ');
let total = 0;
for (const p of fs.readdirSync('out').sort()) {
  const a = nets(fs.readFileSync(`out/${p}/${p}.net`, 'utf8'));
  const b = nets(fs.readFileSync(`test-results/qa3/acceptance/kinet/${p}.net`, 'utf8'));
  const A = new Set(a.map(key)), B = new Set(b.map(key));
  const onlyA = a.filter((n) => !B.has(key(n))), onlyB = b.filter((n) => !A.has(key(n)));
  total += onlyA.length + onlyB.length;
  console.log(p.padEnd(32), `sparkbench nets=${a.length} kicad nets=${b.length}`, onlyA.length || onlyB.length ? 'MISMATCH' : 'match');
  for (const n of onlyA) console.log('   only sparkbench:', n.name, n.nodes.join(' '));
  for (const n of onlyB) console.log('   only kicad sch :', n.name, n.nodes.join(' '));
}
