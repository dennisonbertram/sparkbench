// Guided multimeter checks for the real build: probe positions and expected readings.
import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import type { MeterCheck } from '../core/multimeter';

export function MultimeterGuide() {
  const project = useStore((s) => s.project)!;
  const [checks, setChecks] = useState<MeterCheck[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || checks) return;
    fetch('/api/multimeter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) })
      .then((r) => r.json())
      .then((d) => setChecks(d.checks ?? []))
      .catch(() => setChecks([]));
  }, [open]);
  return (
    <details className="meter" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} data-testid="multimeter">
      <summary>Check it with a multimeter</summary>
      <p>Set the meter to <strong>DC volts (V⎓, 20 V range)</strong> and power the circuit. Keep the black probe in a − rail hole and touch the red probe to each hole below (an empty hole in the same column works just like the leg itself).</p>
      {!checks ? (
        <p className="muted">Working out the expected readings…</p>
      ) : checks.length ? (
        <ol>
          {checks.map((c, i) => (
            <li key={i}>
              Red probe in <strong>{c.hole}</strong>, black in <strong>{c.ground}</strong>: {c.range ? <>it swings between about <strong>{c.range[0]} and {c.range[1]} V</strong> (a meter shows a value in between)</> : <>about <strong>{c.expectV.toFixed(c.expectV < 1 ? 2 : 1)} V</strong></>} at {c.what}.
              {c.varies && !c.range && <span className="muted"> It can change as the program runs.</span>}
              <div className="muted">{c.ifWrong}</div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No measurement points for this design.</p>
      )}
    </details>
  );
}
