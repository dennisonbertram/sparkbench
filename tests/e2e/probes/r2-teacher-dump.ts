import { buildExample } from '../../../src/core/examples';
import { buildGuide, buildBlogPost } from '../../../src/core/docs';
import { buildBom } from '../../../src/core/bom';
import { writeFileSync } from 'fs';
const ids = ['esp32-eink-weather','esp32-internet-clock','rpi-weather-dashboard','555-tone','esp32-pedometer'];
for (const id of ids) {
  const p: any = buildExample(id);
  const g = buildGuide(p), b = buildBlogPost(p, { schematicSvgPath: 'schematic.svg' });
  const bom = buildBom(p);
  let out = `# ${id} board=${p.board}\n## PARTS\n${JSON.stringify(p.parts.map((x:any)=>[x.id,x.type,x.props]),null,0)}\n## WIRES\n${p.wires.map((w:any)=>`${w.from}->${w.to}`).join('  ')}\n## BOM\n${JSON.stringify(bom,null,1)}\n`;
  for (const [f,c] of Object.entries(p.files)) out += `## FILE ${f}\n${c}\n`;
  out += `## GUIDE\n${g}\n## BLOG\n${b}\n`;
  writeFileSync(`test-results/qa2/teacher/${id}.txt`, out);
}
