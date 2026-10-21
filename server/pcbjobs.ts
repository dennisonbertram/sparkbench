// Circuit-board builds run as background jobs (they take 10–60 s): start one, poll its progress,
// then fetch the render, files and zips. Identical designs reuse the finished job.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';
import JSZip from 'jszip';
import type { Project } from '../src/core/types';
import { pcbSpec } from '../src/core/pcb';
import { buildPcb, pcbToolsStatus, type PcbResult, type PcbOptions } from './pcb';

interface Job {
  id: string;
  log: string[];
  done: boolean;
  error?: string;
  result?: PcbResult;
}
const jobs = new Map<string, Job>();
const ROOT = join(tmpdir(), 'sparkbench-pcb');

export function startPcb(project: Project, opts: PcbOptions = {}): Job {
  const id = createHash('sha1').update(JSON.stringify([pcbSpec(project, { fab: opts.fab }), opts.qrUrl ?? '', project.revision ?? 'A', opts.fixed ?? null, opts.variant ?? 'prototype'])).digest('hex').slice(0, 16);
  const existing = jobs.get(id);
  if (existing && !existing.error) return existing;
  const job: Job = { id, log: [], done: false };
  jobs.set(id, job);
  buildPcb(project, join(ROOT, id), (m) => job.log.push(m), opts)
    .then((r) => (job.result = r))
    .catch((e) => (job.error = String(e?.message ?? e)))
    .finally(() => (job.done = true));
  return job;
}

export const pcbJob = (id: string) => jobs.get(id);
export { pcbToolsStatus };

/** Absolute path of a job file, refusing anything outside the job folder. */
export function pcbFile(id: string, path: string): string | null {
  if (!/^[0-9a-f]{16}$/.test(id)) return null;
  const dir = join(ROOT, id);
  const full = normalize(join(dir, path));
  return full.startsWith(dir + sep) && existsSync(full) ? full : null;
}

/** "fab": what the PCB factory needs (Gerbers + drill). "all": every board file. */
export async function pcbZip(id: string, kind: 'fab' | 'all'): Promise<Buffer | null> {
  const job = jobs.get(id);
  if (!job?.result) return null;
  const zip = new JSZip();
  const files = job.result.files.filter((f) => (kind === 'fab' ? f.startsWith('fab/gerbers/') : true));
  for (const f of files) zip.file(kind === 'fab' ? f.slice('fab/gerbers/'.length) : `${job.result.name}-board/${f}`, readFileSync(join(job.result.dir, f)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** Generate the 3D-printable case for a finished board job (fast: plain JS CAD). */
export async function buildEnclosure(id: string, project: Project, style: import('../src/core/enclosure').CaseStyle) {
  const job = jobs.get(id);
  if (!job?.result) return null;
  const { buildCase } = await import('../src/core/enclosure');
  const { annotate } = await import('../src/core/netlist');
  const stlNs: any = await import('@jscad/stl-serializer');
  const stl = stlNs.default ?? stlNs;
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const layout = JSON.parse(readFileSync(join(job.result.dir, 'layout.json'), 'utf8'));
  let p = project.parts.some((x) => !x.ref) ? annotate(project) : project;
  if (job.result.variant === 'product') p = (await import('../src/core/production')).productionize(project).project;
  const types = Object.fromEntries(p.parts.map((x) => [x.ref ?? x.id, x.type]));
  const r = buildCase({ board: layout, types, style, name: p.name });
  const dir = join(job.result.dir, 'enclosure', style);
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const { solidToStep } = await import('../src/core/step');
  for (const part of r.parts) {
    const buf = Buffer.concat(stl.serialize({ binary: true }, part.geom).map((d: ArrayBuffer) => Buffer.from(d)));
    writeFileSync(join(dir, `${part.name}.stl`), buf);
    files.push(`enclosure/${style}/${part.name}.stl`);
    if (part.name.startsWith('case-')) {
      writeFileSync(join(dir, `${part.name}.step`), solidToStep(part.geom, part.name));
      files.push(`enclosure/${style}/${part.name}.step`);
    }
  }
  const notes = [`# ${p.name} case (${style})`, '', `Outside: ${r.outer.w} × ${r.outer.d} × ${r.outer.h} mm. Tallest part: ${r.tallest.ref} (${r.tallest.h} mm above the board).`, '', '## Print', '', ...r.parts.map((x) => `- \`${x.name}.stl\`: ${x.note}`), '', '## Openings', '', ...r.openings.map((o) => `- ${o.where}: ${o.ref ? `${o.ref} — ` : ''}${o.what}`), '', '## Assemble', '', '1. Screw the board onto the four posts with M3 × 6 mm self-tapping screws.', '2. Push the button caps into their lid holes from inside (flange inside).', '3. Press the lid on; the lip holds it. A dab of glue makes it permanent.', ...(r.warnings.length ? ['', '## Notes', '', ...r.warnings.map((w) => `- ${w}`)] : []), ''].join('\n');
  writeFileSync(join(dir, 'CASE.md'), notes);
  files.push(`enclosure/${style}/CASE.md`);
  job.result.files = [...new Set([...job.result.files, ...files])];
  return { files, outer: r.outer, openings: r.openings, warnings: r.warnings, tallest: r.tallest, notes: r.parts.map((x) => ({ name: x.name, note: x.note })), board: { w: layout.width_mm, d: layout.height_mm, holes: layout.holes } };
}
