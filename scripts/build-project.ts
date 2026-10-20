// Build a project end-to-end from the command line and write every deliverable to disk:
//   npx tsx scripts/build-project.ts "Pico traffic light"            (from a prompt)
//   npx tsx scripts/build-project.ts --example pico-traffic-light      (from the gallery)
//   npx tsx scripts/build-project.ts --all-examples                   (all of them)
// Output: out/<slug>/{firmware/*, schematic.svg, breadboard.svg, *.kicad_sch, *.net, *.cir, bom.csv, BUILD.md, BLOG.md, simulation.log, checks.txt}
import { planBreadboard } from '../src/core/bbplace';
import { renderBreadboardSvg } from '../src/core/breadboard';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planFromPrompt } from '../src/core/planner';
import { EXAMPLES, buildExample } from '../src/core/examples';
import { renderSchematicSvg } from '../src/core/schematic';
import { exportKicadSchematic, exportKicadProject, exportKicadNetlist, exportKicadFootprints } from '../src/core/kicad';
import { exportSpice, defaultSpiceOptions } from '../src/core/spice';
import { buildBom, bomToCsv, bomTotal } from '../src/core/bom';
import { buildGuide, buildBlogPost } from '../src/core/docs';
import { runChecks } from '../src/core/checks';
import { simulate } from '../src/sim/node-runner';
import type { Project } from '../src/core/types';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function emit(project: Project, outRoot = 'out') {
  const name = slug(project.name);
  const dir = join(outRoot, name);
  mkdirSync(join(dir, 'firmware'), { recursive: true });
  for (const [f, src] of Object.entries(project.files)) writeFileSync(join(dir, 'firmware', f), src);
  writeFileSync(join(dir, 'schematic.svg'), renderSchematicSvg(project, { theme: 'light' }));
  writeFileSync(join(dir, 'breadboard.svg'), renderBreadboardSvg(planBreadboard(project).layout, { labels: true }));
  writeFileSync(join(dir, `${name}.kicad_sch`), exportKicadSchematic(project));
  writeFileSync(join(dir, `${name}.kicad_pro`), exportKicadProject(project));
  writeFileSync(join(dir, `${name}.net`), exportKicadNetlist(project));
  for (const [f, src] of Object.entries(exportKicadFootprints(project))) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), src);
  }
  writeFileSync(join(dir, `${name}.cir`), exportSpice(project, defaultSpiceOptions(project)));
  const bom = buildBom(project);
  writeFileSync(join(dir, 'bom.csv'), bomToCsv(bom));
  writeFileSync(join(dir, 'BUILD.md'), buildGuide(project));
  writeFileSync(join(dir, 'BLOG.md'), buildBlogPost(project, { schematicSvgPath: 'schematic.svg' }));
  writeFileSync(join(dir, 'project.sparkbench.json'), JSON.stringify(project, null, 2));
  const checks = runChecks(project);
  writeFileSync(join(dir, 'checks.txt'), checks.map((c) => `[${c.severity}] ${c.title} — ${c.detail}`).join('\n') || 'No problems found.');
  // Press every button halfway through so button-driven circuits show their behaviour too.
  const buttons = project.parts.filter((p) => p.type === 'pushbutton');
  const inputs = buttons.flatMap((b) => [{ atMs: 2500, part: b.id, key: 'pressed', value: 1 }, { atMs: 3500, part: b.id, key: 'pressed', value: 0 }]);
  const at = [500, 1000, 1500, 2000, 2700, 3000, 3300, 4000, 4500];
  const { engine, snapshots } = await simulate(project, { untilMs: 5000, inputs, onFrameAt: at });
  const state = (f: any) =>
    project.parts
      .map((p) => {
        const v = f.parts[p.id] ?? {};
        const bits: string[] = [];
        if (v.led !== undefined) bits.push(`${p.ref} ${v.led > 0.05 ? `ON ${(v.ma ?? 0).toFixed(1)} mA` : 'off'}`);
        if (v.rgb) bits.push(`${p.ref} rgb(${v.rgb.map((x: number) => Math.round(x * 255)).join(',')})`);
        if (v.tone) bits.push(`${p.ref} tone ${v.tone} Hz`);
        if (v.angle !== undefined && p.type === 'servo') bits.push(`${p.ref} ${Math.round(v.angle)}°`);
        if (v.relay !== undefined) bits.push(`${p.ref} relay ${v.relay ? 'ON' : 'off'}`);
        if (v.spin) bits.push(`${p.ref} motor running`);
        if (v.lcd) bits.push(`${p.ref} "${String.fromCharCode(...v.lcd.chars.slice(0, 16)).trimEnd()} / ${String.fromCharCode(...v.lcd.chars.slice(16)).trimEnd()}"`);
        if (v.oledOn) bits.push(`${p.ref} OLED drawing (${v.oled.filter((b: number) => b).length} lit bytes)`);
        if (v.epaper?.refreshes) bits.push(`${p.ref} e-paper refreshed ×${v.epaper.refreshes}`);
        return bits.join(', ');
      })
      .filter(Boolean)
      .join(' | ');
  writeFileSync(
    join(dir, 'simulation.log'),
    [
      `status: ${engine.status} after ${(engine.timeUs / 1e6).toFixed(1)} s simulated`,
      engine.error ? `error: ${engine.error.raw}` : 'error: none',
      ...engine.allWarnings.map((w) => `${w.severity}: ${w.text}`),
      buttons.length ? `--- outputs (buttons held from 2.5 s to 3.5 s) ---` : '--- outputs ---',
      ...snapshots.map((s) => `t=${(s.atMs / 1000).toFixed(1)}s  ${state(s.frame) || '(no visible outputs)'}`),
      '--- serial ---',
      ...engine.serialAll,
    ].join('\n'),
  );
  const total = bomTotal(bom) as any;
  console.log(`${project.name.padEnd(36)} parts=${project.parts.length} wires=${project.wires.length} bom=$${Number(typeof total === 'number' ? total : total.total).toFixed(2)} checks(err)=${checks.filter((c) => c.severity === 'error').length} sim=${engine.error ? 'CRASH' : 'ok'} → ${dir}`);
  return !engine.error;
}

const args = process.argv.slice(2);
let ok = true;
if (args[0] === '--all-examples') for (const ex of EXAMPLES) ok = (await emit(buildExample(ex.id))) && ok;
else if (args[0] === '--example') ok = await emit(buildExample(args[1]));
else ok = await emit(planFromPrompt(args.join(' ') || 'ESP32 with an OLED screen, two buttons, a temperature sensor and an IMU'));
process.exit(ok ? 0 : 1);
