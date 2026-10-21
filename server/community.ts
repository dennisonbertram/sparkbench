// Gallery, classroom and live sharing, stored on this Sparkbench server (a household, club or
// classroom on one network). Plain JSON files in data/, no accounts: people type a display name.
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Project } from '../src/core/types';

const DATA = process.env.SPARKBENCH_DATA ?? join(process.cwd(), 'data');
const dir = (k: string) => {
  const d = join(DATA, k);
  mkdirSync(d, { recursive: true });
  return d;
};
const id = (n = 8) => randomBytes(n).toString('base64url').slice(0, n);
const read = <T>(file: string): T | null => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null);
const clean = (s: unknown, max = 200) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// ------------------------------------------------------------------ gallery
export interface GalleryEntry {
  id: string;
  name: string;
  author: string;
  blurb: string;
  board: string;
  parts: number;
  createdAt: number;
  remixOf?: { id: string; name: string; author: string };
  likes: number;
  remixes: number;
}

/** Publish (or, with the entry's edit key, update) a gallery entry. The edit key stays with the author. */
export function publish(project: Project, author: string, blurb: string, opts: { name?: string; update?: { id: string; editKey: string } } = {}): (GalleryEntry & { editKey: string }) | null {
  const prev = opts.update && getGallery(opts.update.id);
  if (opts.update && (!prev || (prev as any).editKey !== opts.update.editKey)) return null;
  const gid = prev ? prev.entry.id : id();
  const editKey: string = prev ? (prev as any).editKey : id(12);
  const remixOf = (project as any).remixOf;
  const entry: GalleryEntry = {
    id: gid,
    name: clean(opts.name || project.name, 80),
    author: clean(author, 40) || 'Anonymous',
    blurb: clean(blurb, 300),
    board: project.board,
    parts: project.parts.length,
    createdAt: prev ? prev.entry.createdAt : Date.now(),
    likes: prev ? prev.entry.likes : 0,
    remixes: prev ? prev.entry.remixes : 0,
    ...(remixOf ? { remixOf } : {}),
  };
  writeFileSync(join(dir('gallery'), `${gid}.json`), JSON.stringify({ entry, project, editKey }));
  if (!prev && remixOf?.id) {
    const f = join(dir('gallery'), `${remixOf.id}.json`);
    const orig = read<{ entry: GalleryEntry; project: Project }>(f);
    if (orig) {
      orig.entry.remixes++;
      writeFileSync(f, JSON.stringify(orig));
    }
  }
  return { ...entry, editKey };
}

/** Take an entry down (the author's edit key is needed). */
export function unpublish(gid: string, editKey: string): boolean {
  const g = getGallery(gid);
  if (!g || (g as any).editKey !== editKey) return false;
  unlinkSync(join(dir('gallery'), `${gid}.json`));
  return true;
}

