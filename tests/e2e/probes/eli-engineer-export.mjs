// eli-engineer: emit deliverables of 4 examples into test-results/qa/eli-engineer/<id>/
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildExample } from '../../../src/core/examples.ts';
import { renderSchematicSvg } from '../../../src/core/schematic.ts';
import { exportKicadSchematic, exportKicadProject, exportKicadNetlist } from '../../../src/core/kicad.ts';
import { exportSpice } from '../../../src/core/spice.ts';
import { buildBom, bomToCsv } from '../../../src/core/bom.ts';
import { runChecks } from '../../../src/core/checks.ts';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['esp32-weather-imu','rpi-plant-waterer','esp32-parking-sensor','555-blinker'];
for (const id of ids) {
  const p = buildExample(id);
  const d = join('test-results/qa/eli-engineer', id); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'schematic.svg'), renderSchematicSvg(p, { theme: 'light' }));
  writeFileSync(join(d, `${id}.kicad_sch`), exportKicadSchematic(p));
  writeFileSync(join(d, `${id}.kicad_pro`), exportKicadProject(p));
  writeFileSync(join(d, `${id}.net`), exportKicadNetlist(p));
  writeFileSync(join(d, `${id}.cir`), exportSpice(p));
  writeFileSync(join(d, 'bom.csv'), bomToCsv(buildBom(p)));
  writeFileSync(join(d, 'project.json'), JSON.stringify(p, null, 2));
  writeFileSync(join(d, 'checks.txt'), runChecks(p).map(c => `[${c.severity}] ${c.title} — ${c.detail}`).join('\n'));
  console.log(id, p.parts.length, p.wires.length);
}
