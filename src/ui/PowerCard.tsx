// Power: measured current (from running the firmware in the simulator), battery life per battery
// type over a day of use, what each battery needs (regulator, charger, protection), and sleep advice.
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import type { PowerReport } from '../core/power';

type PowerInfo = PowerReport;

const fmtTime = (h: number) => (h === Infinity ? 'as long as it’s plugged in' : h < 1 ? `${Math.round(h * 60)} minutes` : h < 48 ? `${h.toFixed(h < 10 ? 1 : 0)} hours` : h < 24 * 60 ? `${Math.round(h / 24)} days` : `${Math.round(h / 24 / 30)} months`);
const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h)} h`);

/** "41 hours" at 24 h a day; "192 h of running → about 25 days at 8 h a day" otherwise. */
function lasts(hours: number, perDay: number): string {
  if (hours === Infinity) return '—';
  if (perDay >= 24) return fmtTime(hours);
  return `${fmtHours(hours)} of running → about ${fmtTime((hours / perDay) * 24)} at ${perDay} h a day`;
}

export function PowerCard() {
  const project = useStore((s) => s.project)!;
  const [info, setInfo] = useState<PowerInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [hoursText, setHoursText] = useState(project.board === 'none' ? '2' : '24');
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
  const typed = Number(hoursText);
  const hoursValid = hoursText.trim() !== '' && Number.isFinite(typed) && typed >= 0.5 && typed <= 24;
  const hoursPerDay = hoursValid ? typed : 24;
  const life = (o: PowerInfo['options'][number], ma: number) => (o.mAh === null || o.mAh === Infinity ? Infinity : (o.mAh * 0.8) / (ma * o.factor));
  return (
    <details className="power-card" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} data-testid="power-card">
      <summary>Power and batteries</summary>
      {error && <p className="problem error">{error}</p>}
      {!info && !error && open && <p className="muted">Running the program in the simulator for 30 seconds to measure it…</p>}
      {info && (
        <>
          <p>
            Your program draws about <strong>{info.load.avgMa} mA</strong> on average (highest moment {info.load.peakMa} mA), measured by running it for {info.load.seconds} s in the simulator.
          </p>
          {info.worst.totalMa > info.load.peakMa * 1.2 && (
            <p className="muted" data-testid="power-worst">
              If everything were on at full power at once ({worstExamples(project)}), it could need up to about <strong>{info.worst.totalMa} mA</strong>
              {info.worst.rails.filter((r) => r.worst > r.budget).map((r) => ` (${r.worst} mA on ${r.name}, the figure in the Problems tab)`).join('')}. Batteries and supplies are sized for that worst case below.
            </p>
          )}
          <details>
            <summary>Where it goes</summary>
            <ul className="power-parts">
              {Object.entries(info.maxPerPart ?? {})
                .map(([k, max]) => [k, info.load.perPart[k] ?? 0, max] as const)
                .filter(([, , max]) => max > 0.05)
                .sort((a, b) => b[1] - a[1] || b[2] - a[2])
                .map(([k, v, max]) => (
                  <li key={k}>
                    {k}: {v > 0.05 ? `${v} mA` : 'off during the run'}
                    {max > Math.max(1, v * 2) && <span className="muted"> (up to {Math.round(max)} mA when fully on)</span>}
                  </li>
                ))}
              <li className="muted">The {project.board === 'none' ? 'circuit' : 'board itself'} makes up the rest.</li>
            </ul>
          </details>
          <label className="power-hours">
            Used for
            <input type="number" min={0.5} max={24} step={0.5} value={hoursText} onChange={(e) => setHoursText(e.target.value)} aria-label="Hours of use per day" aria-invalid={!hoursValid} /> hours a day
          </label>
          {!hoursValid && <p className="problem warning" data-testid="power-hours-hint">Enter a number of hours between 0.5 and 24 (showing all-day use for now).</p>}
          <ul className="power-options" data-testid="power-table">
            {info.options.map((o) => {
              const hours = life(o, info.load.avgMa);
              const flat = life(o, info.worst.totalMa);
              const lowCurrent = o.id === 'powerbank' && info.load.avgMa < 60;
              return (
                <li key={o.id} className="power-option">
                  <div className="power-option-head">
                    <strong>{o.name}</strong>
                    <span>{hours === Infinity ? 'runs while plugged in' : lasts(hours, hoursPerDay)}</span>
                  </div>
                  {hours !== Infinity && flat < hours * 0.8 && <div className="muted">At full power all the time: {lasts(flat, hoursPerDay)}.</div>}
                  {lowCurrent && <div className="problem warning">This design draws only about {info.load.avgMa} mA, and many power banks switch themselves off below about 50 mA. Pick one with an “always on” or low-current mode.</div>}
                  {o.note && <div className="muted">{o.note}</div>}
                  <details>
                    <summary>What you need</summary>
                    <div className="muted">{o.regulator}{o.charging ? `; charging: ${o.charging}` : ''}</div>
                    {o.protection.map((p, i) => <div key={i} className="muted">• {p}</div>)}
                  </details>
                </li>
              );
            })}
          </ul>
          {info.sleep && (
            <p className="muted">
              Battery tip: if it only needs to wake up every {info.sleep.everyMin} minutes for about {info.sleep.awakeS} s (deep sleep in between), the average drops to about {info.sleep.avgMa} mA, so batteries last roughly {Math.round(info.load.avgMa / info.sleep.avgMa)}× longer.{info.sleep.caveat ? ` ${info.sleep.caveat}` : ''} Ask the copilot: “make it sleep between readings”.
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

function worstExamples(project: { parts: { type: string }[] }): string {
  const ex: string[] = [];
  const has = (t: string) => project.parts.some((p) => p.type === t);
  if (has('neopixel-ring')) ex.push('the ring at full white');
  if (has('servo')) ex.push('the servo straining');
  if (has('dc-motor')) ex.push('the pump or fan running');
  if (has('relay')) ex.push('the relay switched on');
  if (!ex.length) ex.push('every light and output on');
  return `e.g. ${ex.slice(0, 2).join(', ')}`;
}
