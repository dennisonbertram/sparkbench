// "Build it step by step": walks a beginner through the exact breadboard layout, one step at a
// time, drawing only what's placed so far and ringing the holes for the current step.
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { planBreadboard } from '../core/bbplace';
import { holeXY, renderBreadboardSvg } from '../core/breadboard';

const key = (id: string) => `sb-build-step-${id}`;
function loadStep(id: string): number {
  try {
    return Number(localStorage.getItem(key(id)) ?? -1);
  } catch {
    return -1;
  }
}
function saveStep(id: string, n: number) {
  try {
    localStorage.setItem(key(id), String(n));
  } catch {
    /* private mode: progress just isn't remembered */
  }
}

export function BuildMode() {
  const project = useStore((s) => s.project)!;
  const plan = useMemo(() => planBreadboard(project), [project]);
  const [step, setStep] = useState(() => loadStep(project.id));
  const [whole, setWhole] = useState(false);
  const active = step >= 0 && step < plan.steps.length;
  const total = plan.steps.length;

  useEffect(() => {
    const v = loadStep(project.id);
    setStep(v > plan.steps.length ? -1 : v);
  }, [project.id, plan.steps.length]);
  useEffect(() => saveStep(project.id, step), [project.id, step]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowRight') setStep((s) => Math.min(total - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, total]);

  const svg = useMemo(() => {
    if (!active) return '';
    const done = plan.steps.slice(0, step + 1);
    const cur = plan.steps[step];
    let s = renderBreadboardSvg(plan.layout, { show: { parts: done.flatMap((x) => x.parts), wires: done.flatMap((x) => x.wires) }, highlight: cur.holes, labels: true });
    if (!whole && cur.holes.length) {
      // Zoom to the holes of this step (at least a third of the board, 2:1).
      const pts = cur.holes.map(holeXY);
      const x1 = Math.min(...pts.map((p) => p.x));
      const x2 = Math.max(...pts.map((p) => p.x));
      const y1 = Math.min(...pts.map((p) => p.y));
      const y2 = Math.max(...pts.map((p) => p.y));
      const w = Math.max(560, x2 - x1 + 160);
      const h = Math.max(w / 2, y2 - y1 + 120);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      s = s.replace(/viewBox="[^"]*" width="[^"]*" height="[^"]*"/, `viewBox="${cx - w / 2} ${cy - h / 2} ${w} ${h}" width="${w}" height="${h}"`);
    }
    return s;
  }, [plan, step, active, whole]);

  if (plan.problems.length) return null; // the guide's by-connection steps still apply

  if (!active) {
    const minutes = Math.max(10, Math.round(total * 1.5 / 5) * 5);
    return (
      <section className="build-mode" data-testid="build-mode">
        <div className="bm-intro">
          <div>
            <strong>{step >= total ? 'You finished the build' : 'Build it on a breadboard'}</strong>
            <p>
              {step >= total
                ? 'Every part and wire is in. Check your wiring with a photo below, or go through the steps again.'
                : `${total} short steps, about ${minutes} minutes. Each step shows exactly which holes to use, so you never have to read a schematic.`}
            </p>
          </div>
          <button className="primary" onClick={() => setStep(0)} data-testid="build-start">
            {step >= total ? 'Start again' : 'Build it step by step'}
          </button>
        </div>
      </section>
    );
  }

  const cur = plan.steps[step];
  return (
    <section className="build-mode active" data-testid="build-mode">
      <div className="bm-head">
        <span className="bm-count">Step {step + 1} of {total}</span>
        <div className="bm-progress" aria-hidden><span style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
        <button onClick={() => setWhole((w) => !w)}>{whole ? 'Zoom to this step' : 'Show whole board'}</button>
        <button onClick={() => setStep(-1)}>Close</button>
      </div>
      <p className="bm-text" data-testid="build-step-text">{cur.text}</p>
      <div className="bm-picture" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="bm-nav">
        <button onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button>
        <span className="bm-hint">Tip: the ← and → keys work too</span>
        {step < total - 1 ? (
          <button className="primary" onClick={() => setStep(step + 1)} data-testid="build-next">Done, next step</button>
        ) : (
          <button
            className="primary"
            onClick={() => {
              setStep(total);
              document.querySelector('[data-testid=photo-check]')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Finish and check with a photo
          </button>
        )}
      </div>
    </section>
  );
}
