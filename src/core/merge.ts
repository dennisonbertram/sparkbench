// Three-way merge of two edits to the same design (live sharing): changes to different parts,
// wires, files or fields are combined; when both sides changed the same thing, one side wins and
// the clash is reported so nobody's change disappears silently.
import type { Project } from './types';

export interface MergeResult {
  project: Project;
  /** Things both sides changed differently, in words ("part R1", "the name"). */
  clashes: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Merge a list of items with ids: per-item 3-way merge, keeping `ours` order then new `theirs` items. */
function mergeList<T extends { id: string }>(base: T[], ours: T[], theirs: T[], prefer: 'ours' | 'theirs', label: (x: T) => string, clashes: string[]): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const o = new Map(ours.map((x) => [x.id, x]));
  const t = new Map(theirs.map((x) => [x.id, x]));
  const ids = [...new Set([...ours.map((x) => x.id), ...theirs.map((x) => x.id), ...base.map((x) => x.id)])];
  const out: T[] = [];
  for (const id of ids) {
    const v = pick(b.get(id), o.get(id), t.get(id), prefer, () => {
      const any = o.get(id) ?? t.get(id) ?? b.get(id)!;
      clashes.push(label(any));
    });
    if (v) out.push(v);
  }
  return out;
}

/** 3-way pick of one value (undefined = absent/deleted). */
function pick<T>(base: T | undefined, ours: T | undefined, theirs: T | undefined, prefer: 'ours' | 'theirs', clash: () => void): T | undefined {
  const oc = !same(base, ours);
  const tc = !same(base, theirs);
  if (oc && tc && !same(ours, theirs)) {
    clash();
    return prefer === 'ours' ? ours : theirs;
  }
  return oc ? ours : theirs;
}

const FIELDS: { key: keyof Project; label: string }[] = [
  { key: 'name', label: 'the project name' },
  { key: 'summary', label: 'the summary' },
  { key: 'board', label: 'the board' },
  { key: 'tests', label: 'the tests' },
  { key: 'requirements', label: 'the requirements' },
  { key: 'revision', label: 'the revision' },
  { key: 'revisions', label: 'the revision history' },
  { key: 'codeCustom', label: 'the code' },
  { key: 'customParts', label: 'the custom parts' },
  { key: 'behavior', label: 'the behaviour notes' },
  { key: 'features', label: 'the pin plan' },
  { key: 'spec', label: 'the design request' },
  { key: 'notes', label: 'the notes' },
];

/**
 * Combine `ours` and `theirs`, both edited from `base`. On a clash `prefer` decides which side wins
 * ("ours" when sending my edit, "theirs" when rebasing undo history so undo never reverts others).
 */
export function mergeProjects(base: Project, ours: Project, theirs: Project, prefer: 'ours' | 'theirs' = 'ours'): MergeResult {
  const clashes: string[] = [];
  const out: Project = { ...theirs };
  for (const f of FIELDS) {
    const v = pick(base[f.key], ours[f.key], theirs[f.key], prefer, () => clashes.push(f.label));
    if (v === undefined) delete (out as any)[f.key];
    else (out as any)[f.key] = v;
  }
  out.parts = mergeList(base.parts, ours.parts, theirs.parts, prefer, (p) => `part ${p.ref ?? p.label ?? p.id}`, clashes);
  out.wires = mergeList(base.wires, ours.wires, theirs.wires, prefer, () => 'a wire', clashes);
  const names = [...new Set([...Object.keys(ours.files), ...Object.keys(theirs.files), ...Object.keys(base.files)])];
  out.files = {};
  for (const n of names) {
    const v = pick(base.files[n], ours.files[n], theirs.files[n], prefer, () => clashes.push(n));
    if (v !== undefined) out.files[n] = v;
  }
  out.updatedAt = Math.max(ours.updatedAt ?? 0, theirs.updatedAt ?? 0);
  return { project: out, clashes: [...new Set(clashes)] };
}
