// Guided multimeter checks for the real build: probe positions and expected readings.
import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import type { MeterCheck } from '../core/multimeter';
import { holeWords } from '../core/breadboard';
import { Disclosure } from './ds';

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
    <Disclosure className="meter" summary="Check it with a multimeter" onToggle={setOpen} data-testid="multimeter">
      <p>Set the meter to <strong>DC volts (V⎓, 20 V range)</strong> and power the circuit. Keep the black probe in a − (blue) rail hole and touch the red probe to each breadboard hole below. Holes are named by row letter and column number (d22 = row d, column 22); rail holes start with T (top) or B (bottom). An empty hole in the same column works just like the leg itself.</p>
      {!checks ? (
        <p className="muted">Working out the expected readings…</p>
      ) : checks.length ? (
        <ol>
          {checks.map((c, i) => (
            <li key={i}>
              Red probe in breadboard <strong>{holeWords(c.hole)}</strong>, black in <strong>{holeWords(c.ground)}</strong>: {c.range ? <>it swings between about <strong>{c.range[0]} and {c.range[1]} V</strong> (a meter shows a value in between)</> : <>about <strong>{c.expectV.toFixed(c.expectV < 1 ? 2 : 1)} V</strong></>} at {c.what}.
              {c.varies && !c.range && <span className="muted"> It can change as the program runs.</span>}
              <div className="muted">{c.ifWrong}</div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No measurement points for this design.</p>
      )}
    </Disclosure>
  );
}
