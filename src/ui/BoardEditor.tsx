// Arrange the parts on the circuit board by hand: drag to move, R or the button to rotate.
// "Re-route" designs the board again with exactly these positions.
import React, { useMemo, useRef, useState } from 'react';

export interface PlacedPart {
  ref: string;
  x: number;
  y: number;
  rot: number;
  reserved: [number, number, number, number];
}

const SNAP = 0.635; // quarter of the 2.54 mm pitch

export function BoardEditor({ parts, width, height, onApply, busy }: { parts: PlacedPart[]; width: number; height: number; onApply: (fixed: Record<string, { x: number; y: number; rot: number }>) => void; busy: boolean }) {
  const [items, setItems] = useState(parts);
  const [sel, setSel] = useState<string | null>(null);
  const drag = useRef<{ ref: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const scale = Math.min(700 / width, 460 / height);
  const toMm = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * (width + 20) - 10, ((e.clientY - r.top) / r.height) * (height + 20) - 10];
  };
  const overlaps = useMemo(() => {
    const bad = new Set<string>();
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i].reserved;
        const b = items[j].reserved;
        if (!(a[2] + 0.5 <= b[0] || b[2] + 0.5 <= a[0] || a[3] + 0.5 <= b[1] || b[3] + 0.5 <= a[1])) bad.add(items[i].ref).add(items[j].ref);
      }
    return bad;
  }, [items]);
  const move = (ref: string, dx: number, dy: number) => setItems((xs) => xs.map((p) => (p.ref === ref ? { ...p, x: p.x + dx, y: p.y + dy, reserved: [p.reserved[0] + dx, p.reserved[1] + dy, p.reserved[2] + dx, p.reserved[3] + dy] } : p)));
  const rotate = (ref: string) =>
    setItems((xs) =>
      xs.map((p) => {
        if (p.ref !== ref) return p;
        // Rotate the reserved area about the part's origin (the board will recompute it exactly).
        const [a, b, c, d] = p.reserved.map((v, i) => v - (i % 2 ? p.y : p.x));
        const r: [number, number, number, number] = [p.x + b, p.y - c, p.x + d, p.y - a];
        return { ...p, rot: (p.rot + 90) % 360, reserved: [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])] };
      }),
    );
  // Parts outside the outline make the board bigger when it is re-routed: say so, with the new size.
  const grown = useMemo(() => {
    const xs = items.flatMap((p) => [p.reserved[0], p.reserved[2]]);
    const ys = items.flatMap((p) => [p.reserved[1], p.reserved[3]]);
    const x0 = Math.min(0, ...xs) - (Math.min(...xs) < 0 ? 1.5 : 0);
    const y0 = Math.min(0, ...ys) - (Math.min(...ys) < 0 ? 1.5 : 0);
    const x1 = Math.max(width, ...xs) + (Math.max(...xs) > width ? 1.5 : 0);
    const y1 = Math.max(height, ...ys) + (Math.max(...ys) > height ? 1.5 : 0);
    const outside = items.filter((p) => p.reserved[0] < 0 || p.reserved[1] < 0 || p.reserved[2] > width || p.reserved[3] > height).map((p) => p.ref);
    return outside.length ? { x0, y0, w: x1 - x0, h: y1 - y0, outside } : null;
  }, [items, width, height]);
  // Small parts are drawn over big ones, and the part you're holding over everything, so nothing hides under another part.
  const area = (p: PlacedPart) => (p.reserved[2] - p.reserved[0]) * (p.reserved[3] - p.reserved[1]);
  const drawOrder = [...items].sort((a, b) => Number(a.ref === sel) - Number(b.ref === sel) || area(b) - area(a));
  const changed = items.some((p, i) => p.x !== parts[i].x || p.y !== parts[i].y || p.rot !== parts[i].rot);
  return (
    <div className="board-editor" data-testid="board-editor" tabIndex={0} onKeyDown={(e) => sel && (e.key === 'r' || e.key === 'R') && rotate(sel)}>
      <p className="muted">Drag a part to move it; press R (or the button) to turn it 90°. Red means two parts overlap. Then re-route: Sparkbench redraws every track and re-checks everything.</p>
      <svg ref={svg} viewBox={`-10 -10 ${width + 20} ${height + 20}`} width={(width + 20) * scale} height={(height + 20) * scale} role="img" aria-label="Board layout editor">
        <rect x={0} y={0} width={width} height={height} rx={2} fill="#2d6b3c" opacity={0.25} stroke="#2d6b3c" />
        {grown && <rect x={grown.x0} y={grown.y0} width={grown.w} height={grown.h} rx={2} fill="none" stroke="#c77700" strokeDasharray="2 1.5" strokeWidth={0.5} />}
        {drawOrder.map((p) => {
          const [x0, y0, x1, y1] = p.reserved;
          return (
            <g
              key={p.ref}
              className={`be-part ${sel === p.ref ? 'sel' : ''} ${overlaps.has(p.ref) ? 'bad' : ''} ${grown?.outside.includes(p.ref) ? 'outside' : ''}`}
              data-ref={p.ref}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture(e.pointerId);
                const [mx, my] = toMm(e);
                drag.current = { ref: p.ref, sx: mx, sy: my, ox: p.x, oy: p.y };
                setSel(p.ref);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.ref !== p.ref) return;
                const [mx, my] = toMm(e);
                const nx = d.ox + Math.round((mx - d.sx) / SNAP) * SNAP;
                const ny = d.oy + Math.round((my - d.sy) / SNAP) * SNAP;
                move(p.ref, nx - p.x, ny - p.y);
              }}
              onPointerUp={() => (drag.current = null)}
            >
              <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={0.8} />
              <text x={(x0 + x1) / 2} y={(y0 + y1) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(4, (x1 - x0) / 3)}>
                {p.ref}
              </text>
            </g>
          );
        })}
      </svg>
      {grown && (
        <div className="banner warn" data-testid="be-grow">
          {grown.outside.join(', ')} {grown.outside.length > 1 ? 'are' : 'is'} outside the board, so it will grow from {width} × {height} mm to about {Math.round(grown.w * 10) / 10} × {Math.round(grown.h * 10) / 10} mm (the dashed outline). Bigger boards cost a little more; drag {grown.outside.length > 1 ? 'them' : 'it'} back inside to keep the size.
        </div>
      )}
      {overlaps.size > 0 && <div className="banner error">{[...overlaps].join(', ')} overlap. Drag them apart (the part you’re moving is drawn on top).</div>}
      <div className="be-tools">
        <button onClick={() => sel && rotate(sel)} disabled={!sel}>Rotate {sel ?? ''} 90°</button>
        <button onClick={() => setItems(parts)} disabled={!changed}>Undo my moves</button>
        <button className="primary" disabled={!changed || overlaps.size > 0 || busy} onClick={() => onApply(Object.fromEntries(items.map((p) => [p.ref, { x: p.x, y: p.y, rot: p.rot }])))} data-testid="be-apply">
          {overlaps.size ? 'Fix the overlaps first' : 'Re-route with this layout'}
        </button>
      </div>
    </div>
  );
}
