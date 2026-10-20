// Local API served by the Vite dev/preview server: AI copilot (Claude), KiCad and ngspice.
import type { Plugin, Connect } from 'vite';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const KICAD_CLI = [process.env.KICAD_CLI, join(homedir(), 'Applications/KiCad.app/Contents/MacOS/kicad-cli'), '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli', '/usr/bin/kicad-cli', '/usr/local/bin/kicad-cli'].find((p) => p && existsSync(p));
const NGSPICE = ['/opt/homebrew/bin/ngspice', '/usr/local/bin/ngspice', '/usr/bin/ngspice'].find((p) => existsSync(p));

function run(cmd: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 60000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ code: err ? (err as any).code ?? 1 : 0, stdout, stderr }));
  });
}

async function body(req: Connect.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function send(res: any, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export function apiPlugin(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    try {
      if (req.url === '/api/status') {
        const { aiStatus } = await import('./ai');
        const { pcbToolsStatus } = await import('./pcbjobs');
        return send(res, 200, { ai: aiStatus(), kicad: !!KICAD_CLI, ngspice: !!NGSPICE, pcb: pcbToolsStatus() });
      }
      if (req.url === '/api/ai/design' && req.method === 'POST') {
        const { aiDesign, aiStatus } = await import('./ai');
        if (!aiStatus().enabled) return send(res, 400, { error: 'No AI available: set ANTHROPIC_API_KEY or log in to Claude Code.' });
        const { prompt, project, history } = await body(req);
        return send(res, 200, await aiDesign(prompt, project ?? undefined, history ?? []));
      }
      if (req.url === '/api/ai/code' && req.method === 'POST') {
        const { aiEditFile, aiStatus } = await import('./ai');
        if (!aiStatus().enabled) return send(res, 400, { error: 'No AI available: set ANTHROPIC_API_KEY or log in to Claude Code.' });
        const { project, file, instruction, error, selection } = await body(req);
        return send(res, 200, await aiEditFile(project, file, instruction, { error, selection }));
      }
      if (req.url === '/api/ai/photo-check' && req.method === 'POST') {
        const { aiCheckPhoto, aiStatus } = await import('./ai');
        if (!aiStatus().enabled) return send(res, 400, { error: 'Checking a photo needs Claude: set ANTHROPIC_API_KEY or log in to Claude Code.' });
        const { project, images, note } = await body(req);
        const ok = Array.isArray(images) && images.length > 0 && images.length <= 4 && images.every((im: any) => /^image\/(jpeg|png|webp)$/.test(im?.mediaType) && typeof im?.data === 'string' && im.data.length < 8_000_000);
        if (!project || !ok) return send(res, 400, { error: 'Send 1–4 JPEG/PNG/WebP photos (under ~6 MB each).' });
        return send(res, 200, await aiCheckPhoto(project, images, typeof note === 'string' ? note.slice(0, 500) : undefined));
      }
      if (req.url === '/api/tests/run' && req.method === 'POST') {
        const { project } = await body(req);
        const { deriveTests } = await import('../src/core/acceptance');
        const { runTests } = await import('../src/sim/run-tests');
        const { registerProjectParts } = await import('../src/core/customParts');
        registerProjectParts(project);
        const tests = [...deriveTests(project), ...(project.tests ?? [])];
        return send(res, 200, { tests, results: await runTests(project, tests) });
      }
      if (req.url === '/api/ai/tests' && req.method === 'POST') {
        const { aiWriteTests, aiStatus } = await import('./ai');
        if (!aiStatus().enabled) return send(res, 400, { error: 'Writing tests from a sentence needs Claude: set ANTHROPIC_API_KEY or log in to Claude Code.' });
        const { project, text } = await body(req);
        const { runTests } = await import('../src/sim/run-tests');
        const tests = await aiWriteTests(project, String(text ?? '').slice(0, 1000), 'user');
        return send(res, 200, { tests, results: await runTests(project, tests) });
      }
      if (req.url === '/api/parts' && req.method === 'GET') {
        const { listParts } = await import('./parts');
        return send(res, 200, { parts: listParts() });
      }
      if (req.url === '/api/parts/fetch' && req.method === 'POST') {
        const { fetchPart } = await import('./parts');
        const { aiStatus } = await import('./ai');
        if (!aiStatus().enabled) return send(res, 400, { error: 'Fetching datasheets needs Claude: set ANTHROPIC_API_KEY or log in to Claude Code.' });
        const { query } = await body(req);
        try {
          return send(res, 200, await fetchPart(String(query ?? '').slice(0, 300)));
        } catch (e: any) {
          return send(res, 422, { error: String(e?.message ?? e) });
        }
      }
      if (req.url === '/api/kicad/render' && req.method === 'POST') {
        if (!KICAD_CLI) return send(res, 404, { error: 'kicad-cli not found' });
        const { sch, name } = await body(req);
        const dir = mkdtempSync(join(tmpdir(), 'sparkbench-kicad-'));
        const file = join(dir, `${name || 'project'}.kicad_sch`);
        writeFileSync(file, sch);
        const svg = await run(KICAD_CLI, ['sch', 'export', 'svg', '-o', dir, file]);
        const erc = await run(KICAD_CLI, ['sch', 'erc', '--format', 'json', '-o', join(dir, 'erc.json'), file]);
        const svgFile = readdirSync(dir).find((f) => f.endsWith('.svg'));
        return send(res, 200, {
          ok: svg.code === 0,
          svg: svgFile ? readFileSync(join(dir, svgFile), 'utf8') : null,
          erc: existsSync(join(dir, 'erc.json')) ? JSON.parse(readFileSync(join(dir, 'erc.json'), 'utf8')) : null,
          log: svg.stderr + erc.stderr,
        });
      }
      if (req.url === '/api/pcb/start' && req.method === 'POST') {
        const { startPcb, pcbToolsStatus } = await import('./pcbjobs');
        const tools = pcbToolsStatus();
        if (!tools.kicad) return send(res, 400, { error: 'Circuit boards need KiCad 8 or newer installed (kicad.org).' });
        const { project } = await body(req);
        const job = startPcb(project);
        return send(res, 200, { id: job.id, routing: tools.freerouting });
      }
      if (req.url?.startsWith('/api/pcb/') && req.method === 'GET') {
        const { pcbJob, pcbFile, pcbZip } = await import('./pcbjobs');
        const u = new URL(req.url, 'http://x');
        const id = u.searchParams.get('id') ?? '';
        if (u.pathname === '/api/pcb/status') {
          const job = pcbJob(id);
          if (!job) return send(res, 404, { error: 'unknown job' });
          return send(res, 200, { log: job.log, done: job.done, error: job.error, result: job.result && { ...job.result, dir: undefined } });
        }
        if (u.pathname === '/api/pcb/file') {
          const f = pcbFile(id, u.searchParams.get('path') ?? '');
          if (!f) return send(res, 404, { error: 'not found' });
          const types: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', csv: 'text/csv', json: 'application/json' };
          res.setHeader('Content-Type', types[f.split('.').pop()!] ?? 'application/octet-stream');
          if (!/\.(png|svg)$/.test(f)) res.setHeader('Content-Disposition', `attachment; filename="${f.split('/').pop()}"`);
          return res.end(readFileSync(f));
        }
        if (u.pathname === '/api/pcb/zip') {
          const kind = u.searchParams.get('kind') === 'all' ? 'all' : 'fab';
          const buf = await pcbZip(id, kind);
          if (!buf) return send(res, 404, { error: 'not ready' });
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${u.searchParams.get('name') || 'board'}-${kind === 'fab' ? 'gerbers' : 'board-files'}.zip"`);
          return res.end(buf);
        }
      }
      if (req.url === '/api/spice/run' && req.method === 'POST') {
        if (!NGSPICE) return send(res, 404, { error: 'ngspice not found' });
        const { cir } = await body(req);
        const dir = mkdtempSync(join(tmpdir(), 'sparkbench-spice-'));
        writeFileSync(join(dir, 'circuit.cir'), cir);
        const out = await run(NGSPICE, ['-b', 'circuit.cir'], dir);
        return send(res, 200, { code: out.code, stdout: out.stdout, stderr: out.stderr });
      }
      send(res, 404, { error: 'not found' });
    } catch (e: any) {
      send(res, 500, { error: String(e?.message ?? e) });
    }
  };
  return {
    name: 'sparkbench-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
