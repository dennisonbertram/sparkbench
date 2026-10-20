// compare nets in KiCad-cli exported netlist vs app exported .net (whitespace-insensitive)
import { readFileSync } from 'node:fs';
function nets(txt) {
  txt = txt.replace(/\s+/g, ' ');
  const i = txt.indexOf('(nets'); txt = txt.slice(i);
  return txt.split(/\(net \(code/).slice(1).map(chunk => ({
    name: (chunk.match(/\(name "([^"]*)"/) || [])[1],
    nodes: [...chunk.matchAll(/\(node \(ref "([^"]+)"\) \(pin "([^"]+)"\)/g)].map(x => x[1] + '.' + x[2]).sort(),
  }));
}
for (const id of process.argv.slice(2)) {
  const d = `test-results/qa/eli-engineer/${id}`;
  const a = nets(readFileSync(`${d}/${id}.net`, 'utf8')), k = nets(readFileSync(`${d}/kicad-exported.net`, 'utf8'));
  const key = n => n.nodes.join(',');
  const ka = new Set(a.filter(n=>n.nodes.length>1).map(key)), kk = new Set(k.filter(n=>n.nodes.length>1).map(key));
  console.log(`== ${id}: app nets ${a.length} (multi ${ka.size}), kicad nets ${k.length} (multi ${kk.size})`);
  for (const n of a) if (n.nodes.length>1 && !kk.has(key(n))) console.log('  app-only:', n.name, key(n));
  for (const n of k) if (n.nodes.length>1 && !ka.has(key(n))) console.log('  kicad-only:', n.name, key(n));
}
