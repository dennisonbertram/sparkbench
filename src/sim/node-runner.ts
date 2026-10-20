// Run a project's firmware headlessly in fast virtual time (used by tests and the CLI).
import type { Project } from '../core/types';
import { SimEngine, type InputChange, type SimFrame } from './engine';

export interface ScriptedInput extends InputChange {
  atMs: number;
}

export async function loadMicroPythonNode(opts: { stdout: (s: string) => void; stderr: (s: string) => void }) {
  const mod: any = await import('@micropython/micropython-webassembly-pyscript/micropython.mjs');
  return mod.loadMicroPython({ ...opts, heapsize: 4 * 1024 * 1024, linebuffer: true });
}

export async function simulate(project: Project, opts: { untilMs: number; inputs?: ScriptedInput[]; onFrameAt?: number[] } ) {
  const pending = [...(opts.inputs ?? [])].sort((a, b) => a.atMs - b.atMs);
  const snapshots: { atMs: number; frame: SimFrame }[] = [];
  const snapAt = [...(opts.onFrameAt ?? [])].sort((a, b) => a - b);
  let engine!: SimEngine;
  const host = {
    waitUs: () => {},
    wallNowMs: () => Date.now(),
    shouldStop: () => false,
    emit: () => {},
    pollInputs: () => {
      const t = engine.timeUs / 1000;
      while (snapAt.length && snapAt[0] <= t) snapshots.push({ atMs: snapAt.shift()!, frame: engine.frame() });
      const out: InputChange[] = [];
      while (pending.length && pending[0].atMs <= t) out.push(pending.shift()!);
      return out.length ? out : null;
    },
  };
  engine = new SimEngine(project, host, { mode: 'fast', untilMs: opts.untilMs });
  await engine.run(loadMicroPythonNode);
  const final = engine.frame();
  return { engine, final, snapshots };
}
