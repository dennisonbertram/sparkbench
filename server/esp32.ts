import type { Connect } from 'vite';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
import { applyEsp32Inputs, Esp32CircuitBridge, parseEsp32Control, wiredEsp32Gpios } from './esp32Circuit';
import { Esp32SerialDecoder } from './esp32Serial';

const FLASH_SIZE = 4 * 1024 * 1024;
const MAX_BODY = 8 * 1024 * 1024;
const MAX_SERIAL = 256 * 1024;
const MAX_RESPONSE = 32 * 1024 * 1024;
const MAX_ERRORS = 16;
const CACHE = process.env.SPARKBENCH_CACHE ?? join(homedir(), '.cache', 'sparkbench');
const helperPath = () => process.env.SPARKBENCH_ESP32_HELPER ?? join(CACHE, 'esp32', 'sparkbench-esp32-helper');
const qemuPath = () => process.env.SPARKBENCH_ESP32_QEMU ?? join(CACHE, 'qemu', 'build', 'libqemu-xtensa.so');
const romPath = () => process.env.SPARKBENCH_ESP32_ROM ?? join(CACHE, 'qemu', 'pc-bios');
const demoPath = () => process.env.SPARKBENCH_ESP32_FIRMWARE ?? join(CACHE, 'esp32', 'firmware', 'esp32-gpio-blink-4mb.bin');

// The same helper can run from the local build above or from the sparkbench-esp32 Docker image
// (docker/esp32-runtime.Dockerfile), which is how it runs on a Mac or a cloud worker.
// SPARKBENCH_ESP32_RUNNER=native|docker picks one; by default the local build wins when present.
const IMAGE = () => process.env.SPARKBENCH_ESP32_IMAGE ?? 'sparkbench-esp32';
const IN_IMAGE = { qemu: '/opt/sparkbench/qemu/libqemu-xtensa.so', rom: '/opt/sparkbench/qemu/pc-bios', demo: '/opt/sparkbench/firmware/esp32-gpio-blink-4mb.bin' };
const nativeBuilt = () => existsSync(helperPath()) && existsSync(qemuPath()) && existsSync(join(romPath(), 'esp32-v3-rom.bin')) && existsSync(join(romPath(), 'esp32-v3-rom-app.bin'));
let imageCheck = { at: 0, ok: false };
function dockerImageReady() {
  if (Date.now() - imageCheck.at > 10000) {
    const r = spawnSync('docker', ['image', 'inspect', '--format', '{{.Id}}', IMAGE()], { stdio: 'ignore', timeout: 5000 });
    imageCheck = { at: Date.now(), ok: r.status === 0 };
  }
  return imageCheck.ok;
}
function runner(): 'native' | 'docker' | null {
  const want = process.env.SPARKBENCH_ESP32_RUNNER;
  if (want === 'native') return nativeBuilt() ? 'native' : null;
  if (want === 'docker') return dockerImageReady() ? 'docker' : null;
  return nativeBuilt() ? 'native' : dockerImageReady() ? 'docker' : null;
}
let imageDemo: Buffer | null = null;
async function demoImage(): Promise<Buffer> {
  if (runner() !== 'docker') return readFile(demoPath());
  if (!imageDemo) {
    const r = spawnSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'cat', IMAGE(), IN_IMAGE.demo], { maxBuffer: FLASH_SIZE + 1024, timeout: 30000 });
    if (r.status !== 0) throw new Error('could not read the demo firmware from the ESP32 runtime image');
    imageDemo = r.stdout;
  }
  return imageDemo;
}

