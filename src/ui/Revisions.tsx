// Revisions: release the design as Rev A, B…, with what changed since the last release.
import React, { useMemo, useState } from 'react';
import { useStore } from './store';
import { releaseRevision, unreleasedChanges } from '../core/revisions';

export function Revisions() {
  const project = useStore((s) => s.project)!;
  const [note, setNote] = useState('');
  const pending = useMemo(() => unreleasedChanges(project), [project]);
  const revs = project.revisions ?? [];
  const next = revs.length ? String.fromCharCode(revs[revs.length - 1].rev.charCodeAt(0) + 1) : 'A';
  const canRelease = !revs.length || pending.length > 0;
  return (
    <details className="revisions" data-testid="revisions" open={revs.length > 0}>
      <summary>
        Revision {project.revision ? `Rev ${project.revision}` : 'not released yet'}
        {pending.length > 0 && <span className="rev-pending"> · {pending.length} change{pending.length > 1 ? 's' : ''} since Rev {project.revision}</span>}
      </summary>
      <p className="muted">Release the design when you order boards, so you always know which files made which boards. The revision letter is printed on the board.</p>
      {pending.length > 0 && (
        <ul className="rev-changes">{pending.map((c, i) => <li key={i}>{c}</li>)}</ul>
      )}
      {canRelease && (
        <form
          className="rev-form"
          onSubmit={(e) => {
            e.preventDefault();
            useStore.getState().update((p) => releaseRevision(p, note.trim() || (revs.length ? 'Changes' : 'First boards')));
            setNote('');
          }}
        >
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={revs.length ? 'Why this revision? e.g. "brighter LED"' : 'e.g. "First boards"'} aria-label="Revision note" />
          <button type="submit" data-testid="rev-release">Release Rev {next}</button>
        </form>
      )}
      {revs.length > 0 && (
        <ol className="rev-history" reversed>
          {[...revs].reverse().map((r) => (
            <li key={r.rev}>
              <strong>Rev {r.rev}</strong> · {r.date} · {r.note}
              <ul>{r.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
