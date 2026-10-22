// Main-thread side of the simulator: starts the worker, feeds inputs, collects frames.
import type { Project } from '../core/types';
import { partDef } from '../core/parts';
import { useStore } from './store';
import type { SimFrame } from '../sim/engine';
import { audio } from './audio';
import { FirmwareClient } from './firmwareClient';

let worker: Worker | null = null;
let firmwareClient: FirmwareClient | null = null;
let control: Int32Array | null = null;
let inputs: Float64Array | null = null;
let keys: string[] = [];

export const simSupported = () => typeof SharedArrayBuffer !== 'undefined' && (globalThis as any).crossOriginIsolated !== false;

export function simRunning() {
  return !!worker || !!firmwareClient;
}

export function startSim(project: Project, speed = 1) {
  stopSim(true);
  const st = useStore.getState();
  keys = [];
  const initial: number[] = [];
  for (const part of project.parts) {
    for (const c of partDef(part.type).controls ?? []) {
      const k = `${part.id}.${c.key}`;
      keys.push(k);
      initial.push(st.sim.inputs[k] ?? c.default);
    }
  }
  const inputMap: Record<string, number> = {};
  keys.forEach((k, i) => (inputMap[k] = initial[i]));
  st.setSim(() => ({ status: 'booting', t: 0, parts: {}, pins: {}, serial: [], warnings: [], nets: {}, scope: [], inputs: inputMap, i2c: [] }));
  if (st.runtime === 'esp32-qemu') {
    st.set({ firmwareArtifact: null });
    const fail = (message: string) => useStore.getState().setSim((s) => ({ ...s, status: 'error', error: { message, raw: message } }));
    if (project.board !== 'esp32' || !st.firmware) {
      fail(project.board !== 'esp32' ? 'Firmware emulation currently supports classic ESP32 only.' : 'Load a merged ESP32 flash image or open the firmware demo first.');
      return;
    }
    const client = new FirmwareClient({
      frame: (frame) => { if (firmwareClient === client) applyFrame(frame); },
      artifact: (artifact) => { if (firmwareClient === client) useStore.getState().set({ firmwareArtifact: artifact }); },
      error: (message) => { if (firmwareClient === client) fail(message); },
      done: () => {
        if (firmwareClient !== client) return;
        firmwareClient = null;
        useStore.getState().setSim((s) => ({ ...s, status: s.status === 'error' ? 'error' : 'stopped' }));
      },
    });
    firmwareClient = client;
    void client.start(project, st.firmware, inputMap);
    return;
  }
  const cbuf = new SharedArrayBuffer(16);
  const ibuf = new SharedArrayBuffer(Math.max(8, keys.length * 8));
  control = new Int32Array(cbuf);
  inputs = new Float64Array(ibuf);
  inputs.set(initial);
  control[2] = Math.round(speed * 100);
  const w = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
  worker = w;
  w.onmessage = (ev) => {
    if (w !== worker) return;
    const msg = ev.data;
    if (msg.type === 'frame') applyFrame(msg.frame as SimFrame);
    else if (msg.type === 'fatal') useStore.getState().setSim((s) => ({ ...s, status: 'error', error: { message: msg.message, raw: msg.message } }));
    else if (msg.type === 'done') {
      if (w === worker) {
        worker = null;
        w.terminate();
      }
      audio.stop();
    }
  };
  w.onerror = (e) => {
    if (w !== worker) return;
    useStore.getState().setSim((s) => ({ ...s, status: 'error', error: { message: `Simulator failed to start: ${e.message}`, raw: String(e.message) } }));
  };
  w.postMessage({ type: 'start', project: JSON.parse(JSON.stringify(project)), control: cbuf, inputs: ibuf, keys });
}

function applyFrame(f: SimFrame) {
  useStore.getState().setSim((s) => {
    const serial = f.serial.length ? [...s.serial, ...f.serial].slice(-600) : s.serial;
    const warnings = f.warnings.length ? [...s.warnings, ...f.warnings] : s.warnings;
    const scope = f.scope?.length ? [...s.scope, ...f.scope].slice(-1500) : s.scope;
    const i2c = f.i2c?.length ? [...s.i2c, ...f.i2c].slice(-40) : s.i2c;
    return { ...s, status: f.status, t: f.t, parts: f.parts, pins: f.pins, serial, warnings, error: f.error ?? s.error, nets: f.nets ?? s.nets, scope, i2c };
  });
  // Buzzer audio follows the loudest active tone.
  const tone = Object.values(f.parts).find((p) => p.tone && p.tone > 0)?.tone ?? 0;
  audio.setTone(tone);
}

export function setInput(part: string, key: string, value: number) {
  useStore.getState().setSim((s) => ({ ...s, inputs: { ...s.inputs, [`${part}.${key}`]: value } }));
  if (firmwareClient) { firmwareClient.input(part, key, value); return; }
  if (!inputs || !control) return;
  const i = keys.indexOf(`${part}.${key}`);
  if (i < 0) return;
  inputs[i] = value;
  Atomics.add(control, 1, 1);
}

export function setSpeed(speed: number) {
  if (control) {
    Atomics.store(control, 2, Math.round(speed * 100));
    Atomics.add(control, 1, 1);
  }
}

export function stopSim(silent = false) {
  audio.stop();
  if (firmwareClient) {
    const client = firmwareClient;
    firmwareClient = null;
    client.stop();
    if (!silent) useStore.getState().setSim((s) => ({ ...s, status: s.status === 'error' ? 'error' : 'stopped' }));
  }
  if (!worker || !control) {
    worker = null;
    return;
  }
  Atomics.store(control, 0, 1);
  Atomics.notify(control, 0);
  const w = worker;
  worker = null;
  control = null;
  inputs = null;
  setTimeout(() => w.terminate(), 1500);
  if (!silent) useStore.getState().setSim((s) => ({ ...s, status: s.status === 'error' ? 'error' : 'stopped' }));
}

useStore.subscribe((state, previous) => {
  if (firmwareClient && (state.project !== previous.project || state.runtime !== previous.runtime)) stopSim();
});
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => stopSim(true));
