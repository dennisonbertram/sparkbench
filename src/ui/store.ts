// Application state: the open project (with undo/redo + autosave), selection, chat, simulation.
import { create } from 'zustand';
import type { Project, PinRef, Wire, PartInstance } from '../core/types';
import { annotate, pinKey } from '../core/netlist';
import { defaultProps, partDef } from '../core/parts';
import { registerProjectParts } from '../core/customParts';
import type { PartVisual, SimFrame, SimWarning } from '../sim/engine';

export type Tab = 'breadboard' | 'schematic' | 'code' | 'bom' | 'guide' | 'pcb' | 'blog';

export interface ChatMsg {
  id: string;
  role: 'user' | 'ai';
  text: string;
  /** Small thumbnails of images the user attached. */
  images?: string[];
  /** Multiple-choice questions before designing (clarify). */
  questions?: { question: string; options: string[] }[];
  /** Requirements card shown with a design. */
  requirements?: import('../core/types').Requirements;
  details?: string[];
  actions?: { label: string; run: string }[];
  pending?: boolean;
}

export interface SimView {
  status: 'idle' | 'booting' | 'running' | 'stopped' | 'error' | 'finished';
  t: number;
  parts: Record<string, PartVisual>;
  pins: SimFrame['pins'];
  serial: string[];
  warnings: SimWarning[];
  error?: SimFrame['error'];
  nets: Record<string, number>;
  scope: { t: number; v: Record<string, number> }[];
  inputs: Record<string, number>; // "part.key" → value
  i2c: string[];
}

const emptySim = (): SimView => ({ status: 'idle', t: 0, parts: {}, pins: {}, serial: [], warnings: [], nets: {}, scope: [], inputs: {}, i2c: [] });

export type Selection = { kind: 'part'; id: string } | { kind: 'wire'; id: string } | null;

interface State {
  project: Project | null;
  past: Project[];
  future: Project[];
  selection: Selection;
  tab: Tab;
  chat: ChatMsg[];
  sim: SimView;
  wiringFrom: PinRef | null;
  hoverNet: string | null;
  activeFile: string;
  bottomTab: 'serial' | 'problems' | 'pins' | 'tests';
  /** Latest acceptance-test run for the open project (see TestsPanel). */
  /** The "Your board" panel (real hardware over USB) is open. */
  boardPanel: boolean;
  testRun: { key: string; running: boolean; results: import('../core/acceptance').TestResult[]; error?: string } | null;
  showWelcome: boolean;
  /** Set while the AI is working, with a short status line. */
  busy: string | null;
  /** Net highlighted from the schematic (sticky, unlike hover). */
  pinnedNet: string | null;
  tourStep: number | null;
  aiStatus: { enabled: boolean; model?: string; via?: string; kicad?: boolean; ngspice?: boolean; pcb?: { kicad: boolean; freerouting: boolean } };

  setProject(p: Project | null, opts?: { record?: boolean; keepSim?: boolean }): void;
  update(fn: (p: Project) => Project, record?: boolean): void;
  undo(): void;
  redo(): void;
  select(s: Selection): void;
  setTab(t: Tab): void;
  addChat(m: Omit<ChatMsg, 'id'>): string;
  patchChat(id: string, m: Partial<ChatMsg>): void;
  setSim(fn: (s: SimView) => SimView): void;
  resetSim(): void;
  addPart(type: string, at?: { x: number; y: number }): string;
  removeSelection(): void;
  addWire(a: PinRef, b: PinRef): void;
  movePart(id: string, x: number, y: number, record?: boolean): void;
  setPartProp(id: string, key: string, value: any): void;
  setFile(name: string, src: string): void;
  set(partial: Partial<State>): void;
}

const WIRE_COLORS = ['#2e7d32', '#8e24aa', '#00838f', '#c2185b', '#6d4c41', '#5c6bc0', '#7cb342'];

