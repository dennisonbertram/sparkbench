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
        return send(res, 200, { ai: aiStatus(), kicad: !!KICAD_CLI, ngspice: !!NGSPICE });
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