export function listGallery(): GalleryEntry[] {
  const all = readdirSync(dir('gallery'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => read<{ entry: GalleryEntry }>(join(dir('gallery'), f))!.entry)
    .sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
  // The same project published twice (same title, author and description) shows once.
  const seen = new Set<string>();
  return all.filter((e) => {
    const k = JSON.stringify([e.name, e.author, e.blurb, e.board, e.remixOf?.id ?? '']);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function getGallery(gid: string): { entry: GalleryEntry; project: Project; editKey?: string } | null {
  if (!/^[\w-]{4,20}$/.test(gid)) return null;
  return read(join(dir('gallery'), `${gid}.json`));
}

export function like(gid: string): GalleryEntry | null {
  const g = getGallery(gid);
  if (!g) return null;
  g.entry.likes++;
  writeFileSync(join(dir('gallery'), `${gid}.json`), JSON.stringify(g));
  return g.entry;
}

// ------------------------------------------------------------------ classroom
export interface Assignment {
  code: string;
  title: string;
  brief: string;
  /** Plain-English requirements; each becomes an acceptance test when grading. */
  requirements: string[];
  /** Acceptance tests generated from the requirements (by Claude), run against every submission. */
  tests?: import('../src/core/acceptance').AcceptanceTest[];
  teacher: string;
  /** Secret the teacher needs to see the dashboard. */
  teacherKey: string;
  createdAt: number;
}

export interface Submission {
  id: string;
  student: string;
  project: Project;
  submittedAt: number;
  grade: { score: number; max: number; items: { label: string; pass: boolean; detail: string }[] };
}

export function createAssignment(a: Pick<Assignment, 'title' | 'brief' | 'requirements' | 'teacher' | 'tests'>): Assignment {
  const code = id(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const full: Assignment = { ...a, title: clean(a.title, 100), brief: clean(a.brief, 1000), teacher: clean(a.teacher, 40), requirements: a.requirements.map((r) => clean(r, 200)).filter(Boolean).slice(0, 10), code, teacherKey: id(12), createdAt: Date.now() };
  writeFileSync(join(dir('classes'), `${code}.json`), JSON.stringify({ assignment: full, submissions: [] }));
  return full;
}

function classFile(code: string) {
  return /^[A-Z0-9]{4,10}$/.test(code) ? join(dir('classes'), `${code}.json`) : '';
}

export function getAssignment(code: string): Omit<Assignment, 'teacherKey'> | null {
  const f = classFile(code);
  const c = f && read<{ assignment: Assignment }>(f);
  if (!c) return null;
  const { teacherKey: _k, ...pub } = c.assignment;
  return pub;
}

export function addSubmission(code: string, s: Omit<Submission, 'id' | 'submittedAt'>): Submission | null {
  const f = classFile(code);
  const c = f && read<{ assignment: Assignment; submissions: Submission[] }>(f);
  if (!c) return null;
  const sub: Submission = { ...s, student: clean(s.student, 40) || 'Student', id: id(), submittedAt: Date.now() };
  c.submissions = [...c.submissions.filter((x) => x.student !== sub.student), sub];
  writeFileSync(f, JSON.stringify(c));
  return sub;
}

export function dashboard(code: string, key: string): { assignment: Assignment; submissions: Omit<Submission, 'project'>[] } | null {
  const f = classFile(code);
  const c = f && read<{ assignment: Assignment; submissions: Submission[] }>(f);
  if (!c || c.assignment.teacherKey !== key) return null;
  return { assignment: c.assignment, submissions: c.submissions.map(({ project: _p, ...rest }) => rest) };
}

export function submissionProject(code: string, key: string, sid: string): Project | null {
  const f = classFile(code);
  const c = f && read<{ assignment: Assignment; submissions: Submission[] }>(f);
  if (!c || c.assignment.teacherKey !== key) return null;
  return c.submissions.find((s) => s.id === sid)?.project ?? null;
}

// ------------------------------------------------------------------ live sharing (rooms)
interface Room {
  project: Project;
  version: number;
  comments: { id: string; target: string; text: string; by: string; at: number }[];
  clients: Set<ServerResponse>;
  people: Map<ServerResponse, string>;
}
const rooms = new Map<string, Room>();

function roomFile(rid: string) {
  return /^[\w-]{6,20}$/.test(rid) ? join(dir('rooms'), `${rid}.json`) : '';
}

function loadRoom(rid: string): Room | null {
  if (rooms.has(rid)) return rooms.get(rid)!;
  const f = roomFile(rid);
  const saved = f && read<{ project: Project; version: number; comments: Room['comments'] }>(f);
  if (!saved) return null;
  const r: Room = { ...saved, clients: new Set(), people: new Map() };
  rooms.set(rid, r);
  return r;
}

function save(rid: string, r: Room) {
  writeFileSync(roomFile(rid), JSON.stringify({ project: r.project, version: r.version, comments: r.comments }));
}

function broadcast(r: Room, event: string, data: unknown, except?: ServerResponse) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of r.clients) if (c !== except) c.write(msg);
}

export function createRoom(project: Project): string {
  const rid = id(10);
  const r: Room = { project, version: 1, comments: [], clients: new Set(), people: new Map() };
  rooms.set(rid, r);
  save(rid, r);
  return rid;
}

export function joinRoom(rid: string, name: string, res: ServerResponse): boolean {
  const r = loadRoom(rid);
  if (!r) return false;
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  r.clients.add(res);
  r.people.set(res, clean(name, 40) || 'Someone');
  res.write(`event: state\ndata: ${JSON.stringify({ project: r.project, version: r.version, comments: r.comments })}\n\n`);
  broadcast(r, 'people', [...r.people.values()]);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  res.on('close', () => {
    clearInterval(ping);
    r.clients.delete(res);
    r.people.delete(res);
    broadcast(r, 'people', [...r.people.values()]);
  });
  return true;
}

/** Last writer wins, but only from the latest version (stale edits are rejected so nobody silently loses work). */
export function updateRoom(rid: string, project: Project, baseVersion: number, by: string): { ok: boolean; version: number; project?: Project } {
  const r = loadRoom(rid);
  if (!r) return { ok: false, version: 0 };
  if (baseVersion !== r.version) return { ok: false, version: r.version, project: r.project };
  r.project = project;
  r.version++;
  save(rid, r);
  broadcast(r, 'update', { project, version: r.version, by: clean(by, 40) });
  return { ok: true, version: r.version };
}

export function commentRoom(rid: string, target: string, text: string, by: string) {
  const r = loadRoom(rid);
  if (!r) return null;
  const c = { id: id(), target: clean(target, 60), text: clean(text, 500), by: clean(by, 40) || 'Someone', at: Date.now() };
  r.comments.push(c);
  save(rid, r);
  broadcast(r, 'comment', c);
  return c;
}
