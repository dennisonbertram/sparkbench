import type { Connect } from 'vite';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import type { Project } from '../src/core/types';
import { BOARDS } from '../src/core/boards';
import { partDef } from '../src/core/parts';
import { SimEngine, type SimFrame } from '../src/sim/engine';
import { buildEsp32FirmwareExample } from '../src/core/firmwareExample';

const FLASH_SIZE = 4 * 1024 * 1024;
const MAX_BODY = 8 * 1024 * 1024;
const MAX_SERIAL = 256 * 1024;
const MAX_RESPONSE = 32 * 1024 * 1024;
const CACHE = process.env.SPARKBENCH_CACHE ?? join(homedir(), '.cache', 'sparkbench');
const helperPath = () => process.env.SPARKBENCH_ESP32_HELPER ?? join(CACHE, 'esp32', 'sparkbench-esp32-helper');
const qemuPath = () => process.env.SPARKBENCH_ESP32_QEMU ?? join(CACHE, 'qemu', 'build', 'libqemu-xtensa.so');
const romPath = () => process.env.SPARKBENCH_ESP32_ROM ?? join(CACHE, 'qemu', 'pc-bios');
const demoPath = () => process.env.SPARKBENCH_ESP32_FIRMWARE ?? join(CACHE, 'esp32', 'firmware', 'esp32-gpio-blink-4mb.bin');

type Session = {
  id: string;
  project: Project;
  model: import('../src/core/circuit').ElectricalModel;
  engine: SimEngine;
  child: ChildProcessWithoutNullStreams;
  dir: string;
  response: ServerResponse;
  done: boolean;
  serialBytes: number;
  stdoutBytes: number;
  stderrBytes: number;
  stderrBuffer: string;
  responseBytes: number;
  serialBuffer: string;
  modes: Map<number, boolean>;
  levels: Map<number, number>;
  timer?: NodeJS.Timeout;
  timeout?: NodeJS.Timeout;
  stopping?: Promise<void>;
};
const sessions = new Map<string, Session>();
let startingSessions = 0;

function json(res: ServerResponse, status: number, value: unknown) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value));
}

