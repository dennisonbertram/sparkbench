import { describe, expect, it } from 'vitest';
import { mergeProjects } from '../../src/core/merge';
import { buildExample } from '../../src/core/examples';
import { useStore } from '../../src/ui/store';
import type { Project } from '../../src/core/types';

const base = () => buildExample('pico-traffic-light') as Project;
const movePart = (p: Project, i: number, x: number): Project => ({ ...p, parts: p.parts.map((q, j) => (j === i ? { ...q, x } : q)) });

describe('live-sharing merge', () => {
  it('keeps both people’s changes to different parts', () => {
    const b = base();
    const mine = movePart(b, 1, 500);
    const theirs = { ...movePart(b, 2, 700), name: 'Renamed' };
    const m = mergeProjects(b, mine, theirs);
    expect(m.clashes).toEqual([]);
    expect(m.project.parts[1].x).toBe(500);
    expect(m.project.parts[2].x).toBe(700);
    expect(m.project.name).toBe('Renamed');
  });

  it('reports a clash when both changed the same part', () => {
    const b = base();
    const m = mergeProjects(b, movePart(b, 1, 500), movePart(b, 1, 900), 'ours');
    expect(m.project.parts[1].x).toBe(500);
    expect(m.clashes).toHaveLength(1);
    expect(m.clashes[0]).toMatch(/^part /);
  });

  it('merges added and removed parts and files', () => {
    const b = base();
    const mine = { ...b, parts: b.parts.slice(0, -1) };
    const theirs = { ...b, files: { ...b.files, 'extra.py': 'x = 1' } };
    const m = mergeProjects(b, mine, theirs);
    expect(m.project.parts).toHaveLength(b.parts.length - 1);
    expect(m.project.files['extra.py']).toBe('x = 1');
  });
});

describe('undo in a shared room', () => {
  it('takes back only my own change, not a collaborator’s newer one', () => {
    const b = base();
    const st = useStore.getState();
    st.setProject(b, { record: false });
    useStore.setState({ past: [], future: [] });
    st.movePart(b.parts[1].id, 321, b.parts[1].y, true);
    // A collaborator renames the project (arrives from the room).
    const remote = { ...useStore.getState().project!, name: 'Ada renamed it' };
    st.setProject(remote, { record: false, keepSim: true, remote: true });
    st.undo();
    const p = useStore.getState().project!;
    expect(p.name).toBe('Ada renamed it');
    expect(p.parts[1].x).toBe(b.parts[1].x);
  });
});