/** One container per session: no network, capped CPU/memory/processes, only the session folder mounted. */
function launchHelper(dir: string, mask: number, values: number): { child: ChildProcessWithoutNullStreams; container?: string } {
  if (runner() === 'native') {
    return { child: spawn(helperPath(), [qemuPath(), romPath(), join(dir, 'flash.bin'), join(dir, 'efuse.bin'), String(mask), String(values)], { stdio: ['pipe', 'pipe', 'pipe'], shell: false }) };
  }
  const container = `sparkbench-esp32-${randomBytes(6).toString('hex')}`;
  const user = typeof process.getuid === 'function' ? ['--user', `${process.getuid()}:${process.getgid!()}`] : [];
  const args = ['run', '--rm', '-i', '--name', container, '--network', 'none', '--cpus', '1', '--memory', '1g', '--pids-limit', '64',
    '--read-only', '--tmpfs', '/tmp:size=16m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', ...user,
    '-v', `${dir}:/session`, IMAGE(), IN_IMAGE.qemu, IN_IMAGE.rom, '/session/flash.bin', '/session/efuse.bin', String(mask), String(values)];
  return { child: spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false }), container };
}
/** Killing `docker run` does not stop its container, so remove it explicitly. */
function removeContainer(name?: string) {
  if (name) spawn('docker', ['rm', '-f', name], { stdio: 'ignore' }).on('error', () => {});
}

type Session = {
  id: string;
  project: Project;
  model: import('../src/core/circuit').ElectricalModel;
  engine: SimEngine;
  bridge: Esp32CircuitBridge;
  child: ChildProcessWithoutNullStreams;
  container?: string;
  dir: string;
  response: ServerResponse;
  done: boolean;
  serialBytes: number;
  stdoutBytes: number;
  stderrBytes: number;
  stderrBuffer: string;
  responseBytes: number;
  serialDecoder: Esp32SerialDecoder;
  virtualTimeUs: number;
  framePending: boolean;
  backpressured: boolean;
  pendingErrors: string[];
  lastFrameAt: number;
  timer?: NodeJS.Timeout;
  timeout?: NodeJS.Timeout;
  stopping?: Promise<void>;
};
const sessions = new Map<string, Session>();
let startingSessions = 0;

function json(res: ServerResponse, status: number, value: unknown) {
  if (res.writableEnded || res.destroyed) return;
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
  const hostHeader = req.headers.host;
  const hostMatch = hostHeader?.match(/^(?:localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/i);
  if (!hostHeader || !hostMatch || (hostMatch[1] !== undefined && Number(hostMatch[1]) > 65535)) return false;
  let host: URL;
  try {
    host = new URL(`http://${hostHeader}`);
  } catch {
    return false;
  }
  if (host.username || host.password || host.pathname !== '/' || host.search || host.hash ||
    !['localhost', '127.0.0.1', '[::1]'].includes(host.hostname.toLowerCase())) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const protocol = (req.socket as import('node:tls').TLSSocket).encrypted ? 'https:' : 'http:';
    return url.protocol === protocol && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash &&
      url.origin.toLowerCase() === `${protocol}//${host.host.toLowerCase()}`;
  } catch {
    return false;
  }
}

function validateImageAt(image: Buffer, offset: number, end: number, name: string): number {
  if (offset + 24 > end || image[offset] !== 0xe9) throw new Error(`${name} image header is missing (expected 0xE9)`);
  const segmentCount = image[offset + 1];
  if (segmentCount < 1 || segmentCount > 16) throw new Error(`${name} image has an invalid segment count`);
  if (image.readUInt16LE(offset + 12) !== 0) throw new Error(`${name} image is not for classic ESP32 (chip id 0x0000)`);
  let cursor = offset + 24;
  for (let segment = 0; segment < segmentCount; segment++) {
    if (cursor + 8 > end) throw new Error(`${name} image has a truncated segment header`);
    const length = image.readUInt32LE(cursor + 4);
    if (!length || length > end - cursor - 8) throw new Error(`${name} image has an invalid segment length`);
    cursor += 8 + length;
  }
  return cursor;
}

function validatePartitionTable(image: Buffer): number {
  const start = 0x8000;
  const end = start + 0x1000;
  let cursor = start;
  let entries = 0;
  let factoryAppSize = 0;
  while (cursor + 32 <= end) {
    const magic = image.readUInt16LE(cursor);
    if (magic === 0xffff) break;
    if (magic === 0xebeb) break;
    if (magic !== 0x50aa) throw new Error('ESP32 partition table is missing valid 0xAA50 entries at 0x8000');
    const type = image[cursor + 2];
    const offset = image.readUInt32LE(cursor + 4);
    const size = image.readUInt32LE(cursor + 8);
    if (!size || offset >= FLASH_SIZE || size > FLASH_SIZE - offset) throw new Error('ESP32 partition table contains an out-of-range partition');
    if (type === 0 && offset === 0x10000) factoryAppSize = size;
    entries++;
    cursor += 32;
  }
  if (!entries || !factoryAppSize) throw new Error('ESP32 partition table must include an app partition at 0x10000');
  return factoryAppSize;
}