async function requestBody(req: Connect.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.from(chunk as Buffer);
    size += b.length;
    if (size > MAX_BODY) throw new Error('request body exceeds 8 MiB');
    chunks.push(b);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function localRequest(req: Connect.IncomingMessage) {
  const address = req.socket.remoteAddress;
  if (address && address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.host === req.headers.host;
  } catch {
    return false;
  }
}

export function validateEsp32Firmware(image: Buffer): void {
  if (image.length !== FLASH_SIZE) throw new Error('ESP32 firmware must be an exactly 4 MiB merged flash image');
  const header = (offset: number, name: string) => {
    if (image[offset] !== 0xe9) throw new Error(`${name} image header is missing (expected 0xE9)`);
    if (!image[offset + 1]) throw new Error(`${name} image has no segments`);
    if (image.readUInt16LE(offset + 12) !== 0) throw new Error(`${name} image is not for classic ESP32 (chip id 0x0000)`);
  };
  header(0x1000, 'bootloader');
  header(0x10000, 'application');
}

export function validateEsp32Project(project: Project): void {
  if (!project || project.board !== 'esp32' || !Array.isArray(project.parts) || !Array.isArray(project.wires) ||
    project.parts.length > 100 || project.wires.length > 500) {
    throw new Error('native ESP32 mode requires an esp32 project with parts and wires');
  }
  const allowed = new Set(['esp32-devkit', 'resistor', 'led', 'pushbutton', 'slide-switch']);
  if (project.parts.filter((p) => !allowed.has(p.type)).length) {
    throw new Error('native ESP32 mode supports only the ESP32 DevKit, resistors, LEDs, pushbuttons, and slide switches');
  }
  const boards = project.parts.filter((p) => p.type === 'esp32-devkit');
  if (boards.length !== 1) throw new Error('native ESP32 mode requires exactly one ESP32 DevKit V1 board');
  const pins = new Map(partDef('esp32-devkit').pins.map((p) => [p.name, p]));
  const ids = new Set(project.parts.map((p) => p.id));
  for (const wire of project.wires) {
    for (const ref of [wire.a, wire.b]) {
      const part = project.parts.find((p) => p.id === ref.part);
      if (!part || !partDef(part.type).pins.some((p) => p.name === ref.pin)) throw new Error(`wire ${wire.id} references an unknown pin`);
    }
  }
  if (!ids.has(boards[0].id) || !pins.has('D2') || !pins.has('D4')) throw new Error('ESP32 GPIO2/GPIO4 pins are unavailable');
}

function runtimeStatus() {
  const available = existsSync(helperPath()) && existsSync(qemuPath()) && existsSync(join(romPath(), 'esp32-v3-rom.bin')) && existsSync(join(romPath(), 'esp32-v3-rom-app.bin'));
  const demoAvailable = available && existsSync(demoPath());
  return { available, demoAvailable, ...(available ? {} : { reason: 'Build the pinned QEMU library and native helper; see docs/esp32-runtime.md.' }), capabilities: ['gpio', 'serial'] };
}

function emit(session: Session, event: unknown) {
  if (session.done || session.response.writableEnded || session.response.destroyed || session.response.writableNeedDrain) return;
  const line = `${JSON.stringify(event)}\n`;
  session.responseBytes += Buffer.byteLength(line);
  if (session.responseBytes > MAX_RESPONSE) {
    session.response.end();
    void stopSession(session);
    return;
  }
  const ok = session.response.write(line);
  if (!ok) session.child.stdout.pause();
}

function stopSession(session: Session): Promise<void> {
  if (session.done) return Promise.resolve();
  if (session.stopping) return session.stopping;
  session.stopping = (async () => {
    if (session.timer) clearInterval(session.timer);
    if (session.timeout) clearTimeout(session.timeout);
    try { session.child.stdin.write('{"type":"stop"}\n'); } catch {}
    const killTimer = setTimeout(() => {
      if (session.child.exitCode === null && session.child.signalCode === null) session.child.kill('SIGKILL');
    }, 1000);
    if (session.child.exitCode === null && session.child.signalCode === null) {
      await new Promise<void>((resolve) => session.child.once('close', () => { clearTimeout(killTimer); resolve(); }));
    } else clearTimeout(killTimer);
    session.done = true;
    sessions.delete(session.id);
    await rm(session.dir, { recursive: true, force: true }).catch(() => {});
    if (!session.response.writableEnded && !session.response.destroyed) {
      session.response.write(`${JSON.stringify({ type: 'done' })}\n`);
      session.response.end();
    }
  })();
  return session.stopping;
}

function syncInput(session: Session) {
  session.model.solve();
  const level = session.model.readDigital(4);
  try { session.child.stdin.write(`{"type":"pin","gpio":4,"value":${level}}\n`); } catch {}
}

function updateFrame(session: Session) {
  session.engine.status = 'running';
  syncInput(session);
  emit(session, { type: 'frame', frame: session.engine.frame() });
}

async function startSession(project: Project, image: Buffer, name: string, res: ServerResponse, inputs: Record<string, number> = {}) {
  validateEsp32Project(project);
  validateEsp32Firmware(image);
  if (!runtimeStatus().available) throw new Error('native ESP32 runtime is not built');
  if (sessions.size + startingSessions >= 2) throw new Error('native ESP32 runtime is busy');
  const host = { waitUs() {}, wallNowMs: () => Date.now(), pollInputs: () => null, shouldStop: () => false, emit() {} };
  const engine = new SimEngine(project, host, { mode: 'realtime', frameMs: 0 });
  const model = engine.model;
  model.setPinMode(2, { kind: 'unused' });
  model.setPinMode(4, { kind: 'in', pull: 'none' });
  for (const [partId, state] of Object.entries(inputs)) {
    const part = project.parts.find((p) => p.id === partId);
    if (!part || !Number.isFinite(Number(state))) continue;
    if (part.type === 'pushbutton') model.setPartState(partId, 'pressed', Number(state) ? 1 : 0);
    if (part.type === 'slide-switch') model.setPartState(partId, 'position', Number(state) ? 1 : 0);
  }
  startingSessions++;
  const id = randomBytes(18).toString('base64url');
  let dir: string | undefined;
  let child: ChildProcessWithoutNullStreams | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'sparkbench-esp32-'));
    if (res.destroyed) throw new Error('client disconnected before firmware startup');
    const flash = join(dir, 'flash.bin');
    const efuse = join(dir, 'efuse.bin');
    await writeFile(flash, image, { mode: 0o600 });
    await writeFile(efuse, Buffer.alloc(4096), { mode: 0o600 });
    child = spawn(helperPath(), [qemuPath(), romPath(), flash, efuse], { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  } catch (e) {
    startingSessions--;
    if (child) child.kill('SIGKILL');
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
  if (!dir || !child) {
    startingSessions--;
    if (child) child.kill('SIGKILL');
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new Error('could not initialize the ESP32 helper process');
  }
  const session: Session = { id, project, model, engine, child, dir, response: res, done: false, serialBytes: 0, stdoutBytes: 0, stderrBytes: 0, stderrBuffer: '', responseBytes: 0, serialBuffer: '', modes: new Map(), levels: new Map() };
  sessions.set(id, session);
  startingSessions--;
  child.stdin.on('error', () => {});
  const digest = createHash('sha256').update(image).digest('hex');
  res.statusCode = 200; res.setHeader('Content-Type', 'application/x-ndjson'); res.setHeader('Cache-Control', 'no-cache');
  emit(session, { type: 'session', id, artifact: { name, sha256: digest } });
  const onLine = (line: string) => {
    if (!line) return;
    let event: any;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'gpio' && Number.isInteger(event.gpio)) {
      session.levels.set(event.gpio, event.value ? 1 : 0);
      if (event.gpio === 2 && session.modes.get(2)) model.setPinMode(2, { kind: 'out', level: event.value ? 1 : 0 });
      updateFrame(session);
    } else if (event.type === 'direction' && Number.isInteger(event.gpio)) {
      session.modes.set(event.gpio, !!event.value);
      model.setPinMode(event.gpio, event.value ? { kind: 'out', level: session.levels.get(event.gpio) ?? 0 } : { kind: 'unused' });
      updateFrame(session);
    } else if (event.type === 'serial' && Number.isInteger(event.value)) {
      session.serialBytes++;
      if (session.serialBytes > MAX_SERIAL) { emit(session, { type: 'error', message: 'native serial output limit exceeded' }); void stopSession(session); return; }
      session.serialBuffer += String.fromCharCode(event.value);
      const lines = session.serialBuffer.split(/\r?\n/); session.serialBuffer = lines.pop() ?? '';
      for (const value of lines) if (value) session.engine.serial(value);
    } else if (event.type === 'error') emit(session, { type: 'error', message: String(event.message ?? 'native helper error') });
    if (event.type === 'error') void stopSession(session);
  };
  child.stdout.setEncoding('utf8');
  let pending = '';
  child.stdout.on('data', (chunk: string) => {
    session.stdoutBytes += Buffer.byteLength(chunk);
    if (session.stdoutBytes > 16 * 1024 * 1024) { emit(session, { type: 'error', message: 'native helper output limit exceeded' }); void stopSession(session); return; }
    pending += chunk; const lines = pending.split(/\r?\n/); pending = lines.pop() ?? ''; for (const line of lines) onLine(line);
  });
  res.on('drain', () => child.stdout.resume());
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (s) => {
    session.stderrBytes += Buffer.byteLength(s);
    if (session.stderrBytes > 128 * 1024) {
      emit(session, { type: 'error', message: 'native helper diagnostic output limit exceeded' });
      void stopSession(session);
      return;
    }
    session.stderrBuffer = `${session.stderrBuffer}${s}`.slice(-4096);
  });
  child.stdout.on('error', (e) => { emit(session, { type: 'error', message: e.message }); void stopSession(session); });
  child.stderr.on('error', (e) => { emit(session, { type: 'error', message: e.message }); void stopSession(session); });
  child.on('error', (e) => { emit(session, { type: 'error', message: e.message }); void stopSession(session); });
  child.on('close', () => {
    if (!session.done && !session.stopping) {
      const diagnostic = session.stderrBuffer.trim();
      emit(session, { type: 'error', message: diagnostic || 'native helper exited' });
      void stopSession(session);
    }
  });
  session.timer = setInterval(() => updateFrame(session), 10);
  session.timeout = setTimeout(() => { emit(session, { type: 'error', message: 'native session timed out' }); void stopSession(session); }, 120000);
  res.on('close', () => { if (!res.writableEnded) void stopSession(session); });
  return id;
}

