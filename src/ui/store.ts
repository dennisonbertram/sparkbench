// Application state: the open project (with undo/redo + autosave), selection, chat, simulation.
import { create } from 'zustand';
import type { Project, PinRef, Wire, PartInstance } from '../core/types';
import { annotate, pinKey } from '../core/netlist';
import { defaultProps, partDef } from '../core/parts';
import { registerProjectParts } from '../core/customParts';
import { mergeProjects } from '../core/merge';
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
  /** Community: open dialog, the class being worked on, teacher dashboard, live-shared room. */
  dialog: null | 'publish' | 'teach';
  classCode: string | null;
  teach: { code: string; key: string } | null;
  /** A teacher looking at a student's submission: the dashboard to go back to. */
  teachReturn: { code: string; key: string; student: string } | null;
  room: { id: string; version: number; people?: string[]; comments?: { id: string; target: string; text: string; by: string; at: number }[]; lastBy?: string; offline?: boolean; conflict?: string; unread?: number } | null;
  testRun: { key: string; running: boolean; results: import('../core/acceptance').TestResult[]; error?: string } | null;
  showWelcome: boolean;
  /** Set while the AI is working, with a short status line. */
  busy: string | null;
  /** While Claude designs: what it is doing now (streamed from the server). */
  designPhase: 'read' | 'wire' | 'code' | 'tests' | 'fix' | null;
  /** Net highlighted from the schematic (sticky, unlike hover). */
  pinnedNet: string | null;
  tourStep: number | null;
  aiStatus: { enabled: boolean; model?: string; via?: string; kicad?: boolean; ngspice?: boolean; pcb?: { kicad: boolean; freerouting: boolean } };
  /** Signed-in, multi-workspace server (Clerk); false when running locally. */
  hosted: boolean;

  /** remote: a collaborator's change (live sharing): undo history is rebased onto it so undo only takes back my own changes. */
  setProject(p: Project | null, opts?: { record?: boolean; keepSim?: boolean; remote?: boolean }): void;
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
  dialog: null,
  classCode: null,
  teach: null,
  teachReturn: null,
  room: null,
  showWelcome: true,
  busy: null,
  designPhase: null,
  pinnedNet: null,
  tourStep: null,
  aiStatus: { enabled: false },
  hosted: false,

  setProject(p, opts = {}) {
    registerProjectParts(p);
    const cur = get().project;
    if (!p || p.id !== cur?.id) set({ pinnedNet: null, hoverNet: null });
    // Each project keeps its own copilot conversation.
    if (p && p.id !== cur?.id) {
      const saved = loadChat(p.id);
      const pendingNew = !cur && get().chat.length > 0;
      set({ chat: pendingNew ? get().chat : saved });
      if (!pendingNew && !saved.length) fetchChat(p.id);
    }
    const record = opts.record ?? true;
    if (opts.remote && p && cur && p.id === cur.id) {
      const rebase = (h: Project) => mergeProjects(cur, h, p, 'theirs').project;
      const sel = get().selection;
      const keep = sel && (sel.kind === 'part' ? p.parts.some((x) => x.id === sel.id) : p.wires.some((x) => x.id === sel.id));
      set({ project: p, past: get().past.map(rebase), future: get().future.map(rebase), selection: keep ? sel : null, sim: opts.keepSim ? get().sim : emptySim() });
      saveProject(p);
      return;
    }
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

// ------------------------------------------------------------------ persistence
// Projects and chats live in a browser cache (so the editor stays instant). Locally that cache is
// the only copy. When hosted, the cache is per workspace and every change is also written to the
// server, which is the source of truth (hydrateFromServer() fills the cache on start-up).
const BASE_KEY = 'sparkbench.projects.v1';
const BASE_CUR = 'sparkbench.current.v1';
let scope = '';
let remote = false;
const KEY = () => BASE_KEY + scope;
const CUR = () => BASE_CUR + scope;
const CHAT = (id: string) => `sparkbench.chat.${scope ? `${scope.slice(1)}.` : ''}${id}`;

/** Server writes waiting to be sent (debounced per project), flushed on page hide. */
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; send: () => Promise<unknown> }>();
function later(key: string, send: () => Promise<unknown>, ms = 800) {
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    send().catch(() => later(key, send, 5000)); // offline or a hiccup: try again
  }, ms);
  pending.set(key, { timer, send });
}
const api = (url: string, method: string, body?: unknown, keepalive = false) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), keepalive }).then((r) => {
    if (!r.ok && r.status !== 404) throw new Error(`${method} ${url}: ${r.status}`);
    return r;
  });
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    for (const [k, p] of pending) {
      clearTimeout(p.timer);
      pending.delete(k);
      p.send().catch(() => {});
    }
  });