export function validateEsp32Firmware(image: Buffer): void {
  if (image.length !== FLASH_SIZE) throw new Error('ESP32 firmware must be an exactly 4 MiB merged flash image');
  validateImageAt(image, 0x1000, 0x8000, 'bootloader');
  const applicationSize = validatePartitionTable(image);
  const applicationEnd = validateImageAt(image, 0x10000, FLASH_SIZE, 'application');
  if (applicationEnd - 0x10000 > applicationSize) throw new Error('application image exceeds its partition-table entry');
}

export function validateEsp32Project(project: Project): void {
  if (!project || project.board !== 'esp32' || !Array.isArray(project.parts) || !Array.isArray(project.wires) ||
    project.parts.length > 100 || project.wires.length > 500) {
    throw new Error('native ESP32 mode requires an esp32 project with parts and wires');
  }
  if (project.parts.some((part) => !part || typeof part.type !== 'string') ||
    project.wires.some((wire) => !wire || !wire.a || !wire.b ||
      typeof wire.a.part !== 'string' || typeof wire.a.pin !== 'string' ||
      typeof wire.b.part !== 'string' || typeof wire.b.pin !== 'string')) {
    throw new Error('native ESP32 mode requires valid part and wire references');
  }
  const allowed = new Set(['esp32-devkit', 'resistor', 'led', 'pushbutton', 'slide-switch']);
  if (project.parts.filter((p) => !allowed.has(p.type)).length) {
    throw new Error('native ESP32 mode supports only the ESP32 DevKit, resistors, LEDs, pushbuttons, and slide switches');
  }
  const boards = project.parts.filter((p) => p.type === 'esp32-devkit');
  if (boards.length !== 1) throw new Error('native ESP32 mode requires exactly one ESP32 DevKit V1 board');
  const ids = new Set<string>();
  for (const part of project.parts) {
    if (!part || typeof part.id !== 'string' || !part.id.trim() || ids.has(part.id)) {
      throw new Error('native ESP32 mode requires unique, non-empty part IDs');
    }
    ids.add(part.id);
    if (part.type === 'resistor') {
      const value = part.props?.ohms;
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 1e9)) {
        throw new Error(`resistor ${part.id} must have a resistance between 0.1 Ω and 1 GΩ`);
      }
    }
  }
  const wireIds = new Set<string>();
  for (const wire of project.wires) {
    if (!wire || typeof wire.id !== 'string' || !wire.id.trim() || wireIds.has(wire.id)) {
      throw new Error('native ESP32 mode requires unique, non-empty wire IDs');
    }
    wireIds.add(wire.id);
    for (const ref of [wire.a, wire.b]) {
      const part = project.parts.find((p) => p.id === ref.part);
      const pinsForPart = part?.type === BOARDS.esp32.partType ? BOARDS.esp32.pins : part ? partDef(part.type).pins : [];
      if (!part || !pinsForPart.some((p) => p.name === ref.pin)) throw new Error(`wire ${wire.id} references an unknown pin`);
    }
  }
  wiredEsp32Gpios(project);
}

function runtimeStatus() {
  const how = runner();
  const available = how !== null;
  const demoAvailable = how === 'docker' || (available && existsSync(demoPath()));
  return { available, demoAvailable, ...(how ? { runner: how } : { reason: 'Build the emulator image (docker build -f docker/esp32-runtime.Dockerfile -t sparkbench-esp32 .) or the native helper; see docs/esp32-runtime.md.' }), capabilities: ['gpio', 'serial'] };
}

