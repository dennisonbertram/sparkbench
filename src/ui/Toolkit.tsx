// Illustrated "What you'll need" card for the Build guide.
import React, { useMemo } from 'react';
import { useStore } from './store';
import { toolkit, type ToolItem } from '../core/toolkit';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ICONS: Record<ToolItem['id'], React.ReactNode> = {
  breadboard: (
    <g {...S}>
      <rect x="4" y="12" width="56" height="40" rx="3" />
      <line x1="4" y1="32" x2="60" y2="32" strokeDasharray="2 3" />
      {[18, 24, 40, 46].map((y) => [12, 20, 28, 36, 44, 52].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="currentColor" stroke="none" />))}
    </g>
  ),
  jumpers: (
    <g {...S}>
      <path d="M8 50 C 14 14, 34 14, 40 44" />
      <path d="M22 54 C 30 26, 50 22, 56 48" />
      <rect x="6" y="50" width="4" height="8" fill="currentColor" />
      <rect x="38" y="44" width="4" height="8" fill="currentColor" />
      <rect x="20" y="54" width="4" height="6" fill="currentColor" />
      <rect x="54" y="48" width="4" height="8" fill="currentColor" />
    </g>
  ),
  'jumpers-mf': (
    <g {...S}>
      <path d="M10 50 C 18 16, 40 16, 48 40" />
      <rect x="8" y="50" width="4" height="8" fill="currentColor" />
      <rect x="44" y="40" width="9" height="13" rx="1" />
    </g>
  ),
  'usb-micro': (
    <g {...S}>
      <path d="M6 44 C 20 44, 26 20, 40 20" />
      <rect x="40" y="13" width="14" height="14" rx="2" />
      <path d="M54 17 h5 l2 3 l-2 3 h-5" />
    </g>
  ),
  'usb-c-power': (
    <g {...S}>
      <rect x="6" y="18" width="22" height="28" rx="3" />
      <path d="M28 32 C 38 32, 40 22, 48 22" />
      <rect x="48" y="17" width="10" height="10" rx="3" />
    </g>
  ),
  computer: (
    <g {...S}>
      <rect x="12" y="14" width="40" height="26" rx="2" />
      <path d="M6 46 h52 l-4 6 H10 z" />
    </g>
  ),
  'battery-snap': (
    <g {...S}>
      <rect x="18" y="18" width="28" height="36" rx="3" />
      <circle cx="26" cy="14" r="4" />
      <rect x="34" y="10" width="8" height="8" />
      <path d="M26 54 v6 M38 54 v6" />
    </g>
  ),
  multimeter: (
    <g {...S}>
      <rect x="16" y="6" width="32" height="50" rx="4" />
      <rect x="22" y="12" width="20" height="10" />
      <circle cx="32" cy="36" r="7" />
      <path d="M24 56 l-6 6 M40 56 l6 6" />
    </g>
  ),
  soldering: (
    <g {...S}>
      <path d="M8 56 L 30 34" strokeWidth="5" />
      <path d="M30 34 L 50 14" />
      <path d="M50 14 l6 -6" strokeWidth="1.5" />
    </g>
  ),
  screwdriver: (
    <g {...S}>
      <rect x="10" y="42" width="18" height="10" rx="3" transform="rotate(-45 19 47)" />
      <path d="M26 38 L 52 12" />
    </g>
  ),
  tweezers: (
    <g {...S}>
      <path d="M12 56 L 40 10 M22 58 L 44 12" />
      <path d="M40 10 q 2 -4 4 2" />
    </g>
  ),
  microsd: (
    <g {...S}>
      <path d="M18 8 h22 l8 8 v40 h-30 z" />
      <path d="M24 8 v8 M30 8 v8 M36 8 v8" />
    </g>
  ),
};

export function Toolkit() {
  const project = useStore((s) => s.project)!;
  const items = useMemo(() => toolkit(project), [project]);
  return (
    <section className="toolkit" data-testid="toolkit">
      <strong>What you'll need besides the parts</strong>
      <ul>
        {items.map((t) => (
          <li key={t.id} className={t.required ? '' : 'optional'}>
            <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden>{ICONS[t.id]}</svg>
            <div>
              <div className="tk-name">{t.name}</div>
              <div className="tk-why">{t.why}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
