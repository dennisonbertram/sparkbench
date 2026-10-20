// Sliders / buttons that let the user change the "real world" around a part while simulating.
import React from 'react';
import type { PartInstance } from '../core/types';
import { partDef } from '../core/parts';
import { setInput } from './simClient';
import { useStore } from './store';

export function SimControls({ part, compact }: { part: PartInstance; compact?: boolean }) {
  const inputs = useStore((s) => s.sim.inputs);
  const project = useStore((s) => s.project);
  const usesNet = (project?.features ?? []).some((f) => f.kind === 'internet') || /network|urequests|requests|socket/.test(project?.files['main.py'] ?? '');
  const controls = (partDef(part.type).controls ?? []).filter((c) => c.key !== 'wifi' || usesNet);
  // Buttons, knobs and switches are operated directly on their picture.
  if (compact && ['pushbutton', 'potentiometer', 'slide-switch'].includes(part.type)) return null;
  if (!controls.length) return null;
  return (
    <div className={compact ? 'simctl simctl-compact' : 'simctl'} onPointerDown={(e) => e.stopPropagation()}>
      {controls.map((c) => {
        const k = `${part.id}.${c.key}`;
        const v = inputs[k] ?? c.default;
        if (c.kind === 'momentary')
          return (
            <button
              key={c.key}
              className={`momentary ${v ? 'on' : ''}`}
              onPointerDown={() => setInput(part.id, c.key, 1)}
              onPointerUp={() => setInput(part.id, c.key, 0)}
              onPointerLeave={() => v && setInput(part.id, c.key, 0)}
              title={`Hold to simulate: ${c.label}`}
            >
              {c.label}
            </button>
          );
        if (c.kind === 'toggle')
          return (
            <label key={c.key} className="toggle">
              <input type="checkbox" checked={!!v} onChange={(e) => setInput(part.id, c.key, e.target.checked ? 1 : 0)} />
              {c.label}
            </label>
          );
        return (
          <label key={c.key} className="slider">
            <span className="slider-label">{c.label}</span>
            <input type="range" min={c.min} max={c.max} step={c.step} value={v} onChange={(e) => setInput(part.id, c.key, Number(e.target.value))} aria-label={c.label} />
            <span className="slider-value">
              {Number.isInteger(c.step) ? Math.round(v) : v.toFixed(1)}
              {c.unit}
            </span>
          </label>
        );
      })}
    </div>
  );
}