function writeEvent(session: Session, event: unknown, final = false) {
  if ((session.done && !final) || session.response.writableEnded || session.response.destroyed) return false;
  const line = `${JSON.stringify(event)}\n`;
  const bytes = Buffer.byteLength(line);
  if (!final && session.responseBytes + bytes > MAX_RESPONSE - 1024) {
    void stopSession(session, 'native response size limit exceeded');
    return false;
  }
  session.responseBytes += bytes;
  if (!session.response.write(line)) {
    session.backpressured = true;
    return false;
  }
  return true;
}

function emit(session: Session, event: unknown, final = false) {
  if (session.done || (session.stopping && !final) || session.response.destroyed || session.response.writableEnded) return;
  if (session.backpressured && !final) {
    if ((event as { type?: string })?.type === 'frame') {
      session.framePending = true;
    } else if ((event as { type?: string })?.type === 'error') {
      const message = String((event as { message?: unknown }).message ?? 'native helper error');
      if (session.pendingErrors.length >= MAX_ERRORS) {
        session.pendingErrors = ['native output exceeded the bounded slow-client queue'];
        void stopSession(session, undefined, true);
      } else {
        session.pendingErrors.push(message);
      }
    }
    return;
  }
  writeEvent(session, event, final);
}

function finishSerial(session: Session) {
  const fragments = session.serialDecoder.end();
  for (const fragment of fragments) session.engine.serial(fragment);
  if (fragments.length) session.framePending = true;
}

function publishFrame(session: Session, final = false) {
  if (session.backpressured && !final) {
    session.framePending = true;
    return;
  }
  session.engine.timeUs = session.virtualTimeUs;
  session.engine.status = 'running';
  emit(session, { type: 'frame', frame: session.engine.frame() }, final);
}

function flushPending(session: Session) {
  if (session.backpressured || session.done || session.stopping || session.response.destroyed) return;
  while (session.pendingErrors.length && !session.backpressured) {
    const message = session.pendingErrors.shift()!;
    writeEvent(session, { type: 'error', message });
  }
  if (session.framePending && !session.backpressured && Date.now() - session.lastFrameAt >= 33) {
    session.framePending = false;
    session.lastFrameAt = Date.now();
    publishFrame(session);
  }
}

function stopSession(session: Session, reason?: string, alreadyQueued = false): Promise<void> {
  if (session.done) return Promise.resolve();
  if (session.stopping) return session.stopping;
  if (reason && !alreadyQueued) session.pendingErrors.push(reason);
  session.stopping = Promise.resolve();
  if (session.timer) clearInterval(session.timer);
  if (session.timeout) clearTimeout(session.timeout);
  session.stopping = (async () => {
    try {
      try { session.child.stdin.write('{"type":"stop"}\n'); } catch {}
      const killTimer = setTimeout(() => {
        if (session.child.exitCode === null && session.child.signalCode === null) session.child.kill('SIGKILL');
      }, 1000);
      if (session.child.exitCode === null && session.child.signalCode === null) {
        await new Promise<void>((resolve) => session.child.once('close', () => { clearTimeout(killTimer); resolve(); }));
      } else clearTimeout(killTimer);
      if (!session.response.destroyed && !session.response.writableEnded) {
        session.engine.timeUs = session.virtualTimeUs;
        session.engine.status = 'running';
        if (session.framePending) {
          session.framePending = false;
          writeEvent(session, { type: 'frame', frame: session.engine.frame() }, true);
        }
        for (const message of session.pendingErrors) writeEvent(session, { type: 'error', message }, true);
      }
    } catch (error) {
      if (!session.response.destroyed && !session.response.writableEnded) {
        writeEvent(session, { type: 'error', message: error instanceof Error ? error.message : String(error) }, true);
      }
    } finally {
      session.done = true;
      sessions.delete(session.id);
      removeContainer(session.container);
      await rm(session.dir, { recursive: true, force: true }).catch(() => {});
      if (!session.response.writableEnded && !session.response.destroyed) {
        writeEvent(session, { type: 'done' }, true);
        session.response.end();
      }
    }
  })();
  return session.stopping;
}