export async function closeEsp32Runtime() {
  await Promise.all([...sessions.values()].map(stopSession));
}

export async function esp32Middleware(req: Connect.IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
  if (!req.url?.startsWith('/api/esp32/')) return next();
  if (!localRequest(req)) return json(res, 403, { error: 'ESP32 runtime accepts local same-origin requests only' });
  try {
    if (req.url === '/api/esp32/status' && req.method === 'GET') return json(res, 200, runtimeStatus());
    if (req.url === '/api/esp32/demo' && req.method === 'GET') {
      const project = buildEsp32FirmwareExample();
      if (!runtimeStatus().demoAvailable) return json(res, 503, { error: 'native ESP32 demo firmware is not built' });
      return json(res, 200, { project });
    }
    const payload = await requestBody(req);
    if (req.url === '/api/esp32/run' && req.method === 'POST') {
      const project = payload.project as Project;
      const image = payload.demo ? await readFile(demoPath()) : Buffer.from(String(payload.firmware?.base64 ?? ''), 'base64');
      const name = payload.demo ? 'esp32-gpio-blink-4mb.bin' : String(payload.firmware?.name ?? 'firmware.bin').slice(0, 120);
      await startSession(project, image, name, res, payload.inputs);
      return;
    }
    if (req.url === '/api/esp32/input' && req.method === 'POST') {
      const s = sessions.get(String(payload.id)); if (!s) return json(res, 404, { error: 'session not found' });
      const target = s.project.parts.find((p) => p.id === payload.part);
      const keys = target?.type === 'pushbutton' ? ['pressed'] : target?.type === 'slide-switch' ? ['position'] : [];
      if (!target || typeof payload.key !== 'string' || !keys.includes(payload.key) || !Number.isFinite(Number(payload.value))) return json(res, 400, { error: 'invalid input' });
      s.model.setPartState(payload.part, payload.key, Number(payload.value)); updateFrame(s); return json(res, 200, { ok: true });
    }
    if (req.url === '/api/esp32/stop' && req.method === 'POST') {
      const s = sessions.get(String(payload.id)); if (s) await stopSession(s);
      return json(res, 200, { ok: true });
    }
    return next();
  } catch (e: any) {
    return json(res, 400, { error: e?.message ?? String(e) });
  }
}
