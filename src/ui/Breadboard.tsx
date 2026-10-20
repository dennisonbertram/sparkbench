// The breadboard canvas: parts on a cutting-mat, coloured jumper wires, click-to-wire pins,
// drag to move, wheel to zoom, drag the background to pan. Live simulation state is drawn here.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { PartView, type PinMap } from './parts/PartView';
import { SimControls } from './SimControls';
import { partDef, pinDef } from '../core/parts';
import { partSize } from '../core/layout';
import { buildNets, pinKey } from '../core/netlist';
import { setInput } from './simClient';
import type { PinRef } from '../core/types';

interface View {
  x: number;
  y: number;
  k: number;
}

export function Breadboard() {
  const project = useStore((s) => s.project)!;
  const sim = useStore((s) => s.sim);
  const selection = useStore((s) => s.selection);
  const wiringFrom = useStore((s) => s.wiringFrom);
  const hoverNet = useStore((s) => s.hoverNet);
  const pinnedNet = useStore((s) => s.pinnedNet);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [pins, setPins] = useState<Record<string, PinMap>>({});
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; ref: PinRef } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'pan' | 'part'; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; snapshot?: any } | null>(null);
  const fitted = useRef<string>('');

  const { netOf } = useMemo(() => buildNets(project), [project.parts, project.wires]);

  const onPins = useCallback((id: string, map: PinMap) => setPins((p) => ({ ...p, [id]: map })), []);
  const running = sim.status === 'running' || sim.status === 'booting';
  const onInput = useCallback((part: string, key: string, value: number) => setInput(part, key, value), []);

  // Fit the whole design into view when a new project opens.
  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el || !project.parts.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of project.parts) {
      const [w, h] = partSize(p.type);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + w);
      maxY = Math.max(maxY, p.y + h + (partDef(p.type).controls?.length ? 60 : 0));
    }
    const r = el.getBoundingClientRect();
    const k = Math.min(2.2, Math.max(0.35, Math.min((r.width - 60) / (maxX - minX), (r.height - 60) / (maxY - minY))));
    setView({ k, x: (r.width - (maxX - minX) * k) / 2 - minX * k, y: (r.height - (maxY - minY) * k) / 2 - minY * k });
  }, [project.parts]);
  useEffect(() => {
    if (fitted.current !== project.id) {
      fitted.current = project.id;
      requestAnimationFrame(fit);
    }
  }, [project.id, fit]);
  useEffect(() => {
    const h = () => fit();
    window.addEventListener('sparkbench:fit', h);
    return () => window.removeEventListener('sparkbench:fit', h);
  }, [fit]);

  const toWorld = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const k = Math.min(3, Math.max(0.25, view.k * Math.exp(-e.deltaY * 0.0015)));
    setView({ k, x: mx - ((mx - view.x) * k) / view.k, y: my - ((my - view.y) * k) / view.k });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
  };
  const onPartDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const p = project.parts.find((x) => x.id === id)!;
    drag.current = { kind: 'part', id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, snapshot: project };
    useStore.getState().select({ kind: 'part', id });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (wiringFrom) setMouse(toWorld(e.clientX, e.clientY));
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.kind === 'pan') setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else useStore.getState().movePart(d.id!, d.ox + dx / view.k, d.oy + dy / view.k, false);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'part' && d.moved && d.snapshot) {
      const st = useStore.getState();
      st.set({ past: [...st.past.slice(-50), d.snapshot], future: [] });
    }
    if (d.kind === 'pan' && !d.moved) {
      useStore.getState().select(null);
      useStore.getState().set({ wiringFrom: null, pinnedNet: null });
    }
  };

  const pinAbs = (ref: PinRef) => {
    const part = project.parts.find((p) => p.id === ref.part);
    const pp = pins[ref.part]?.[ref.pin];
    if (!part || !pp) return null;
    return { x: part.x + pp.x, y: part.y + pp.y };
  };

  const clickPin = (ref: PinRef) => {
    const st = useStore.getState();
    if (!st.wiringFrom) st.set({ wiringFrom: ref });
    else {
      st.addWire(st.wiringFrom, ref);
      st.set({ wiringFrom: null });
      setMouse(null);
    }
  };

  const selWire = selection?.kind === 'wire' ? selection.id : null;
  const hoverNetId = hoverNet ?? pinnedNet;

  return (
    <div
      ref={wrap}
      className={`canvas ${wiringFrom ? 'is-wiring' : ''}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      data-testid="breadboard"
    >
      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        {project.parts.map((part) => {
          const sel = selection?.kind === 'part' && selection.id === part.id;
          const v = sim.parts[part.id];
          const unpowered = running && v && v.powered === false;
          return (
            <div
              key={part.id}
              className={`part ${sel ? 'selected' : ''} ${unpowered ? 'unpowered' : ''}`}
              style={{ left: part.x, top: part.y }}
              onPointerDown={(e) => onPartDown(e, part.id)}
              data-part={part.id}
              title={`${part.ref ?? ''} ${part.label ?? partDef(part.type).name}`}
            >
              <PartView part={part} visual={v} onPins={onPins} onInput={onInput} inputs={sim.inputs} />
              <div className="part-tag">{partTag(part)}</div>
              {running && sel && <SimControls part={part} compact />}
              {running && !sel && <ValueChip part={part} />}
              {unpowered && <div className="nopower">No power</div>}
            </div>
          );
        })}
        <svg className="wires" width={1} height={1} style={{ overflow: 'visible' }}>
          {project.wires.map((w) => {
            const a = pinAbs(w.a);
            const b = pinAbs(w.b);
            if (!a || !b) return null;
            const net = netOf.get(pinKey(w.a));
            const hl = selWire === w.id || (hoverNetId && net?.id === hoverNetId);
            const d = wirePath(a, b);
            const live = running && net && sim.nets[net.id] !== undefined && sim.nets[net.id] > 1.5;
            return (
              <g
                key={w.id}
                className={`wire ${hl ? 'hl' : ''}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  useStore.getState().select({ kind: 'wire', id: w.id });
                }}
                onPointerEnter={() => net && useStore.getState().set({ hoverNet: net.id })}
                onPointerLeave={() => useStore.getState().set({ hoverNet: null })}
              >
                <path d={d} className="wire-hit" />
                <path d={d} className="wire-shadow" />
                <path d={d} className="wire-core" stroke={w.color ?? '#2e7d32'} />
                {live && <path d={d} className="wire-live" />}
              </g>
            );
          })}
          {wiringFrom && mouse && (() => {
            const a = pinAbs(wiringFrom);
            return a ? <path d={wirePath(a, mouse)} className="wire-rubber" /> : null;
          })()}
          {project.parts.map((part) =>
            Object.entries(pins[part.id] ?? {}).map(([pin, pp]) => {
              const ref = { part: part.id, pin };
              const net = netOf.get(pinKey(ref));
              const connected = (net?.pins.length ?? 0) > 1;
              const isFrom = wiringFrom && pinKey(wiringFrom) === pinKey(ref);
              return (
                <circle
                  key={`${part.id}:${pin}`}
                  cx={part.x + pp.x}
                  cy={part.y + pp.y}
                  r={4.2}
                  className={`pin ${connected ? 'connected' : ''} ${isFrom ? 'from' : ''} ${hoverNetId && net?.id === hoverNetId ? 'hl' : ''}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    clickPin(ref);
                  }}
                  onPointerEnter={(e) => {
                    setTip({ x: e.clientX, y: e.clientY, ref });
                    if (net) useStore.getState().set({ hoverNet: net.id });
                  }}
                  onPointerLeave={() => {
                    setTip(null);
                    useStore.getState().set({ hoverNet: null });
                  }}
                  data-pin={`${part.id}:${pin}`}
                />
              );
            }),
          )}
        </svg>
      </div>
      <div className="canvas-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))} title="Zoom in" aria-label="Zoom in">+</button>
        <button onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.2) }))} title="Zoom out" aria-label="Zoom out">−</button>
        <button onClick={fit} title="Fit design to screen">Fit</button>
      </div>
      {wiringFrom && <div className="canvas-hint">Click another pin to connect it · Esc to cancel</div>}
      {pinnedNet && !wiringFrom && <div className="canvas-hint">Highlighting net {buildNets(project).nets.find((n) => n.id === pinnedNet)?.name} from the schematic · click the mat to clear</div>}
      {!wiringFrom && !running && project.parts.length > 0 && <div className="canvas-hint subtle">Drag parts to move them · click a pin, then another pin, to add a wire</div>}
      {tip && <PinTip tip={tip} />}
    </div>
  );
}

function PinTip({ tip }: { tip: { x: number; y: number; ref: PinRef } }) {
  const project = useStore((s) => s.project)!;
  const sim = useStore((s) => s.sim);
  const part = project.parts.find((p) => p.id === tip.ref.part);
  if (!part) return null;
  const pd = pinDef(part.type, tip.ref.pin);
  const { netOf } = buildNets(project);
  const net = netOf.get(pinKey(tip.ref));
  const others = (net?.pins ?? []).filter((r) => pinKey(r) !== pinKey(tip.ref)).map((r) => `${project.parts.find((p) => p.id === r.part)?.ref ?? r.part}.${r.pin}`);
  const v = net && sim.nets[net.id];
  return (
    <div className="pintip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
      <div className="pintip-title">
        {part.ref}.{tip.ref.pin}
      </div>
      {pd?.description && <div className="pintip-desc">{pd.description}</div>}
      <div className="pintip-desc">{others.length ? `Connected to ${others.slice(0, 6).join(', ')}${others.length > 6 ? '…' : ''}` : 'Not connected'}</div>
      {v !== undefined && v !== null && <div className="pintip-v">{(v as number).toFixed(2)} V</div>}
    </div>
  );
}

function wirePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sag = Math.min(60, Math.hypot(dx, dy) * 0.18);
  const c1 = { x: a.x + dx * 0.25, y: a.y + dy * 0.1 + sag };
  const c2 = { x: b.x - dx * 0.25, y: b.y - dy * 0.1 + sag };
  return `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
}

function partTag(part: { ref?: string; type: string; label?: string; props: Record<string, any> }) {
  const def = partDef(part.type);
  if (part.type === 'resistor') return `${part.ref} ${fmtOhm(part.props.ohms)}`;
  if (part.type === 'capacitor' || part.type === 'electrolytic') return `${part.ref} ${fmtF(part.props.farads)}`;
  if (def.category === 'board' || def.category === 'passive') return part.ref ?? '';
  const label = part.label && part.label !== def.name && part.label.length <= 22 ? part.label : '';
  return label ? `${part.ref} · ${label}` : part.ref ?? '';
}

function fmtF(f: number) {
  return f >= 1e-6 ? `${+(f * 1e6).toFixed(1)}µF` : `${Math.round(f * 1e9)}nF`;
}

/** While simulating, unselected sensors show their current setting; click to change it. */
function ValueChip({ part }: { part: { id: string; type: string } }) {
  const inputs = useStore((s) => s.sim.inputs);
  const controls = (partDef(part.type).controls ?? []).filter((c) => c.kind !== 'toggle');
  if (!controls.length || ['potentiometer', 'pushbutton', 'slide-switch'].includes(part.type)) return null;
  return (
    <div className="value-chip" title="Click the part to change this">
      {controls
        .map((c) => {
          const v = inputs[`${part.id}.${c.key}`] ?? c.default;
          if (c.kind === 'momentary') return `${c.label}: ${v ? 'yes' : 'no'}`;
          return `${Number.isInteger(c.step) ? Math.round(v) : v.toFixed(1)}${c.unit}`;
        })
        .join(' · ')}
    </div>
  );
}

function fmtOhm(o: number) {
  return o >= 1000 ? `${+(o / 1000).toFixed(1)}kΩ` : `${o}Ω`;
}