function updateFrame(session: Session) {
  if (session.done || session.stopping) return;
  const { mask, values } = session.bridge.syncInputs();
  try { session.child.stdin.write(`{"type":"sync","mask":${mask},"values":${values}}\n`); } catch {}
  session.framePending = true;
  flushPending(session);
}

async function startSession(project: Project, image: Buffer, name: string, res: ServerResponse, inputs: Record<string, number> = {}) {
  validateEsp32Project(project);
  validateEsp32Firmware(image);
  if (!runtimeStatus().available) throw new Error('native ESP32 runtime is not built');
  if (sessions.size + startingSessions >= 2) throw new Error('native ESP32 runtime is busy');
  const host = { waitUs() {}, wallNowMs: () => Date.now(), pollInputs: () => null, shouldStop: () => false, emit() {} };
  const engine = new SimEngine(project, host, { mode: 'realtime', frameMs: 0 });
  const model = engine.model;
  applyEsp32Inputs(project, model, inputs);
  const bridge = new Esp32CircuitBridge(project, model);
  const initial = bridge.syncInputs();
  startingSessions++;
  const id = randomBytes(18).toString('base64url');
  let dir: string | undefined;
  let child: ChildProcessWithoutNullStreams | undefined;
  let container: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), 'sparkbench-esp32-'));
    if (res.destroyed) throw new Error('client disconnected before firmware startup');
    const flash = join(dir, 'flash.bin');
    const efuse = join(dir, 'efuse.bin');
    await writeFile(flash, image, { mode: 0o600 });
    await writeFile(efuse, Buffer.alloc(4096), { mode: 0o600 });
    if (res.destroyed) throw new Error('client disconnected before firmware startup');
    ({ child, container } = launchHelper(dir, initial.mask, initial.values));
  } catch (e) {
    startingSessions--;
    if (child) child.kill('SIGKILL');
    removeContainer(container);
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
  if (!dir || !child) {
    startingSessions--;
    if (child) child.kill('SIGKILL');
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw new Error('could not initialize the ESP32 helper process');
  }
  const session: Session = {
    id, project, model, engine, bridge, child, container, dir, response: res, done: false, serialBytes: 0, stdoutBytes: 0,
    stderrBytes: 0, stderrBuffer: '', responseBytes: 0, serialDecoder: new Esp32SerialDecoder(), virtualTimeUs: 0, framePending: false,
    backpressured: false, pendingErrors: [], lastFrameAt: 0,
  };
  sessions.set(id, session);
  startingSessions--;
  res.on('close', () => { if (!res.writableEnded) void stopSession(session); });
  if (res.destroyed) {
    await stopSession(session);
    return id;
  }
  child.stdin.on('error', () => {});
  const digest = createHash('sha256').update(image).digest('hex');
  res.statusCode = 200; res.setHeader('Content-Type', 'application/x-ndjson'); res.setHeader('Cache-Control', 'no-cache');
  emit(session, { type: 'session', id, artifact: { name, sha256: digest } });
  const onLine = (line: string) => {
    if (!line) return;
    let event: any;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'gpio' && Number.isInteger(event.gpio)) {
      bridge.setOutput(event.gpio, event.value ? 1 : 0);
      session.framePending = true;
      flushPending(session);
    } else if (event.type === 'direction' && Number.isInteger(event.gpio)) {
      bridge.setDirection(event.gpio, !!event.value);
      session.framePending = true;
      flushPending(session);
    } else if (event.type === 'serial' && Number.isInteger(event.value)) {
      session.serialBytes++;
      if (session.serialBytes > MAX_SERIAL) { void stopSession(session, 'native serial output limit exceeded'); return; }
      for (const line of session.serialDecoder.writeByte(event.value)) session.engine.serial(line);
      session.framePending = true;
      flushPending(session);
    } else if (event.type === 'tick' && Number.isSafeInteger(event.timeUs) && event.timeUs >= 0) {
      session.virtualTimeUs = Math.max(session.virtualTimeUs, event.timeUs);
      session.framePending = true;
      flushPending(session);
    } else if (event.type === 'error') {
      emit(session, { type: 'error', message: String(event.message ?? 'native helper error') });
      void stopSession(session);
    }
  };
  child.stdout.setEncoding('utf8');
  let pending = '';
  const dispatchLine = (line: string) => {
    try { onLine(line); } catch (error) {
      void stopSession(session, error instanceof Error ? error.message : String(error));
    }
  };
  child.stdout.on('data', (chunk: string) => {
    session.stdoutBytes += Buffer.byteLength(chunk);
    if (session.stdoutBytes > 16 * 1024 * 1024) { void stopSession(session, 'native helper output limit exceeded'); return; }
    pending += chunk; const lines = pending.split(/\r?\n/); pending = lines.pop() ?? ''; for (const line of lines) dispatchLine(line);
  });
  res.on('drain', () => {
    try {
      session.backpressured = false;
      flushPending(session);
    } catch (error) {
      void stopSession(session, error instanceof Error ? error.message : String(error));
    }
  });
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (s) => {
    session.stderrBytes += Buffer.byteLength(s);
    if (session.stderrBytes > 128 * 1024) {
      void stopSession(session, 'native helper diagnostic output limit exceeded');
      return;
    }
    session.stderrBuffer = `${session.stderrBuffer}${s}`.slice(-4096);
  });
  child.stdout.on('error', (e) => { emit(session, { type: 'error', message: e.message }); void stopSession(session); });
  child.stderr.on('error', (e) => { emit(session, { type: 'error', message: e.message }); void stopSession(session); });
  child.on('error', (e) => { emit(session, { type: 'error', message: e.message }); void stopSession(session); });
  child.on('close', () => {
    if (pending) dispatchLine(pending);
    pending = '';
    finishSerial(session);
    if (!session.done && !session.stopping) {
      const diagnostic = session.stderrBuffer.trim();
      void stopSession(session, diagnostic || 'native helper exited');
    }
  });
  session.timer = setInterval(() => {
    try { updateFrame(session); } catch (error) { void stopSession(session, error instanceof Error ? error.message : String(error)); }
  }, 10);
  session.timeout = setTimeout(() => { emit(session, { type: 'error', message: 'native session timed out' }); void stopSession(session); }, 120000);
  return id;
}

