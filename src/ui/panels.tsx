// Side and bottom panels: copilot chat, inspector, console (serial / problems / scope), part library.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { sendPrompt, suggestions as suggestFor } from './copilot';
import { marked } from 'marked';
import { Glossed } from './Glossed';
import { startSim } from './simClient';
import { PARTS, partDef } from '../core/parts';
import { buildNets, pinKey } from '../core/netlist';
import { runChecks } from '../core/checks';
import { SimControls } from './SimControls';
import type { CheckResult, FixAction } from '../core/types';
import { annotate } from '../core/netlist';

// ------------------------------------------------------------------ Copilot
export function Copilot() {
  const chat = useStore((s) => s.chat);
  const project = useStore((s) => s.project);
  const ai = useStore((s) => s.aiStatus);
  const busy = useStore((s) => s.busy);
  const [text, setText] = useState('');
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [chat]);
  const submit = () => {
    if (!text.trim()) return;
    sendPrompt(text);
    setText('');
  };
  const suggestions = suggestFor(project);
  return (
    <aside className="copilot" data-tour="copilot">
      <header className="panel-head">
        <h2>Copilot</h2>
        <span className={`ai-badge ${ai.enabled ? 'on' : ''}`} title={ai.enabled ? `Using ${ai.model}${ai.via === 'claude-cli' ? ' through your Claude Code login' : ''}` : 'Using the built-in offline planner. Set ANTHROPIC_API_KEY or log in to Claude Code to use Claude.'}>
          {ai.enabled ? 'Claude AI' : 'Offline planner'}
        </span>
      </header>
      <div className="chat-log" ref={log}>
        {!chat.length && (
          <div className="chat-empty">
            <p>Tell me what you want to build, in plain words. I'll pick the parts, wire them to valid pins, write the code and the docs.</p>
            <p>Then you can ask for changes: <em>“add a buzzer”</em>, <em>“use a Pico instead”</em>.</p>
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`msg ${m.role} ${m.pending ? 'pending' : ''}`}>
            {m.role === 'ai' && !m.pending ? <div className="msg-text md" dangerouslySetInnerHTML={{ __html: marked.parse(m.text, { async: false, breaks: true }) as string }} /> : <div className="msg-text">{m.text}</div>}
            {m.details && m.details.length > 0 && (
              <details className="msg-details">
                <summary>Why it's wired this way</summary>
                <ul>
                  {m.details.map((d, i) => (
                    <li key={i}>
                      <Glossed text={d} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {m.actions && (
              <div className="msg-actions">
                {m.actions.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => {
                      const p = useStore.getState().project;
                      if (a.run === 'run' && p) startSim(p);
                      else if (a.run.startsWith('tab:')) useStore.getState().setTab(a.run.slice(4) as any);
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="suggest">
        {suggestions.map((s) => (
          <button key={s} onClick={() => sendPrompt(s)} disabled={!!busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={busy ? busy : project ? 'Ask a question or for a change… (Enter to send)' : 'Describe your gadget… (Enter to send)'}
          disabled={!!busy}
          rows={3}
          aria-label="Message the copilot"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" className="primary" disabled={!text.trim() || !!busy}>
          {busy ? 'Working…' : 'Send'}
        </button>
      </form>
    </aside>
  );
}

// ------------------------------------------------------------------ Inspector
export function Inspector() {
  const project = useStore((s) => s.project)!;
  const selection = useStore((s) => s.selection);
  const sim = useStore((s) => s.sim);
  const part = selection?.kind === 'part' ? project.parts.find((p) => p.id === selection.id) : undefined;
  const wire = selection?.kind === 'wire' ? project.wires.find((w) => w.id === selection.id) : undefined;
  const { netOf } = useMemo(() => buildNets(project), [project.parts, project.wires]);
  const running = sim.status === 'running' || sim.status === 'booting';
  const usesNet = (project.features ?? []).some((f) => f.kind === 'internet') || /network|urequests|requests/.test(project.files['main.py'] ?? '');
  const interactive = project.parts.filter((p) => (partDef(p.type).controls ?? []).some((c) => c.key !== 'wifi' || usesNet));

  if (part) {
    const def = partDef(part.type);
    const v = sim.parts[part.id];
    return (
      <aside className="inspector" data-tour="inspector">
        <header className="panel-head">
          <h2>
            {part.ref} <span className="muted">{def.name}</span>
          </h2>
          <button className="ghost" onClick={() => useStore.getState().select(null)} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="panel-body">
          <p className="eli5">
            <Glossed text={def.eli5} />
          </p>
          {def.category !== 'board' && def.category !== 'passive' && project.board !== 'none' && !(project.features ?? []).some((f) => f.parts.includes(part.id)) && !new RegExp(`\\b${part.id}\\b|${part.ref}`).test(project.files['main.py'] ?? '') && (
            <div className="banner warn">
              The code doesn't use {part.ref} yet. Wire it to a free pin, then ask the copilot to “use the {def.name.toLowerCase()} I added” (with Claude), or add it in the Code tab.
            </div>
          )}
          <p className="muted small">{def.description}</p>
          {running && (def.controls?.length ?? 0) > 0 && (
            <section>
              <h3>Simulate</h3>
              <SimControls part={part} />
            </section>
          )}
          {running && v && (
            <section className="live">
              {v.led !== undefined && <div>LED current: {(v.ma ?? 0).toFixed(1)} mA</div>}
              {v.angle !== undefined && <div>Servo angle: {v.angle.toFixed(0)}°</div>}
              {v.tone !== undefined && <div>Tone: {v.tone ? `${v.tone} Hz` : 'silent'}</div>}
              {v.relay !== undefined && <div>Relay: {v.relay ? 'ON (COM–NO closed)' : 'off'}</div>}
              {v.powered !== undefined && <div>Power: {v.powered ? 'OK' : 'not powered'}</div>}
            </section>
          )}
          {(def.props ?? []).length > 0 && (
            <section>
              <h3>Properties</h3>
              {def.props!.map((pr) => (
                <label key={pr.key} className="field">
                  <span>
                    {pr.label}
                    {pr.unit ? ` (${pr.unit})` : ''}
                  </span>
                  {pr.type === 'select' ? (
                    <select value={part.props[pr.key]} onChange={(e) => useStore.getState().setPartProp(part.id, pr.key, e.target.value)}>
                      {pr.options!.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={pr.type === 'number' ? 'number' : 'text'}
                      value={part.props[pr.key]}
                      step="any"
                      onChange={(e) => useStore.getState().setPartProp(part.id, pr.key, pr.type === 'number' ? Number(e.target.value) : e.target.value)}
                    />
                  )}
                </label>
              ))}
            </section>
          )}
          <section>
            <h3>Pins</h3>
            <table className="pins">
              <tbody>
                {def.pins
                  .filter((pd) => def.category !== 'board' || (netOf.get(pinKey({ part: part.id, pin: pd.name }))?.pins.length ?? 0) > 1)
                  .map((pd) => {
                    const net = netOf.get(pinKey({ part: part.id, pin: pd.name }));
                    const others = (net?.pins ?? []).filter((r) => r.part !== part.id).map((r) => `${project.parts.find((p) => p.id === r.part)?.ref}.${r.pin}`);
                    return (
                      <tr key={pd.name} onMouseEnter={() => net && useStore.getState().set({ hoverNet: net.id })} onMouseLeave={() => useStore.getState().set({ hoverNet: null })}>
                        <td className="pin-name">{pd.name}</td>
                        <td>{others.length ? others.join(', ') : <span className="muted">{pd.required === false || pd.role === 'nc' ? 'unused' : 'not connected'}</span>}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {def.category === 'board' && <p className="muted small">Only connected pins are listed. Hover a pin on the board to see what it can do.</p>}
          </section>
          {def.buildNotes && (
            <section>
              <h3>Build tips</h3>
              <ul className="tips">
                {def.buildNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          )}
          {def.category !== 'board' && (
            <button className="danger" onClick={() => useStore.getState().removeSelection()}>
              Remove {part.ref}
            </button>
          )}
        </div>
      </aside>
    );
  }

  if (wire) {
    const net = netOf.get(pinKey(wire.a));
    const ref = (r: { part: string; pin: string }) => `${project.parts.find((p) => p.id === r.part)?.ref}.${r.pin}`;
    return (
      <aside className="inspector">
        <header className="panel-head">
          <h2>Wire</h2>
          <button className="ghost" onClick={() => useStore.getState().select(null)} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="panel-body">
          <p>
            {ref(wire.a)} → {ref(wire.b)}
          </p>
          <p className="muted small">Net {net?.name}</p>
          <label className="field">
            <span>Colour</span>
            <input type="color" value={wire.color ?? '#2e7d32'} onChange={(e) => useStore.getState().update((p) => ({ ...p, wires: p.wires.map((w) => (w.id === wire.id ? { ...w, color: e.target.value } : w)) }))} />
          </label>
          <button className="danger" onClick={() => useStore.getState().removeSelection()}>
            Delete wire
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector" data-tour="inspector">
      <header className="panel-head">
        <h2>Project</h2>
      </header>
      <div className="panel-body">
        <p className="summary">{project.summary}</p>
        {running && interactive.length > 0 && (
          <section>
            <h3>Simulation inputs</h3>
            {interactive.map((p) => (
              <div key={p.id} className="ctl-group">
                <div className="ctl-title">
                  {p.ref} · {p.label ?? partDef(p.type).name}
                </div>
                {['pushbutton', 'potentiometer', 'slide-switch'].includes(p.type) ? (
                  <SimControls part={p} />
                ) : (
                  <SimControls part={p} />
                )}
              </div>
            ))}
          </section>
        )}
        {!running && (
          <section>
            <h3>Next steps</h3>
            <ol className="steps">
              <li>Press <b>Run</b> to start the simulator.</li>
              <li>Click any part to learn what it does and see its pins.</li>
              <li>Open <b>Schematic</b>, <b>Parts list</b>, <b>Build guide</b> and <b>Blog post</b> for the finished outputs.</li>
            </ol>
          </section>
        )}
        {project.notes.length > 0 && (
          <section>
            <h3>Why it's wired this way</h3>
            <ul className="tips">
              {project.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ Console (bottom)
export function Console() {
  const project = useStore((s) => s.project)!;
  const sim = useStore((s) => s.sim);
  const tab = useStore((s) => s.bottomTab);
  const checks = useMemo(() => {
    try {
      return runChecks(project);
    } catch {
      return [] as CheckResult[];
    }
  }, [project.parts, project.wires, project.board]);
  const serialRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = serialRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sim.serial.length, tab]);
  const errs = checks.filter((c) => c.severity === 'error').length + sim.warnings.filter((w) => w.severity === 'error').length + (sim.error ? 1 : 0);
  const warns = checks.filter((c) => c.severity === 'warning').length + sim.warnings.filter((w) => w.severity === 'warning').length;
  const infos = checks.filter((c) => c.severity === 'info').length + sim.warnings.filter((w) => w.severity === 'info').length;
  const discrete = project.board === 'none';
  return (
    <section className="console" data-tour="console">
      <div className="console-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'serial'} className={tab === 'serial' ? 'active' : ''} onClick={() => useStore.getState().set({ bottomTab: 'serial' })}>
          {discrete ? 'Scope' : 'Serial monitor'}
        </button>
        <button role="tab" aria-selected={tab === 'problems'} className={tab === 'problems' ? 'active' : ''} onClick={() => useStore.getState().set({ bottomTab: 'problems' })}>
          Problems
          {errs > 0 && <span className="count err">{errs}</span>}
          {warns > 0 && <span className="count warn">{warns}</span>}
          {infos > 0 && errs + warns === 0 && <span className="count info" title="Tips, not problems">{infos}</span>}
          {errs + warns + infos === 0 && <span className="count ok">✓</span>}
        </button>
        <span className="spacer" />
        <span className="sim-time">{sim.status !== 'idle' ? `${(sim.t / 1000).toFixed(1)} s simulated` : ''}</span>
      </div>
      {tab === 'serial' && !discrete && (
        <pre className="serial" ref={serialRef} data-testid="serial">
          {sim.error && <span className="serial-err">{`${sim.error.raw}\n`}</span>}
          {sim.serial.length ? sim.serial.join('\n') : <span className="muted">print() output from your board appears here when the simulation runs.</span>}
        </pre>
      )}
      {tab === 'serial' && discrete && <Scope />}
      {tab === 'problems' && (
        <div className="problems" data-testid="problems">
          {sim.error && (
            <div className="problem error">
              <b>Program crashed{sim.error.line ? ` at ${sim.error.file}:${sim.error.line}` : ''}:</b> {sim.error.message}
              {sim.error.hint && <div className="hint">{sim.error.hint}</div>}
              {sim.error.line && (
                <button className="link" onClick={() => useStore.getState().set({ tab: 'code', activeFile: sim.error!.file ?? 'main.py' })}>
                  Show in code
                </button>
              )}
            </div>
          )}
          {sim.warnings.map((w) => (
            <div key={w.id} className={`problem ${w.severity}`}>
              <b>Simulation:</b> {w.text}
            </div>
          ))}
          {checks.map((c) => (
            <div key={c.id} className={`problem ${c.severity}`}>
              <b>{c.title}</b> — {c.detail}
              {c.fix && (
                <button className="link" onClick={() => applyFix(c.fix!.action)}>
                  {c.fix.label}
                </button>
              )}
            </div>
          ))}
          {!sim.error && !sim.warnings.length && !checks.length && <div className="problem ok">No problems found. The wiring passes all design checks.</div>}
        </div>
      )}
    </section>
  );
}

function applyFix(a: FixAction) {
  const st = useStore.getState();
  switch (a.kind) {
    case 'add-wire':
      st.addWire(a.a, a.b);
      break;
    case 'remove-wire':
      st.update((p) => ({ ...p, wires: p.wires.filter((w) => w.id !== a.wireId) }));
      break;
    case 'move-wire-end':
      st.update((p) => ({ ...p, wires: p.wires.map((w) => (w.id === a.wireId ? { ...w, [a.end]: a.to } : w)) }));
      break;
    case 'insert-resistor':
      st.update((p) => {
        const w = p.wires.find((x) => x.id === a.wireId);
        if (!w) return p;
        let n = 1;
        while (p.parts.some((x) => x.id === `resistor${n}`)) n++;
        const id = `resistor${n}`;
        const ax = p.parts.find((x) => x.id === w.a.part)!;
        const part = { id, type: 'resistor', label: 'Current-limiting resistor', props: { ohms: a.ohms }, x: ax.x + 20, y: ax.y + 60 };
        const wires = p.wires.filter((x) => x.id !== w.id).concat([
          { id: `${w.id}a`, a: w.a, b: { part: id, pin: '1' }, color: w.color },
          { id: `${w.id}b`, a: { part: id, pin: '2' }, b: w.b, color: w.color },
        ]);
        return annotate({ ...p, parts: [...p.parts, part], wires });
      });
      break;
  }
}

function Scope() {
  const scope = useStore((s) => s.sim.scope);
  const project = useStore((s) => s.project)!;
  const { nets } = useMemo(() => buildNets(project), [project]);
  if (!scope.length) return <div className="serial muted">Press Run to see voltages over time.</div>;
  const keys = Object.keys(scope[scope.length - 1].v).filter((k) => nets.find((n) => n.id === k && !/^GND/.test(n.name)));
  const t1 = scope[scope.length - 1].t;
  const t0 = Math.max(scope[0].t, t1 - 3000);
  const pts = scope.filter((s) => s.t >= t0);
  const vmax = Math.max(1, ...pts.flatMap((p) => keys.map((k) => p.v[k] ?? 0)));
  const colors = ['#f5c518', '#4fc3f7', '#ef5350', '#81c784', '#ce93d8', '#ffb74d'];
  const W = 1000;
  const H = 120;
  return (
    <div className="scope">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="scope-grid" />
        ))}
        {keys.slice(0, 6).map((k, i) => (
          <polyline key={k} fill="none" stroke={colors[i]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" points={pts.map((p) => `${((p.t - t0) / 3000) * W},${H - ((p.v[k] ?? 0) / vmax) * (H - 6) - 3}`).join(' ')} />
        ))}
      </svg>
      <div className="scope-legend">
        {keys.slice(0, 6).map((k, i) => {
          const n = nets.find((x) => x.id === k)!;
          const label = n.pins.map((r) => `${project.parts.find((p) => p.id === r.part)?.ref}.${r.pin}`).slice(0, 2).join(' / ');
          return (
            <span key={k} style={{ color: colors[i] }}>
              ● {label}: {(scope[scope.length - 1].v[k] ?? 0).toFixed(2)} V
            </span>
          );
        })}
        <span className="muted">last 3 s · max {vmax.toFixed(1)} V</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Part library popover
export function PartLibrary({ onClose }: { onClose(): void }) {
  const [q, setQ] = useState('');
  const board = useStore((s) => s.project?.board);
  const list = PARTS.filter((p) => p.category !== 'board').filter((p) => !q || `${p.name} ${p.description} ${p.keywords.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const cats = ['display', 'input', 'sensor', 'output', 'actuator', 'passive', 'ic', 'power'];
  void board;
  return (
    <div className="library" role="dialog" aria-label="Add a part" onPointerDown={(e) => e.stopPropagation()}>
      <div className="library-head">
        <input autoFocus placeholder="Search parts (e.g. button, OLED, servo)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} />
        <button className="ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="library-list">
        {cats.map((c) => {
          const items = list.filter((p) => p.category === c);
          if (!items.length) return null;
          return (
            <div key={c}>
              <div className="lib-cat">{c === 'ic' ? 'Chips' : c[0].toUpperCase() + c.slice(1) + 's'}</div>
              {items.map((p) => (
                <button
                  key={p.type}
                  className="lib-item"
                  onClick={() => {
                    useStore.getState().addPart(p.type, { x: 60 + Math.random() * 60, y: 40 + Math.random() * 60 });
                    onClose();
                  }}
                >
                  <span className="lib-name">{p.name}</span>
                  <span className="lib-desc">
                    {p.eli5}
                    {p.vmin !== undefined && ` · ${p.vmin}–${p.vmax} V`}
                  </span>
                  <span className="lib-price">${p.bom.priceUsd.toFixed(2)}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <p className="library-foot">Added parts appear top-left. Wire them by clicking a pin and then another pin. Tip: asking the copilot (“add a buzzer”) also wires and codes it for you.</p>
    </div>
  );
}
