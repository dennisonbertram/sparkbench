// "A case for it": printable enclosure generated from the finished board, with a 3D preview.
import React, { useState } from 'react';
import { useStore } from './store';
import { Banner, Button, ButtonLink, Segmented } from './ds';
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

/** What the case will have, from this project's real parts (no promises of buttons it doesn't have). */
function features(types: string[]): string {
  const has = (...t: string[]) => types.some((x) => t.includes(x));
  const f = ['posts for its mounting holes'];
  if (has('pushbutton')) f.push('holes for the buttons (with printed caps)');
  if (has('led', 'rgb-led')) f.push('windows for the LEDs');
  if (has('ssd1306', 'lcd1602', 'epaper29')) f.push('a window for the screen');
  if (has('dht22', 'ldr', 'ntc', 'pir', 'hcsr04', 'bme280')) f.push('openings so the sensors can sense the room');
  if (has('potentiometer', 'slide-switch')) f.push('holes for the knobs and switches');
  if (has('buzzer')) f.push('sound holes');
  if (types.some((t) => ['esp32-devkit', 'pi-pico', 'usb-micro'].includes(t))) f.push('the USB opening');
  return f.length > 1 ? `${f.slice(0, -1).join(', ')} and ${f[f.length - 1]}` : f[0];
}

export function CaseSection({ jobId }: { jobId: string }) {
  const project = useStore((s) => s.project)!;
  const [style, setStyle] = useState<(typeof STYLES)[number]['id']>('rounded');
  const [info, setInfo] = useState<(CaseInfo & { style: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function make(st = style) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/pcb/enclosure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: jobId, project, style: st }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not make the case');
      setInfo({ ...d, style: st });
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
      <p className="muted">A 3D-printable case made to fit this exact board: {features(project.parts.map((p) => p.type))}.</p>
      <div className="case-styles">
        <Segmented
          label="Case style"
          options={STYLES}
          value={style}
          onChange={(id) => {
            setStyle(id);
            if (info) make(id);
          }}
        />
        <Button variant="primary" onClick={() => make()} disabled={busy} data-testid="case-make">
          {busy ? 'Making the case…' : info ? 'Make it again' : 'Make a case'}
        </Button>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {info && (
        <>
          <CaseViewer jobId={jobId} files={info.files} outer={info.outer} board={info.board} style={info.style} />
          <p data-testid="case-summary">
            Outside {info.outer.w} × {info.outer.d} × {info.outer.h} mm (tallest part: {info.tallest.ref}, {info.tallest.h} mm). Openings: {info.openings.map((o) => `${o.ref ? `${o.ref} ` : ''}${o.what}`).join('; ')}.
          </p>
          {info.warnings.map((w, i) => <Banner key={i}>{w}</Banner>)}
          <div className="pcb-downloads">
            {info.files.map((f) => (
              <ButtonLink key={f} href={file(f, true)}>{f.split('/').pop()}</ButtonLink>
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