export async function closeEsp32Runtime() {
  await Promise.all([...sessions.values()].map((session) => stopSession(session)));
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
    const mutation = req.method === 'POST' && ['/api/esp32/run', '/api/esp32/input', '/api/esp32/stop'].includes(req.url);
    if (mutation && !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
      return json(res, 415, { error: 'mutation endpoints require application/json' });
    }
    const payload = await requestBody(req);
    if (req.url === '/api/esp32/run' && req.method === 'POST') {
      const project = payload.project as Project;
      const image = payload.demo ? await demoImage() : Buffer.from(String(payload.firmware?.base64 ?? ''), 'base64');
      const name = payload.demo ? 'esp32-gpio-blink-4mb.bin' : String(payload.firmware?.name ?? 'firmware.bin').slice(0, 120);
      await startSession(project, image, name, res, payload.inputs);
      return;
    }
    if (req.url === '/api/esp32/input' && req.method === 'POST') {
      const s = sessions.get(String(payload.id)); if (!s) return json(res, 404, { error: 'session not found' });
      const control = parseEsp32Control(s.project, payload.part, payload.key, payload.value);
      try {
        s.model.setPartState(control.part, control.key, control.value);
        updateFrame(s);
      } catch (error) {
        void stopSession(s, error instanceof Error ? error.message : String(error));
        throw error;
      }
      return json(res, 200, { ok: true });
    }
    if (req.url === '/api/esp32/stop' && req.method === 'POST') {
      const s = sessions.get(String(payload.id)); if (s) await stopSession(s);
      return json(res, 200, { ok: true });
    }
    return next();
  } catch (e: any) {
    const message = e?.message ?? String(e);
    if (res.headersSent) {
      const session = [...sessions.values()].find((candidate) => candidate.response === res);
      if (session) await stopSession(session, message);
      else if (!res.destroyed && !res.writableEnded) {
        try { res.write(`${JSON.stringify({ type: 'error', message })}\n`); } finally { res.end(); }
      }
      return;
    }
    return json(res, 400, { error: message });
  }
}
