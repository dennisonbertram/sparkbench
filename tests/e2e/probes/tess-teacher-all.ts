import { EXAMPLES, buildExample } from '../../../src/core/examples';
import { buildGuide, buildBlogPost } from '../../../src/core/docs';
import { buildBom } from '../../../src/core/bom';
for (const ex of EXAMPLES as any[]) {
  const id = ex.id;
  const p = buildExample(id);
  const g = buildGuide(p), b = buildBlogPost(p, { schematicSvgPath: 'schematic.svg' });
  const issues: string[] = [];
  for (const [n, t] of [['guide', g], ['blog', b]] as const) {
    if (/undefined|NaN|\[object|null\b/.test(t)) issues.push(`${n}: bad token ${t.match(/.{0,40}(undefined|NaN|\[object|null\b).{0,20}/)?.[0]}`);
    if (/while True:\nwhile True:/.test(t)) issues.push(`${n}: duplicated while True`);
    const m = t.match(/Add the [a-z]+[A-Z]\w+/g); if (m) issues.push(`${n}: odd heading ${m.join(',')}`);
    if (p.board === 'rpi4' && /i2c\.scan\(\)|MicroPython's driver|REPL/.test(t)) issues.push(`${n}: MicroPython-only advice on Pi: ${t.match(/.{0,30}(i2c\.scan\(\)|MicroPython's driver|REPL).{0,10}/g)?.join(' || ')}`);
    if (p.board === 'none' && /firmware|mpremote/.test(t)) issues.push(`${n}: firmware text on no-MCU`);
    // repeated consecutive sentences
    const lines = t.split('\n'); for (let i=1;i<lines.length;i++) if (lines[i].trim() && lines[i]===lines[i-1] && !lines[i].startsWith('|')) issues.push(`${n}: repeated line "${lines[i].slice(0,50)}"`);
  }
  const bom = buildBom(p) as any;
  console.log(`== ${id} (${p.board}) parts=${p.parts.length} wires=${p.wires.length} files=${Object.keys(p.files).join(',')}`);
  for (const i of issues) console.log('   ', i);
}