const readAll = (): Record<string, Project> => {
  try {
    return JSON.parse(localStorage.getItem(KEY()) ?? '{}');
  } catch {
    return {};
  }
};
const writeAll = (all: Record<string, Project>) => {
  try {
    localStorage.setItem(KEY(), JSON.stringify(all));
  } catch {}
};

/** Hosted start-up: use this workspace's cache and fill it from the server. */
export async function hydrateFromServer(workspaceId: string): Promise<void> {
  scope = `.${workspaceId}`;
  remote = true;
  const r = await fetch('/api/projects');
  if (!r.ok) throw new Error(`Couldn't load your projects (${r.status}).`);
  const { projects } = (await r.json()) as { projects: Project[] };
  writeAll(Object.fromEntries(projects.map((p) => [p.id, p])));
}

/** Projects saved in this browser before signing in (the local, unscoped cache). */
export function browserOnlyProjects(): Project[] {
  try {
    return Object.values(JSON.parse(localStorage.getItem(BASE_KEY) ?? '{}') as Record<string, Project>);
  } catch {
    return [];
  }
}

/** Copy the browser-only projects into the current workspace (never overwriting). */
export async function importBrowserProjects(): Promise<number> {
  const projects = browserOnlyProjects();
  const r = await api('/api/projects/import', 'POST', { projects });
  const { imported } = await r.json();
  const all = readAll();
  for (const p of projects) all[p.id] ??= p;
  writeAll(all);
  return imported;
}

export function listSaved(): Project[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function saveProject(p: Project) {
  const all = readAll();
  all[p.id] = p;
  writeAll(all);
  try {
    localStorage.setItem(CUR(), p.id);
  } catch {}
  if (remote) later(`p:${p.id}`, () => api(`/api/projects/${encodeURIComponent(p.id)}`, 'PUT', { project: readAll()[p.id] ?? p }, true));
}
function saveChat(id: string | undefined, chat: ChatMsg[]) {
  if (!id) return;
  const keep = chat.filter((m) => !m.pending).slice(-60);
  try {
    localStorage.setItem(CHAT(id), JSON.stringify(keep));
  } catch {}
  if (remote) later(`c:${id}`, () => api(`/api/projects/${encodeURIComponent(id)}/chat`, 'PUT', { messages: keep }, true));
}
function loadChat(id: string): ChatMsg[] {
  try {
    return JSON.parse(localStorage.getItem(CHAT(id)) ?? '[]');
  } catch {
    return [];
  }
}
/** Hosted: a chat started on another device isn't in this browser's cache yet. */
function fetchChat(id: string) {
  if (!remote) return;
  fetch(`/api/projects/${encodeURIComponent(id)}/chat`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const msgs = (d?.messages ?? []) as ChatMsg[];
      const s = useStore.getState();
      if (!msgs.length || s.project?.id !== id || s.chat.length) return;
      try {
        localStorage.setItem(CHAT(id), JSON.stringify(msgs));
      } catch {}
      s.set({ chat: msgs } as any);
    })
    .catch(() => {});
}

export function deleteSaved(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
  if (remote) {
    pending.get(`p:${id}`) && clearTimeout(pending.get(`p:${id}`)!.timer);
    pending.delete(`p:${id}`);
    api(`/api/projects/${encodeURIComponent(id)}`, 'DELETE').catch(() => {});
  }
}
export function loadCurrent(): Project | null {
  try {
    const id = localStorage.getItem(CUR());
    const all = readAll();
    return id && all[id] ? all[id] : null;
  } catch {
    return null;
  }
}

// Development only: lets end-to-end tests (e.g. the fake USB board) read the open project.
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__sparkbench = useStore;
