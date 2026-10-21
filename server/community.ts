// Gallery, classroom and live sharing, stored in the database and scoped to the workspace.
// Gallery entries are visible inside their workspace (or to everyone when published as public);
// classes are joined by code from any workspace, but only the class's workspace sees the dashboard;
// live rooms are open to members of the room's workspace.
// Local mode has one workspace and no accounts, so it keeps the old secret edit/teacher keys.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Project } from '../src/core/types';
import { db, dataDir } from './db';
import { ensureWorkspace } from './tenancy/repo';
import type { RequestContext } from './tenancy/context';

const id = (n = 8) => randomBytes(n).toString('base64url').slice(0, n);
const clean = (s: unknown, max = 200) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

async function q<T = any>(ctx: RequestContext, sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureWorkspace(ctx);
  return (await db()).query<T>(sql, params);
}

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
  visibility?: 'workspace' | 'public';
}
interface GalleryRow {
  id: string;
  workspace_id: string;
  author_id: string;
  visibility: 'workspace' | 'public';
  entry: GalleryEntry & { editKey?: string };
  project: Project;
  likes: string;
}

const GALLERY_SELECT = `SELECT g.*, (SELECT count(*) FROM gallery_likes l WHERE l.entry_id = g.id) AS likes FROM gallery_entries g`;
const visible = (ctx: RequestContext, r: { workspace_id: string; visibility: string }) => r.workspace_id === ctx.workspaceId || r.visibility === 'public';
const toEntry = (r: GalleryRow): GalleryEntry => {
  const { editKey: _k, ...e } = r.entry;
  return { ...e, likes: Number(r.likes), visibility: r.visibility };
};

async function galleryRow(ctx: RequestContext, gid: string): Promise<GalleryRow | null> {
  if (!/^[\w-]{4,20}$/.test(gid)) return null;
  const [r] = await q<GalleryRow>(ctx, `${GALLERY_SELECT} WHERE g.id = $1`, [gid]);
  return r && visible(ctx, r) ? r : null;
}

/** May this person change or remove the entry? The author always may; locally (no accounts) the edit key is the proof. */
const canEdit = (ctx: RequestContext, r: GalleryRow, editKey?: string) => r.workspace_id === ctx.workspaceId && r.author_id === ctx.userId && (ctx.kind !== 'local' || r.entry.editKey === editKey);

/** Publish (or update your own) gallery entry. */
export async function publish(
  ctx: RequestContext,
  project: Project,
  author: string,
  blurb: string,
  opts: { name?: string; update?: { id: string; editKey?: string }; visibility?: 'workspace' | 'public' } = {},
): Promise<(GalleryEntry & { editKey: string }) | null> {
  const prev = opts.update ? await galleryRow(ctx, opts.update.id) : null;
  if (opts.update && (!prev || !canEdit(ctx, prev, opts.update.editKey))) return null;
  const gid = prev ? prev.id : id();
  const editKey = prev?.entry.editKey ?? id(12);
  const remixOf = (project as any).remixOf;
  const visibility = opts.visibility === 'public' ? 'public' : (prev?.visibility ?? 'workspace');
  const entry: GalleryEntry & { editKey: string } = {
    id: gid,
    name: clean(opts.name || project.name, 80),
    author: clean(author, 40) || 'Anonymous',
    blurb: clean(blurb, 300),
    board: project.board,
    parts: project.parts.length,
    createdAt: prev ? prev.entry.createdAt : Date.now(),
    likes: 0,
    remixes: prev ? prev.entry.remixes : 0,
    ...(remixOf ? { remixOf } : {}),
    editKey,
  };
  await q(
    ctx,
    `INSERT INTO gallery_entries (id, workspace_id, author_id, visibility, entry, project) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET visibility = EXCLUDED.visibility, entry = EXCLUDED.entry, project = EXCLUDED.project`,
    [gid, ctx.workspaceId, ctx.userId, visibility, JSON.stringify(entry), JSON.stringify(project)],
  );
  if (!prev && remixOf?.id) {
    const orig = await galleryRow(ctx, remixOf.id);
    if (orig) await q(ctx, `UPDATE gallery_entries SET entry = jsonb_set(entry, '{remixes}', to_jsonb(coalesce((entry->>'remixes')::int, 0) + 1)) WHERE id = $1`, [orig.id]);
  }
  const saved = (await galleryRow(ctx, gid))!;
  return { ...toEntry(saved), editKey };
}

