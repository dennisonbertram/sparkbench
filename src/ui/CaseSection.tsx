// "A case for it": printable enclosure generated from the finished board, with a 3D preview.
import React, { useState } from 'react';
import { useStore } from './store';
import { CaseViewer } from './CaseViewer';

interface CaseInfo {
  files: string[];
  outer: { w: number; d: number; h: number };
  openings: { ref: string; what: string; where: string }[];
  warnings: string[];
  tallest: { ref: string; h: number };
  notes: { name: string; note: string }[];
  board: { w: number; d: number };
}

const STYLES = [
  { id: 'rounded', label: 'Rounded' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'wall-mount', label: 'Wall-mount' },
  { id: 'desk-stand', label: 'Desk stand' },
] as const;

export function CaseSection({ jobId }: { jobId: string }) {
  const project = useStore((s) => s.project)!;
  const [style, setStyle] = useState<(typeof STYLES)[number]['id']>('rounded');
  const [info, setInfo] = useState<CaseInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function make(st = style) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/pcb/enclosure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jobId, project, style: st }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not make the case');
      setInfo(d);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }
  const file = (p: string, dl = false) => `/api/pcb/file?id=${jobId}&path=${encodeURIComponent(p)}${dl ? '&download' : ''}`;
  return (
    <section className="case-section" data-testid="case-section">
      <h3>A case for it</h3>
      <p className="muted">A 3D-printable case made to fit this exact board: posts for its mounting holes, holes for the buttons (with printed caps), LEDs and screen, vents for the sensors, and the USB opening.</p>
      <div className="case-styles" role="radiogroup" aria-label="Case style">
        {STYLES.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={style === s.id}
            className={style === s.id ? 'on' : ''}
            onClick={() => {
              setStyle(s.id);
              if (info) make(s.id);
            }}
          >
            {s.label}
          </button>
        ))}
        <button className="primary" onClick={() => make()} disabled={busy} data-testid="case-make">
          {busy ? 'Making the case…' : info ? 'Make it again' : 'Make a case'}
        </button>
      </div>
      {error && <div className="banner error">{error}</div>}
      {info && (
        <>
          <CaseViewer jobId={jobId} files={info.files} outer={info.outer} board={info.board} />
          <p data-testid="case-summary">
            Outside {info.outer.w} × {info.outer.d} × {info.outer.h} mm (tallest part: {info.tallest.ref}, {info.tallest.h} mm). Openings: {info.openings.map((o) => `${o.ref ? `${o.ref} ` : ''}${o.what}`).join('; ')}.
          </p>
          {info.warnings.map((w, i) => <div key={i} className="banner">{w}</div>)}
          <div className="pcb-downloads">
            {info.files.map((f) => (
              <a key={f} className="button" href={file(f, true)}>{f.split('/').pop()}</a>
            ))}
          </div>
          <ul className="case-notes">{info.notes.map((n) => <li key={n.name}><strong>{n.name}.stl</strong>: {n.note}</li>)}</ul>
          <p className="muted">
            No 3D printer? Upload the STL files to a printing service such as <a href="https://jlc3dp.com/3d-printing-quote" target="_blank" rel="noreferrer">JLC3DP</a> or <a href="https://craftcloud3d.com/upload" target="_blank" rel="noreferrer">Craftcloud</a> (PLA or PETG is fine).
          </p>
        </>
      )}
    </section>
  );
}
