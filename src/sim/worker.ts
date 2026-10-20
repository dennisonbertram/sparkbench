// Web Worker that runs one simulation. Inputs arrive through a SharedArrayBuffer so the
// (blocking) MicroPython program can see button presses while it is running.
import { SimEngine, type InputChange } from './engine';
import type { Project } from '../core/types';
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs';
import wasmUrl from '@micropython/micropython-webassembly-pyscript/micropython.wasm?url';

export interface StartMsg {
  type: 'start';
  project: Project;
  control: SharedArrayBuffer; // Int32[0]=stop, [1]=input generation, [2]=speed×100
  inputs: SharedArrayBuffer; // Float64 per key
  keys: string[]; // "partId.key"
}

self.onmessage = async (ev: MessageEvent<StartMsg>) => {
  const msg = ev.data;
  if (msg.type !== 'start') return;
  const control = new Int32Array(msg.control);
  const inputs = new Float64Array(msg.inputs);
  const last = Float64Array.from(inputs);
  let gen = -1;
  const host = {
    waitUs: (us: number) => {
      Atomics.wait(control, 0, 0, us / 1000);
    },
    wallNowMs: () => performance.now(),
    shouldStop: () => Atomics.load(control, 0) !== 0,
    emit: (frame: unknown) => (self as any).postMessage({ type: 'frame', frame }),
    pollInputs: (): InputChange[] | null => {
      const g = Atomics.load(control, 1);
      if (g === gen) return null;
      gen = g;
      const out: InputChange[] = [];
      for (let i = 0; i < msg.keys.length; i++) {
        if (inputs[i] !== last[i] || g === 0) {
          last[i] = inputs[i];
          const [part, key] = msg.keys[i].split('.');
          out.push({ part, key, value: inputs[i] });
        }
      }
      engine.speed = Atomics.load(control, 2) / 100 || 1;
      return out;
    },
  };
  const engine = new SimEngine(msg.project, host, { mode: 'realtime', speed: Atomics.load(control, 2) / 100 || 1, frameMs: 33 });
  try {
    await engine.run((opts) => loadMicroPython({ ...opts, url: wasmUrl, heapsize: 4 * 1024 * 1024, linebuffer: true }));
  } catch (e) {
    (self as any).postMessage({ type: 'fatal', message: String((e as any)?.message ?? e) });
  }
  (self as any).postMessage({ type: 'done', status: engine.status });
};
