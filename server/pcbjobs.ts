// Circuit-board builds run as background jobs (they take 10–60 s): start one, poll its progress,
// then fetch the render, files and zips. Identical designs reuse the finished job.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';
import JSZip from 'jszip';
import type { Project } from '../src/core/types';
import { pcbSpec } from '../src/core/pcb';
import { buildPcb, pcbToolsStatus, type PcbResult } from './pcb';

interface Job {
  id: string;
  log: string[];
  done: boolean;
  error?: string;
  result?: PcbResult;
}
const jobs = new Map<string, Job>();
const ROOT = join(tmpdir(), 'sparkbench-pcb');

export function startPcb(project: Project): Job {
  const id = createHash('sha1').update(JSON.stringify(pcbSpec(project))).digest('hex').slice(0, 16);
  const existing = jobs.get(id);
  if (existing && !existing.error) return existing;
  const job: Job = { id, log: [], done: false };
  jobs.set(id, job);
  buildPcb(project, join(ROOT, id), (m) => job.log.push(m))
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
