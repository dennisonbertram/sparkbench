// Downloads: everything as one ZIP, or individual files.
import JSZip from 'jszip';
import type { Project } from '../core/types';
import { exportKicadSchematic, exportKicadProject, exportKicadNetlist, exportKicadFootprints } from '../core/kicad';
import { renderSchematicSvg } from '../core/schematic';
import { exportSpice } from '../core/spice';
import { buildBom, bomToCsv } from '../core/bom';
import { buildGuide, buildBlogPost } from '../core/docs';

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

export function download(name: string, data: string | Blob, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function buildZip(project: Project): Promise<Blob> {
  const zip = new JSZip();
  const name = slug(project.name);
  const root = zip.folder(name)!;
  const hasCode = Object.keys(project.files).length > 0;
  if (hasCode) {
    const fw = root.folder('firmware')!;
    for (const [f, src] of Object.entries(project.files)) fw.file(f, src);
  }
  const hw = root.folder('hardware')!;
  hw.file(`${name}.kicad_sch`, exportKicadSchematic(project));
  hw.file(`${name}.kicad_pro`, exportKicadProject(project));
  hw.file(`${name}.net`, exportKicadNetlist(project));
  for (const [f, src] of Object.entries(exportKicadFootprints(project))) hw.file(f, src);
  hw.file(`${name}.cir`, exportSpice(project, project.board === 'none' ? { analysis: 'tran', tranStop: 3, tranStep: 1e-4 } : {}));
  root.file('schematic.svg', renderSchematicSvg(project, { theme: 'light' }));
  root.file('bom.csv', bomToCsv(buildBom(project)));
  root.file('BUILD.md', buildGuide(project));
  root.file('BLOG.md', buildBlogPost(project, { schematicSvgPath: 'schematic.svg' }));
  root.file('project.sparkbench.json', JSON.stringify(project, null, 2));
  root.file(
    'README.md',
    `# ${project.name}\n\n${project.summary}\n\n${hasCode ? '- `firmware/` — copy these files to the board (see BUILD.md)\n' : ''}- \`hardware/\` — KiCad schematic, project and netlist; SPICE netlist for ngspice\n- \`schematic.svg\`, \`bom.csv\`, \`BUILD.md\`, \`BLOG.md\`\n- \`project.sparkbench.json\` — open this in Sparkbench (Projects → Import)\n`,
  );
  return zip.generateAsync({ type: 'blob' });
}

export async function downloadZip(project: Project) {
  download(`${slug(project.name)}.zip`, await buildZip(project));
}