export const useStore = create<State>((set, get) => ({
  project: null,
  past: [],
  future: [],
  selection: null,
  tab: 'breadboard',
  chat: [],
  sim: emptySim(),
  wiringFrom: null,
  hoverNet: null,
  activeFile: 'main.py',
  bottomTab: 'serial',
  testRun: null,
  boardPanel: false,
  showWelcome: true,
  busy: null,
  pinnedNet: null,
  tourStep: null,
  aiStatus: { enabled: false },

  setProject(p, opts = {}) {
    registerProjectParts(p);
    const cur = get().project;
    if (!p || p.id !== cur?.id) set({ pinnedNet: null, hoverNet: null });
    // Each project keeps its own copilot conversation.
    if (p && p.id !== cur?.id) {
      const saved = loadChat(p.id);
      const pendingNew = !cur && get().chat.length > 0;
      set({ chat: pendingNew ? get().chat : saved });
    }
    const record = opts.record ?? true;
    set({
      project: p,
      past: record && cur ? [...get().past.slice(-50), cur] : get().past,
      future: record ? [] : get().future,
      selection: null,
      wiringFrom: null,
      activeFile: p && p.files['main.py'] !== undefined ? 'main.py' : Object.keys(p?.files ?? {})[0] ?? 'main.py',
      showWelcome: !p,
      sim: opts.keepSim ? get().sim : emptySim(),
    });
    if (p) saveProject(p);
  },
  update(fn, record = true) {
    const cur = get().project;
    if (!cur) return;
    const next = { ...fn(cur), updatedAt: Date.now() };
    set({ project: next, past: record ? [...get().past.slice(-50), cur] : get().past, future: record ? [] : get().future });
    saveProject(next);
  },
  undo() {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], selection: null });
    saveProject(prev);
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    const next = future[0];
    set({ project: next, past: [...past, project], future: future.slice(1), selection: null });
    saveProject(next);
  },
  select(s) {
    set({ selection: s });
  },
  setTab(t) {
    set({ tab: t });
  },
  addChat(m) {
    const id = Math.random().toString(36).slice(2);
    set({ chat: [...get().chat, { ...m, id }] });
    saveChat(get().project?.id, get().chat);
    return id;
  },
  patchChat(id, m) {
    set({ chat: get().chat.map((c) => (c.id === id ? { ...c, ...m } : c)) });
    saveChat(get().project?.id, get().chat);
  },
  setSim(fn) {
    set({ sim: fn(get().sim) });
  },
  resetSim() {
    set({ sim: emptySim() });
  },
  addPart(type, at) {
    const def = partDef(type);
    const p = get().project;
    if (!p) return '';
    const base = type.replace(/[^a-z0-9]/g, '');
    let n = 1;
    while (p.parts.some((x) => x.id === `${base}${n}`)) n++;
    const id = `${base}${n}`;
    const part: PartInstance = { id, type, label: def.name, props: defaultProps(type), x: at?.x ?? 80, y: at?.y ?? 80 };
    get().update((pr) => annotate({ ...pr, parts: [...pr.parts, part] }));
    set({ selection: { kind: 'part', id } });
    return id;
  },
  removeSelection() {
    const s = get().selection;
    if (!s) return;
    if (s.kind === 'wire') get().update((p) => ({ ...p, wires: p.wires.filter((w) => w.id !== s.id) }));
    else {
      const part = get().project?.parts.find((x) => x.id === s.id);
      if (part && partDef(part.type).category === 'board') return;
      get().update((p) => annotate({ ...p, parts: p.parts.filter((x) => x.id !== s.id), wires: p.wires.filter((w) => w.a.part !== s.id && w.b.part !== s.id) }));
    }
    set({ selection: null });
  },
  addWire(a, b) {
    if (pinKey(a) === pinKey(b)) return;
    const p = get().project;
    if (!p) return;
    if (p.wires.some((w) => (pinKey(w.a) === pinKey(a) && pinKey(w.b) === pinKey(b)) || (pinKey(w.a) === pinKey(b) && pinKey(w.b) === pinKey(a)))) return;
    let n = p.wires.length + 1;
    while (p.wires.some((w) => w.id === `w${n}`)) n++;
    const isGnd = /GND|^-$/.test(a.pin) || /GND|^-$/.test(b.pin);
    const isPwr = /3V3|VCC|VIN|5V|VBUS|V\+/.test(a.pin) || /3V3|VCC|VIN|5V|VBUS|V\+/.test(b.pin);
    const wire: Wire = { id: `w${n}`, a, b, color: isGnd ? '#1f2328' : isPwr ? '#d32f2f' : WIRE_COLORS[n % WIRE_COLORS.length] };
    get().update((pr) => ({ ...pr, wires: [...pr.wires, wire] }));
  },
  movePart(id, x, y, record = false) {
    get().update((p) => ({ ...p, parts: p.parts.map((q) => (q.id === id ? { ...q, x: Math.round(x), y: Math.round(y) } : q)) }), record);
  },
  setPartProp(id, key, value) {
    get().update((p) => ({ ...p, parts: p.parts.map((q) => (q.id === id ? { ...q, props: { ...q.props, [key]: value } } : q)) }));
  },
  setFile(name, src) {
    // A hand edit makes any stored behaviour description stale.
    get().update((p) => ({ ...p, files: { ...p.files, [name]: src }, codeCustom: name === 'main.py' ? true : p.codeCustom, behavior: name === 'main.py' ? undefined : p.behavior }), false);
  },
  set(partial) {
    set(partial as any);
  },
}));

// ------------------------------------------------------------------ persistence (browser only)
const KEY = 'sparkbench.projects.v1';
const CUR = 'sparkbench.current.v1';

export function listSaved(): Project[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Project>;
    return Object.values(all).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}
export function saveProject(p: Project) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Project>;
    all[p.id] = p;
    localStorage.setItem(KEY, JSON.stringify(all));
    localStorage.setItem(CUR, p.id);
  } catch {}
}
function saveChat(id: string | undefined, chat: ChatMsg[]) {
  if (!id) return;
  try {
    localStorage.setItem(`sparkbench.chat.${id}`, JSON.stringify(chat.filter((m) => !m.pending).slice(-60)));
  } catch {}
}
function loadChat(id: string): ChatMsg[] {
  try {
    return JSON.parse(localStorage.getItem(`sparkbench.chat.${id}`) ?? '[]');
  } catch {
    return [];
  }
}

export function deleteSaved(id: string) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Project>;
    delete all[id];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
export function loadCurrent(): Project | null {
  try {
    const id = localStorage.getItem(CUR);
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Project>;
    return id && all[id] ? all[id] : null;
  } catch {
    return null;
  }
}

// Development only: lets end-to-end tests (e.g. the fake USB board) read the open project.
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__sparkbench = useStore;