/** Take your own entry down. */
export async function unpublish(ctx: RequestContext, gid: string, editKey?: string): Promise<boolean> {
  const r = await galleryRow(ctx, gid);
  if (!r || !canEdit(ctx, r, editKey)) return false;
  await q(ctx, 'DELETE FROM gallery_entries WHERE id = $1 AND workspace_id = $2', [gid, ctx.workspaceId]);
  return true;
}

export async function listGallery(ctx: RequestContext): Promise<GalleryEntry[]> {
  const rows = await q<GalleryRow>(ctx, `${GALLERY_SELECT} WHERE g.workspace_id = $1 OR g.visibility = 'public'`, [ctx.workspaceId]);
  const all = rows.map(toEntry).sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
  // The same project published twice (same title, author and description) shows once.
  const seen = new Set<string>();
  return all.filter((e) => {
    const k = JSON.stringify([e.name, e.author, e.blurb, e.board, e.remixOf?.id ?? '']);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function getGallery(ctx: RequestContext, gid: string): Promise<{ entry: GalleryEntry; project: Project } | null> {
  const r = await galleryRow(ctx, gid);
  return r ? { entry: toEntry(r), project: r.project } : null;
}

/** One like per person (locally, with no accounts, every click counts). */
export async function like(ctx: RequestContext, gid: string): Promise<GalleryEntry | null> {
  const r = await galleryRow(ctx, gid);
  if (!r) return null;
  const who = ctx.kind === 'local' ? `local:${id(10)}` : ctx.userId;
  await q(ctx, 'INSERT INTO gallery_likes (entry_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [gid, who]);
  return toEntry((await galleryRow(ctx, gid))!);
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
  /** Local mode only: the secret the teacher needs to see the dashboard. */
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

interface ClassRow {
  code: string;
  workspace_id: string;
  teacher_id: string;
  assignment: Assignment;
}

export async function createAssignment(ctx: RequestContext, a: Pick<Assignment, 'title' | 'brief' | 'requirements' | 'teacher' | 'tests'>): Promise<Assignment> {
  const code = id(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const full: Assignment = { ...a, title: clean(a.title, 100), brief: clean(a.brief, 1000), teacher: clean(a.teacher, 40), requirements: a.requirements.map((r) => clean(r, 200)).filter(Boolean).slice(0, 10), code, teacherKey: id(12), createdAt: Date.now() };
  await q(ctx, 'INSERT INTO classes (code, workspace_id, teacher_id, assignment) VALUES ($1, $2, $3, $4)', [code, ctx.workspaceId, ctx.userId, JSON.stringify(full)]);
  return full;
}

async function classRow(ctx: RequestContext, code: string): Promise<ClassRow | null> {
  if (!/^[A-Z0-9]{4,10}$/.test(code)) return null;
  const [r] = await q<ClassRow>(ctx, 'SELECT * FROM classes WHERE code = $1', [code]);
  return r ?? null;
}

/** The teacher who made the class, or an admin of its workspace; locally, whoever has the teacher key. */
const isTeacher = (ctx: RequestContext, c: ClassRow, key: string) =>
  ctx.kind === 'local' ? c.assignment.teacherKey === key : c.workspace_id === ctx.workspaceId && (c.teacher_id === ctx.userId || ctx.role === 'admin');

/** Anyone with the code may see the assignment (students can be in any workspace). */
export async function getAssignment(ctx: RequestContext, code: string): Promise<Omit<Assignment, 'teacherKey'> | null> {
  const c = await classRow(ctx, code);
  if (!c) return null;
  const { teacherKey: _k, ...pub } = c.assignment;
  return pub;
}

export async function addSubmission(ctx: RequestContext, code: string, s: Omit<Submission, 'id' | 'submittedAt'>): Promise<Submission | null> {
  const c = await classRow(ctx, code);
  if (!c) return null;
  const sub: Submission = { ...s, student: clean(s.student, 40) || 'Student', id: id(), submittedAt: Date.now() };
  // One submission per student: locally students are told apart by name, when hosted by account.
  if (ctx.kind === 'local') await q(ctx, 'DELETE FROM class_submissions WHERE class_code = $1 AND student_name = $2', [code, sub.student]);
  else await q(ctx, 'DELETE FROM class_submissions WHERE class_code = $1 AND student_id = $2', [code, ctx.userId]);
  await q(ctx, 'INSERT INTO class_submissions (id, class_code, student_id, student_name, project, grade) VALUES ($1, $2, $3, $4, $5, $6)', [sub.id, code, ctx.userId, sub.student, JSON.stringify(sub.project), JSON.stringify(sub.grade)]);
  return sub;
}

interface SubRow {
  id: string;
  student_name: string;
  project: Project;
  grade: Submission['grade'];
  submitted_at: Date | string;
}

export async function dashboard(ctx: RequestContext, code: string, key: string): Promise<{ assignment: Assignment; submissions: Omit<Submission, 'project'>[] } | null> {
  const c = await classRow(ctx, code);
  if (!c || !isTeacher(ctx, c, key)) return null;
  const subs = await q<SubRow>(ctx, 'SELECT id, student_name, grade, submitted_at FROM class_submissions WHERE class_code = $1 ORDER BY submitted_at', [code]);
  return { assignment: c.assignment, submissions: subs.map((s) => ({ id: s.id, student: s.student_name, grade: s.grade, submittedAt: new Date(s.submitted_at).getTime() })) };
}

export async function submissionProject(ctx: RequestContext, code: string, key: string, sid: string): Promise<Project | null> {
  const c = await classRow(ctx, code);
  if (!c || !isTeacher(ctx, c, key)) return null;
  const [s] = await q<SubRow>(ctx, 'SELECT project FROM class_submissions WHERE class_code = $1 AND id = $2', [code, sid]);
  return s?.project ?? null;
}

// ------------------------------------------------------------------ live sharing (rooms)
type Comment = { id: string; target: string; text: string; by: string; at: number };
interface Live {
  clients: Set<ServerResponse>;
  people: Map<ServerResponse, string>;
}
/** Open connections per room (this process only: the service runs as one instance). */
const live = new Map<string, Live>();
const liveOf = (rid: string) => live.get(rid) ?? live.set(rid, { clients: new Set(), people: new Map() }).get(rid)!;

interface RoomRow {
  id: string;
  workspace_id: string;
  project: Project;
  version: number;
  comments: Comment[];
}

async function roomRow(ctx: RequestContext, rid: string): Promise<RoomRow | null> {
  if (!/^[\w-]{6,20}$/.test(rid)) return null;
  const [r] = await q<RoomRow>(ctx, 'SELECT * FROM rooms WHERE id = $1 AND workspace_id = $2', [rid, ctx.workspaceId]);
  return r ?? null;
}

function broadcast(rid: string, event: string, data: unknown, except?: ServerResponse) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of liveOf(rid).clients) if (c !== except) c.write(msg);
}

export async function createRoom(ctx: RequestContext, project: Project): Promise<string> {
  const rid = id(10);
  await q(ctx, 'INSERT INTO rooms (id, workspace_id, project, version) VALUES ($1, $2, $3, 1)', [rid, ctx.workspaceId, JSON.stringify(project)]);
  return rid;
}

export async function joinRoom(ctx: RequestContext, rid: string, name: string, res: ServerResponse): Promise<boolean> {
  const r = await roomRow(ctx, rid);
  if (!r) return false;
  const l = liveOf(rid);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  l.clients.add(res);
  l.people.set(res, clean(name, 40) || 'Someone');
  res.write(`event: state\ndata: ${JSON.stringify({ project: r.project, version: r.version, comments: r.comments })}\n\n`);
  broadcast(rid, 'people', [...l.people.values()]);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  res.on('close', () => {
    clearInterval(ping);
    l.clients.delete(res);
    l.people.delete(res);
    broadcast(rid, 'people', [...l.people.values()]);
  });
  return true;
}

/** Last writer wins, but only from the latest version (stale edits are rejected so nobody silently loses work). */
export async function updateRoom(ctx: RequestContext, rid: string, project: Project, baseVersion: number, by: string): Promise<{ ok: boolean; version: number; project?: Project }> {
  const r = await roomRow(ctx, rid);
  if (!r) return { ok: false, version: 0 };
  const [u] = await q<{ version: number }>(ctx, 'UPDATE rooms SET project = $1, version = version + 1, updated_at = now() WHERE id = $2 AND workspace_id = $3 AND version = $4 RETURNING version', [JSON.stringify(project), rid, ctx.workspaceId, baseVersion]);
  if (!u) {
    const now = (await roomRow(ctx, rid))!;
    return { ok: false, version: now.version, project: now.project };
  }
  broadcast(rid, 'update', { project, version: u.version, by: clean(by, 40) });
  return { ok: true, version: u.version };
}

export async function commentRoom(ctx: RequestContext, rid: string, target: string, text: string, by: string): Promise<Comment | null> {
  const r = await roomRow(ctx, rid);
  if (!r) return null;
  const c: Comment = { id: id(), target: clean(target, 60), text: clean(text, 500), by: clean(by, 40) || 'Someone', at: Date.now() };
  await q(ctx, `UPDATE rooms SET comments = comments || $1::jsonb WHERE id = $2 AND workspace_id = $3`, [JSON.stringify([c]), rid, ctx.workspaceId]);
  broadcast(rid, 'comment', c);
  return c;
}

// ------------------------------------------------------------------ one-time import of the old JSON files
/** Local mode: bring gallery entries, classes and rooms from the old data/ JSON files into the database once. */
export async function importLegacyFiles(ctx: RequestContext): Promise<number> {
  const root = process.env.SPARKBENCH_DATA ?? dataDir();
  const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
  const files = (k: string) => (existsSync(join(root, k)) ? readdirSync(join(root, k)).filter((f) => f.endsWith('.json')).map((f) => join(root, k, f)) : []);
  let n = 0;
  const [done] = await q(ctx, "SELECT 1 FROM schema_migrations WHERE name = 'legacy-files'");
  if (done) return 0;
  for (const f of files('gallery')) {
    const g = read(f);
    await q(ctx, 'INSERT INTO gallery_entries (id, workspace_id, author_id, entry, project) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [g.entry.id, ctx.workspaceId, ctx.userId, JSON.stringify({ ...g.entry, editKey: g.editKey }), JSON.stringify(g.project)]);
    for (let i = 0; i < (g.entry.likes ?? 0); i++) await q(ctx, 'INSERT INTO gallery_likes (entry_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [g.entry.id, `legacy:${i}`]);
    n++;
  }
  for (const f of files('classes')) {
    const c = read(f);
    await q(ctx, 'INSERT INTO classes (code, workspace_id, teacher_id, assignment) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [c.assignment.code, ctx.workspaceId, ctx.userId, JSON.stringify(c.assignment)]);
    for (const s of c.submissions ?? []) await q(ctx, 'INSERT INTO class_submissions (id, class_code, student_id, student_name, project, grade) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING', [s.id, c.assignment.code, ctx.userId, s.student, JSON.stringify(s.project), JSON.stringify(s.grade)]);
    n++;
  }
  for (const f of files('rooms')) {
    const r = read(f);
    const rid = f.split('/').pop()!.replace(/\.json$/, '');
    await q(ctx, 'INSERT INTO rooms (id, workspace_id, project, version, comments) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [rid, ctx.workspaceId, JSON.stringify(r.project), r.version ?? 1, JSON.stringify(r.comments ?? [])]);
    n++;
  }
  await q(ctx, "INSERT INTO schema_migrations (name) VALUES ('legacy-files') ON CONFLICT DO NOTHING");
  return n;
}
