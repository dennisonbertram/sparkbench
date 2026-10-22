import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CompatibilityJob, CompatibilityReport } from '../src/core/compatibility';
import type { Project } from '../src/core/types';
import { validateCompatibilityProject } from './compatibility';

async function execute(project: Project): Promise<CompatibilityReport> {
  const dir = await mkdtemp(join(tmpdir(), 'sparkbench-compatibility-'));
  try {
    await writeFile(join(dir, 'project.json'), JSON.stringify(project), { mode: 0o600 });
    await new Promise<void>((done, reject) => {
      const child = spawn(process.execPath, ['--max-old-space-size=256', '--import', 'tsx', resolve('scripts/compatibility-worker.ts'), join(dir, 'project.json'), dir], {
        detached: true, stdio: ['ignore', 'ignore', 'pipe'],
        env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, LANG: 'C.UTF-8', KICAD_CLI: process.env.KICAD_CLI },
      });
      let error = '';
      let timedOut = false;
      child.stderr.on('data', (chunk) => { if (error.length < 4000) error += chunk.toString().slice(0, 4000 - error.length); });
      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
      }, 210_000);
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
        if (timedOut) reject(new Error('Compatibility worker exceeded 210 seconds'));
        else if (code !== 0) reject(new Error(`Compatibility worker failed: ${error || code}`));
        else done();
      });
    });
    return JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const send = (res: ServerResponse, code: number, value: unknown) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

export function createCompatibilityHandler(options: {
  enabled?: boolean; token?: string; run?: typeof execute;
} = {}) {
  const enabled = options.enabled ?? (process.env.SPARKBENCH_COMPATIBILITY_ENABLED === '1' && process.platform !== 'win32');
  const token = options.token ?? process.env.SPARKBENCH_COMPATIBILITY_TOKEN ?? '';
  const configured = enabled && token.length >= 32;
  const run = options.run ?? execute;
  const jobs = new Map<string, { job: CompatibilityJob; expires: number }>();
  const queue: { id: string; project: Project }[] = [];
  let active = false;
  let reading = 0;
  let admitted: number[] = [];

  async function pump() {
    if (active || !queue.length) return;
    active = true;
    const item = queue.shift()!;
    const entry = jobs.get(item.id)!;
    entry.job.state = 'running';
    try {
      entry.job.report = await run(item.project);
      entry.job.state = 'finished';
    } catch (err) {
      entry.job.state = 'failed';
      entry.job.error = String(err).slice(0, 4000);
    } finally {
      entry.expires = Date.now() + 3_600_000;
      active = false;
      void pump();
    }
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const path = (req.url ?? '').split('?')[0];
    if (!path.startsWith('/api/compatibility/')) return false;
    if (path === '/api/compatibility/status' && req.method === 'GET') {
      send(res, 200, { enabled: configured, requiresToken: true, target: 'KiCad', reason: configured ? null : 'The optional lab is disabled. An operator must enable it and configure a 32+ character token.' });
      return true;
    }
    if (!configured) { send(res, 503, { error: 'Compatibility lab is disabled' }); return true; }
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const required = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== required.length || !timingSafeEqual(supplied, required)) { send(res, 401, { error: 'A valid lab access token is required' }); return true; }
    for (const [id, entry] of jobs) if (entry.expires < Date.now()) jobs.delete(id);
    if (req.method === 'GET' && /^\/api\/compatibility\/jobs\/[a-f0-9]{32}$/.test(path)) {
      const entry = jobs.get(path.split('/').pop()!);
      send(res, entry ? 200 : 404, entry?.job ?? { error: 'Job not found or expired' });
      return true;
    }
    if (req.method !== 'POST' || path !== '/api/compatibility/jobs') { send(res, 404, { error: 'Unknown compatibility endpoint' }); return true; }
    admitted = admitted.filter((t) => Date.now() - t < 600_000);
    if (queue.length + reading >= 3 || admitted.length >= 10 || jobs.size >= 20) { send(res, 429, { error: 'Lab busy or rate limit reached. Retry later.' }); return true; }
    if (!req.headers['content-type']?.startsWith('application/json')) { send(res, 415, { error: 'Expected application/json' }); return true; }
    reading++;
    admitted.push(Date.now());
    const timer = setTimeout(() => req.destroy(new Error('Request body timeout')), 10_000);
    try {
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 2_000_000) { send(res, 413, { error: 'Project exceeds 2 MB limit' }); return true; }
        chunks.push(chunk);
      }
      const project = validateCompatibilityProject(JSON.parse(Buffer.concat(chunks).toString()).project);
      const job: CompatibilityJob = { id: randomBytes(16).toString('hex'), state: 'queued' };
      jobs.set(job.id, { job, expires: Number.POSITIVE_INFINITY });
      queue.push({ id: job.id, project });
      send(res, 202, job);
      void pump();
    } catch (err) {
      if (!res.writableEnded && !res.destroyed) send(res, 400, { error: String(err).slice(0, 2000) });
    } finally { clearTimeout(timer); reading--; }
    return true;
  };
}

export const compatibilityHandler = createCompatibilityHandler();
