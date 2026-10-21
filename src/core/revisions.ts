// Hardware revisions: release the current design as Rev A, B, C… with a note, and see exactly what
// changed since the previous release (parts added/removed/changed, wiring, program).
import type { Project, Revision } from './types';
import { partDef } from './parts';
import { buildNets } from './netlist';

const nextLetter = (r?: string) => (!r ? 'A' : String.fromCharCode(r.charCodeAt(0) + 1));

/** Human-readable differences between two design snapshots. */
export function diffDesigns(prev: Revision['snapshot'], cur: Revision['snapshot']): string[] {
  const out: string[] = [];
  if (prev.board !== cur.board) out.push(`Board changed: ${prev.board} → ${cur.board}.`);
  const key = (p: { id: string }) => p.id;
  const pm = new Map(prev.parts.map((p) => [key(p), p]));
  const cm = new Map(cur.parts.map((p) => [key(p), p]));
  const name = (p: { type: string; ref?: string; label?: string }) => `${p.ref ?? ''} ${p.label ?? partDef(p.type).name}`.trim();
  for (const [id, p] of cm) if (!pm.has(id)) out.push(`Added ${name(p)}.`);
  for (const [id, p] of pm) if (!cm.has(id)) out.push(`Removed ${name(p)}.`);
  for (const [id, p] of cm) {
    const q = pm.get(id);
    if (q && JSON.stringify(q.props ?? {}) !== JSON.stringify(p.props ?? {})) {
      const changed = Object.keys({ ...q.props, ...p.props }).filter((k) => JSON.stringify(q.props?.[k]) !== JSON.stringify(p.props?.[k]));
      out.push(`Changed ${name(p)}: ${changed.map((k) => `${k} ${q.props?.[k] ?? '—'} → ${p.props?.[k] ?? '—'}`).join(', ')}.`);
    }
  }
  // Wiring: compare nets as sets of part:pin.
  const nets = (s: Revision['snapshot']) => {
    const { nets } = buildNets({ id: 'x', name: '', summary: '', board: s.board, parts: s.parts, wires: s.wires, files: {}, notes: [], createdAt: 0, updatedAt: 0, version: 1 });
    return new Set(nets.filter((n) => n.pins.length > 1).map((n) => n.pins.map((r) => `${r.part}:${r.pin}`).sort().join(' ')));
  };
  const a = nets(prev);
  const b = nets(cur);
  const rewired = [...b].filter((x) => !a.has(x)).length;
  if (rewired) out.push(`Wiring changed: ${rewired} connection group${rewired > 1 ? 's' : ''} differ${rewired > 1 ? '' : 's'}.`);
  for (const f of new Set([...Object.keys(prev.files), ...Object.keys(cur.files)])) {
    if (!(f in prev.files)) out.push(`New file ${f}.`);
    else if (!(f in cur.files)) out.push(`Removed file ${f}.`);
    else if (prev.files[f] !== cur.files[f]) {
      const pl = prev.files[f].split('\n');
      const cl = cur.files[f].split('\n');
      const changed = cl.filter((l, i) => l !== pl[i]).length + Math.max(0, pl.length - cl.length);
      out.push(`Program ${f}: about ${changed} line${changed === 1 ? '' : 's'} changed.`);
    }
  }
  return out.length ? out : ['No changes.'];
}

export const snapshotOf = (p: Project): Revision['snapshot'] => ({ parts: p.parts, wires: p.wires, files: p.files, board: p.board });

/** Today's date in the user's time zone (YYYY-MM-DD). */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What boards and documents print: "Rev B" once released, "Draft" before the first release. */
export const revLabel = (p: Pick<Project, 'revision'>) => (p.revision ? `Rev ${p.revision}` : 'Draft');

/** Release the current design as the next revision. */
export function releaseRevision(p: Project, note: string, date = localDate()): Project {
  const prev = p.revisions?.[p.revisions.length - 1];
  const rev = nextLetter(prev?.rev);
  const changes = prev ? diffDesigns(prev.snapshot, snapshotOf(p)) : ['First release.'];
  return { ...p, revision: rev, revisions: [...(p.revisions ?? []), { rev, date, note, changes, snapshot: snapshotOf(p) }] };
}

/** Changes since the last released revision (for "unreleased changes"). */
export function unreleasedChanges(p: Project): string[] {
  const prev = p.revisions?.[p.revisions.length - 1];
  return prev ? diffDesigns(prev.snapshot, snapshotOf(p)).filter((x) => x !== 'No changes.') : [];
}
