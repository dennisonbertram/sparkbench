// Power: measured current (from running the firmware in the simulator), battery life per battery
// type over a day of use, what each battery needs (regulator, charger, protection), and sleep advice.
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import type { BatteryOption, LoadSample } from '../core/power';

interface PowerInfo {
  load: LoadSample;
  options: BatteryOption[];
  sleep: { everyMin: number; awakeS: number; avgMa: number } | null;
  protection: string[];
}

const fmtTime = (h: number) => (h === Infinity ? 'as long as it’s plugged in' : h < 1 ? `${Math.round(h * 60)} minutes` : h < 48 ? `${h.toFixed(h < 10 ? 1 : 0)} hours` : h < 24 * 60 ? `${Math.round(h / 24)} days` : `${Math.round(h / 24 / 30)} months`);

export function PowerCard() {
  const project = useStore((s) => s.project)!;
  const [info, setInfo] = useState<PowerInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [hoursPerDay, setHours] = useState(project.board === 'none' ? 2 : 24);
  const [error, setError] = useState('');
  const key = useMemo(() => JSON.stringify([project.files, project.parts.map((p) => [p.id, p.type, p.props]), project.wires.length]), [project]);
  useEffect(() => setInfo(null), [key]);
  useEffect(() => {
    if (!open || info) return;
    setError('');
    fetch('/api/power', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) })
      .then((r) => r.json().then((d) => (r.ok ? setInfo(d) : setError(d.error ?? 'Could not measure power'))))
      .catch((e) => setError(String(e)));
  }, [open, info]);
  return (
    <details className="power-card" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} data-testid="power-card">
      <summary>Power and batteries</summary>
      {error && <p className="problem error">{error}</p>}
      {!info && !error && open && <p className="muted">Running the program in the simulator for 30 seconds to measure it…</p>}
      {info && (
        <>
          <p>
            It draws about <strong>{info.load.avgMa} mA</strong> on average (peaks of {info.load.peakMa} mA), measured by running your program for {info.load.seconds} s in the simulator.
          </p>
          <details>
            <summary>Where it goes</summary>
            <ul className="power-parts">
              {Object.entries(info.load.perPart)
                .filter(([, v]) => v > 0.05)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k}>{k}: {v} mA</li>
                ))}
              <li className="muted">The {project.board === 'none' ? 'circuit' : 'board itself'} makes up the rest.</li>
            </ul>
          </details>
          <label className="power-hours">
            Used for
            <input type="number" min={0.5} max={24} step={0.5} value={hoursPerDay} onChange={(e) => setHours(Math.max(0.5, Math.min(24, Number(e.target.value) || 24)))} aria-label="Hours of use per day" /> hours a day
          </label>
          <table className="power-table" data-testid="power-table">
            <thead><tr><th>Battery</th><th>Lasts</th></tr></thead>
            <tbody>
              {info.options.map((o) => {
                const hours = o.mAh === null || o.mAh === Infinity ? Infinity : (o.mAh * 0.8) / (info.load.avgMa * o.factor);
                return (
                  <tr key={o.id}>
                    <td>
                      <div>{o.name}</div>
                      <div className="muted">{o.regulator}{o.charging ? `; charging: ${o.charging}` : ''}</div>
                      {o.protection.map((p, i) => <div key={i} className="muted">• {p}</div>)}
                      {o.note && <div className="muted">{o.note}</div>}
                    </td>
                    <td>{hours === Infinity ? '—' : hoursPerDay >= 24 ? fmtTime(hours) : `${fmtTime(hours)} of use ≈ ${fmtTime((hours / hoursPerDay) * 24)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {info.sleep && (
            <p className="muted">
              Battery tip: if it only needs to wake up every {info.sleep.everyMin} minutes for about {info.sleep.awakeS} s (deep sleep in between), the average drops to about {info.sleep.avgMa} mA, so batteries last roughly {Math.round(info.load.avgMa / info.sleep.avgMa)}× longer. Ask the copilot: “make it sleep between readings”.
            </p>
          )}
          <details>
            <summary>Protection for a product version</summary>
            <ul>{info.protection.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </details>
        </>
      )}
    </details>
  );
}
