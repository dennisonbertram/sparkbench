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
        const { prompt, project, history, images, stream } = await body(req);
        const imgs = Array.isArray(images) ? images.filter((im: any) => /^image\/(jpeg|png|webp)$/.test(im?.mediaType) && typeof im?.data === 'string' && im.data.length < 8_000_000).slice(0, 3) : [];
        if (!stream) return send(res, 200, await aiDesign(prompt, project ?? undefined, history ?? [], imgs));
        // Streamed: one JSON line per phase ({"phase": "code"}), then {"result": …} or {"error": …}.
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        const line = (o: unknown) => !res.writableEnded && res.write(`${JSON.stringify(o)}\n`);
        try {
          line({ result: await aiDesign(prompt, project ?? undefined, history ?? [], imgs, (phase) => line({ phase })) });
        } catch (e: any) {
          line({ error: e?.message ?? String(e) });
        }
        return res.end();
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
      if (req.url?.startsWith('/api/firmware') && req.method === 'GET') {
        const board = new URL(req.url, 'http://x').searchParams.get('board');
        if (board !== 'esp32' && board !== 'pico') return send(res, 400, { error: 'board must be esp32 or pico' });
        const { latestFirmware } = await import('./firmware');
        const fw = await latestFirmware(board);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Firmware-Name', fw.name);
        res.setHeader('Content-Disposition', `attachment; filename="${fw.name}"`);
        return res.end(fw.data);
      }
      if (req.url === '/api/selftest' && req.method === 'POST') {
        const { project } = await body(req);
        const { generateSelfTest } = await import('../src/core/selftest');
        const { simulateSelfTest } = await import('../src/sim/selftest-sim');
        const { registerProjectParts } = await import('../src/core/customParts');
        registerProjectParts(project);
        return send(res, 200, { code: generateSelfTest(project), expected: await simulateSelfTest(project) });
      }
      if (req.url === '/api/ai/debug' && req.method === 'POST') {
        const { aiDebug, aiStatus } = await import('./ai');
        if (!aiStatus().enabled) return send(res, 400, { error: 'Debugging with AI needs Claude: set ANTHROPIC_API_KEY or log in to Claude Code.' });
        const { project, symptom, serial, selftest, images } = await body(req);
        const imgs = Array.isArray(images) ? images.filter((im: any) => /^image\/(jpeg|png|webp)$/.test(im?.mediaType) && typeof im?.data === 'string').slice(0, 3) : [];
        return send(res, 200, await aiDebug(project, { symptom: String(symptom ?? '').slice(0, 2000), serial: typeof serial === 'string' ? serial : undefined, selftest: typeof selftest === 'string' ? selftest : undefined, images: imgs }));
      }
      if (req.url === '/api/multimeter' && req.method === 'POST') {
        const { project } = await body(req);
        const { simulate } = await import('../src/sim/node-runner');
        const { multimeterChecks } = await import('../src/core/multimeter');
        const { registerProjectParts } = await import('../src/core/customParts');
        registerProjectParts(project);
        const at = Array.from({ length: 12 }, (_, i) => 1000 + i * 100);
        const r = await simulate(project, { untilMs: 2200, onFrameAt: at });
        const samples: Record<string, number[]> = {};
        for (const s of r.snapshots) for (const [k, v] of Object.entries(s.frame.nets ?? {})) (samples[k] ??= []).push(v);
        return send(res, 200, { checks: multimeterChecks(project, samples) });
      }
      if (req.url === '/api/sourcing' && req.method === 'POST') {
        const { project } = await body(req);
        const { sourceBom } = await import('./sourcing');
        const { registerProjectParts } = await import('../src/core/customParts');
        registerProjectParts(project);
        try {
          return send(res, 200, { lines: await sourceBom(project) });
        } catch (e: any) {
          return send(res, 502, { error: `Live prices are unavailable right now (${e?.message ?? e}).` });
        }
      }
      if (req.url === '/api/ai/explain' && req.method === 'POST') {
        const { aiExplainLine, aiStatus } = await import('./ai');
        if (!aiStatus().enabled) return send(res, 400, { error: 'Needs Claude.' });
        const { project, file, line } = await body(req);
        return send(res, 200, { explanation: await aiExplainLine(project, String(file ?? 'main.py'), Number(line) || 1) });
      }
      if (req.url === '/api/power' && req.method === 'POST') {
        const { project } = await body(req);
        const { simulate } = await import('../src/sim/node-runner');
        const { measureLoad, powerReport } = await import('../src/core/power');
        const { registerProjectParts } = await import('../src/core/customParts');
        registerProjectParts(project);
        const at = Array.from({ length: 120 }, (_, i) => 500 + i * 250);
        const r = await simulate(project, { untilMs: 31000, onFrameAt: at });
        const load = measureLoad(project, r.snapshots.map((s) => s.frame), 30, { wifi: (project.features ?? []).some((f: any) => f.kind === 'internet') });
        const json = JSON.parse(JSON.stringify(powerReport(project, load), (_k, v) => (v === Infinity ? 1e12 : v)));
        for (const o of json.options) if (o.mAh >= 1e12) o.mAh = null;
        return send(res, 200, json);
      }
      if (req.url === '/api/ota' && req.method === 'POST') {
        const { host, project } = await body(req);
        const { otaPush } = await import('./ota');
        try {
          return send(res, 200, { log: await otaPush(String(host ?? '').trim(), project.id, project.files) });
        } catch (e: any) {
          return send(res, 502, { error: String(e?.message ?? e) });
        }
      }
      if (req.url?.startsWith('/api/gallery') || req.url?.startsWith('/api/class') || req.url?.startsWith('/api/room')) {
        const cm = await import('./community');
        const u = new URL(req.url, 'http://x');
        const seg = u.pathname.split('/').filter(Boolean); // api, gallery|class|room, id?, action?
        const [, kind, key, action] = seg;
        if (kind === 'gallery') {
          if (!key && req.method === 'GET') return send(res, 200, { entries: cm.listGallery() });
          if (!key && req.method === 'POST') {
            const { project, author, blurb, name, update } = await body(req);
            const e = cm.publish(project, author, blurb, { name, update });
            return e ? send(res, 200, e) : send(res, 403, { error: 'That gallery entry can only be updated from the computer that published it.' });
          }
          if (key && action === 'like' && req.method === 'POST') {
            const e = cm.like(key);
            return e ? send(res, 200, e) : send(res, 404, { error: 'not found' });
          }
          if (key && action === 'delete' && req.method === 'POST') {
            const { editKey } = await body(req);
            return cm.unpublish(key, editKey) ? send(res, 200, { ok: true }) : send(res, 403, { error: 'Only the person who published it can take it down.' });
          }
          if (key && req.method === 'GET') {
            const g = cm.getGallery(key);
            if (!g) return send(res, 404, { error: 'not found' });
            const { editKey: _k, ...pub } = g;
            return send(res, 200, pub);
          }
        }
        if (kind === 'class') {
          if (!key && req.method === 'POST') {
            const { title, brief, requirements, teacher } = await body(req);
            if (!title || !Array.isArray(requirements) || !requirements.length) return send(res, 400, { error: 'Give the assignment a title and at least one requirement.' });
            return send(res, 200, cm.createAssignment({ title, brief: brief ?? '', requirements, teacher: teacher ?? '' }));
          }
          if (key && !action && req.method === 'GET') {
            const a = cm.getAssignment(key);
            return a ? send(res, 200, a) : send(res, 404, { error: 'No class with that code.' });
          }
          if (key && action === 'submit' && req.method === 'POST') {
            const a = cm.getAssignment(key);
            if (!a) return send(res, 404, { error: 'No class with that code.' });
            const { student, project } = await body(req);
            const { gradeSubmission } = await import('./grading');
            const grade = await gradeSubmission(project, a.requirements);
            return send(res, 200, cm.addSubmission(key, { student, project, grade }));
          }
          if (key && action === 'dashboard' && req.method === 'GET') {
            const d = cm.dashboard(key, u.searchParams.get('key') ?? '');
            return d ? send(res, 200, d) : send(res, 403, { error: 'Wrong teacher key.' });
          }
          if (key && action === 'submission' && req.method === 'GET') {
            const pr = cm.submissionProject(key, u.searchParams.get('key') ?? '', u.searchParams.get('id') ?? '');
            return pr ? send(res, 200, { project: pr }) : send(res, 404, { error: 'not found' });
          }
        }
        if (kind === 'room') {
          if (!key && req.method === 'POST') {
            const { project } = await body(req);
            return send(res, 200, { room: cm.createRoom(project) });
          }
          if (key && action === 'events' && req.method === 'GET') {
            if (!cm.joinRoom(key, u.searchParams.get('name') ?? '', res as any)) return send(res, 404, { error: 'This shared session has ended.' });
            return;
          }
          if (key && action === 'update' && req.method === 'POST') {
            const { project, version, by } = await body(req);
            return send(res, 200, cm.updateRoom(key, project, Number(version), by));
          }
          if (key && action === 'comment' && req.method === 'POST') {
            const { target, text, by } = await body(req);
            const c = cm.commentRoom(key, target, text, by);
            return c ? send(res, 200, c) : send(res, 404, { error: 'not found' });
          }
        }
        return send(res, 404, { error: 'not found' });
      }
      if (req.url === '/api/ai/arduino' && req.method === 'POST') {
        const { aiStatus } = await import('./ai');
        if (!aiStatus().enabled) return send(res, 400, { error: 'Making the Arduino version needs Claude.' });
        const { project } = await body(req);
        const { aiArduino } = await import('./arduino');
        try {
          return send(res, 200, await aiArduino(project));
        } catch (e: any) {
          return send(res, 422, { error: String(e?.message ?? e) });
        }
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
        const { project, fab, qrUrl, fixed, variant, panel } = await body(req);
        const okUrl = typeof qrUrl === 'string' && /^https?:\/\/\S{3,300}$/.test(qrUrl.trim()) ? qrUrl.trim() : undefined;
        const okFixed = fixed && typeof fixed === 'object' ? Object.fromEntries(Object.entries(fixed).filter(([, v]: any) => [v?.x, v?.y, v?.rot].every((n) => typeof n === 'number' && isFinite(n)))) : undefined;
        const job = startPcb(project, { fab: ['jlcpcb', 'pcbway', 'oshpark'].includes(fab) ? fab : 'jlcpcb', qrUrl: okUrl, fixed: okFixed as any, variant: variant === 'product' ? 'product' : 'prototype', panel: panel && [1, 2, 3].includes(panel.rows) && [1, 2, 3, 4].includes(panel.cols) ? { rows: panel.rows, cols: panel.cols } : undefined });
        return send(res, 200, { id: job.id, routing: tools.freerouting });
      }
      if (req.url === '/api/pcb/enclosure' && req.method === 'POST') {
        const { buildEnclosure } = await import('./pcbjobs');
        const { id, project, style } = await body(req);
        const st = ['rounded', 'minimal', 'wall-mount', 'desk-stand'].includes(style) ? style : 'rounded';
        const r = await buildEnclosure(String(id), project, st);
        if (!r) return send(res, 404, { error: 'Design the circuit board first.' });
        return send(res, 200, r);
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
          const types: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', csv: 'text/csv', json: 'application/json', stl: 'model/stl', md: 'text/markdown; charset=utf-8', pdf: 'application/pdf' };
          const view = u.searchParams.has('view');
          if (view && f.endsWith('.md')) {
            // Show a document as a readable page (beginners can't easily open .md files).
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.end(markdownPage(readFileSync(f, 'utf8')));
          }
          res.setHeader('Content-Type', types[f.split('.').pop()!] ?? 'application/octet-stream');
          if (!view && (!/\.(png|svg|stl)$/.test(f) || u.searchParams.has('download'))) res.setHeader('Content-Disposition', `attachment; filename="${f.split('/').pop()}"`);
          return res.end(readFileSync(f));
        }
        if (u.pathname === '/api/pcb/zip') {
          const kind = u.searchParams.get('kind') === 'all' ? 'all' : u.searchParams.get('kind') === 'panel' ? 'panel' : 'fab';
          const buf = await pcbZip(id, kind);
          if (!buf) return send(res, 404, { error: 'not ready' });
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${u.searchParams.get('name') || 'board'}-${kind === 'fab' ? 'gerbers' : kind === 'panel' ? 'panel-gerbers' : 'board-files'}.zip"`);
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

/** A small, safe Markdown-to-HTML page for the generated documents (headings, lists, checkboxes, code, bold). */
function markdownPage(md: string): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out: string[] = [];
  let list = false;
  let code = false;
  let title = 'Document';
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) {
      if (list) (out.push('</ul>'), (list = false));
      out.push(code ? '</pre>' : '<pre>');
      code = !code;
      continue;
    }
    if (code) {
      out.push(esc(line));
      continue;
    }
    const li = /^\s*-\s+(\[( |x)\]\s+)?(.*)$/.exec(line);
    if (li) {
      if (!list) (out.push('<ul>'), (list = true));
      out.push(`<li>${li[1] ? `<input type="checkbox"${li[2] === 'x' ? ' checked' : ''}> ` : ''}${inline(li[3])}</li>`);
      continue;
    }
    if (list) (out.push('</ul>'), (list = false));
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      if (h[1].length === 1) title = h[2];
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  if (code) out.push('</pre>');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px 16px;color:#1d1d1f;background:#fff}h1{font-size:1.6em}li{margin:4px 0;list-style:none}ul{padding-left:4px}input{margin-right:6px}pre{background:#f4f4f4;padding:10px;overflow:auto}code{background:#f4f4f4;padding:0 3px}@media print{body{padding:0}}@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}pre,code{background:#262626}}</style></head><body>${out.join('\n')}<p><button onclick="print()">Print</button></p></body></html>`;
}
