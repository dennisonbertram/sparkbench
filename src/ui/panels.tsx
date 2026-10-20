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
import { registerCustomPart, type CustomPartSpec } from '../core/customParts';
import { autoWirePart } from '../core/autowire';
import { partSize } from '../core/layout';

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
        {!discrete && (
          <button role="tab" aria-selected={tab === 'pins'} className={tab === 'pins' ? 'active' : ''} onClick={() => useStore.getState().set({ bottomTab: 'pins' })}>
            Pins
          </button>
        )}
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
      {tab === 'pins' && !discrete && <PinsPanel />}
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

/** Live GPIO table (mode, level, PWM, voltage, current) and recent I2C traffic. */
function PinsPanel() {
  const project = useStore((s) => s.project)!;
  const sim = useStore((s) => s.sim);
  const { netOf } = useMemo(() => buildNets(project), [project.parts, project.wires]);
  const board = project.parts.find((p) => partDef(p.type).category === 'board');
  const rows = Object.entries(sim.pins).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!rows.length) return <div className="serial muted">Press Run: every pin your program uses appears here with its mode, level, PWM duty, voltage and current.</div>;
  const bpins = board ? partDef(board.type).pins : [];
  return (
    <div className="pins-panel">
      <table className="pins-live">
        <thead>
          <tr>
            <th>Pin</th>
            <th>Mode</th>
            <th>Level</th>
            <th>PWM</th>
            <th className="num">Volts</th>
            <th className="num">mA</th>
            <th>Connected to</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([g, p]) => {
            const bp = bpins.find((x) => x.fn === `gpio${g}`);
            const net = board && bp ? netOf.get(pinKey({ part: board.id, pin: bp.name })) : undefined;
            const others = (net?.pins ?? []).filter((r) => r.part !== board?.id).map((r) => `${project.parts.find((x) => x.id === r.part)?.ref}.${r.pin}`);
            return (
              <tr key={g}>
                <td className="mono">{bp?.name ?? `GPIO${g}`} <span className="muted">GPIO{g}</span></td>
                <td>{p.mode === 'out' ? 'output' : p.mode === 'in' ? 'input' : p.mode}</td>
                <td>
                  <span className={`lvl ${p.level ? 'hi' : 'lo'}`}>{p.level ? 'HIGH' : 'LOW'}</span>
                </td>
                <td className="mono">{p.mode === 'pwm' ? `${Math.round(((p.duty ?? 0) / 65535) * 100)}% @ ${p.freq} Hz` : ''}</td>
                <td className="num mono">{p.v.toFixed(2)}</td>
                <td className="num mono">{Math.abs(p.ma) >= 0.05 ? p.ma.toFixed(1) : ''}</td>
                <td className="small">{others.join(', ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sim.i2c.length > 0 && (
        <div className="i2c-log">
          <div className="muted small">Recent I2C traffic (address, bytes)</div>
          <pre>{sim.i2c.slice(-12).join('\n')}</pre>
        </div>
      )}
    </div>
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
  const [mine, setMine] = useState<CustomPartSpec[]>([]);
  useEffect(() => {
    fetch('/api/parts')
      .then((r) => (r.ok ? r.json() : { parts: [] }))
      .then((d) => setMine(d.parts ?? []))
      .catch(() => {});
  }, []);
  const match = (text: string) => !q || text.toLowerCase().includes(q.toLowerCase());
  const list = PARTS.filter((p) => p.category !== 'board').filter((p) => match(`${p.name} ${p.description} ${p.keywords.join(' ')}`));
  const myList = mine.filter((s) => match(`${s.name} ${s.mpn} ${s.description}`));
  const cats = ['display', 'input', 'sensor', 'output', 'actuator', 'passive', 'ic', 'power'];
  return (
    <div className="library" role="dialog" aria-label="Add a part" onPointerDown={(e) => e.stopPropagation()}>
      <div className="library-head">
        <input autoFocus placeholder="Search parts (e.g. button, OLED, servo)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} />
        <button className="ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="library-list">
        <AddAnyComponent initial={list.length + myList.length === 0 ? q : ''} onDone={onClose} />
        {myList.length > 0 && (
          <div>
            <div className="lib-cat">Your components (from datasheets)</div>
            {myList.map((s) => (
              <button key={s.type} className="lib-item" onClick={() => addCustomPart(s).then(onClose)}>
                <span className="lib-name">
                  {s.name} <span className="ds-badge">datasheet</span>
                </span>
                <span className="lib-desc">
                  {s.eli5} · {s.vmin}–{s.vmax} V
                </span>
                <span className="lib-price">${s.priceUsd.toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
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
      <p className="library-foot">Built-in parts appear top-left — wire them by clicking a pin and then another pin. Parts added from a datasheet are wired for you. Wire them by clicking a pin and then another pin. Tip: asking the copilot (“add a buzzer”) also wires and codes it for you.</p>
    </div>
  );
}

/** Add a datasheet-defined part to the open project, wired to the board when possible. */
export async function addCustomPart(spec: CustomPartSpec, wire = true) {
  registerCustomPart(spec);
  const st = useStore.getState();
  const p = st.project;
  if (!p) return;
  const base = spec.type.replace(/[^a-z0-9]/g, '');
  let n = 1;
  while (p.parts.some((x) => x.id === `${base}${n}`)) n++;
  const id = `${base}${n}`;
  const right = Math.max(...p.parts.map((x) => x.x + partSize(x.type)[0]), 0) + 60;
  const top = Math.min(...p.parts.map((x) => x.y), 40);
  let next = annotate({ ...p, customParts: [...(p.customParts ?? []).filter((c) => c.type !== spec.type), spec], parts: [...p.parts, { id, type: spec.type, label: spec.name, props: {}, x: right, y: top }] });
  let notes: string[] = [];
  if (wire && p.board !== 'none') ({ project: next, notes } = autoWirePart(next, id));
  st.update(() => next);
  st.select({ kind: 'part', id });
  st.addChat({ role: 'ai', text: `Added the ${spec.name} (${spec.mpn}) from its datasheet${wire && p.board !== 'none' ? ' and wired it to the board' : ''}. Ask me to “use the ${spec.mpn} in the code” and I'll update the program.${spec.datasheetUrl ? ` [Datasheet](${spec.datasheetUrl})` : ''}`, details: notes });
  setTimeout(() => window.dispatchEvent(new Event('sparkbench:fit')), 250);
}

/** Search the web for any component's datasheet and turn it into a part (and a Claude Code skill). */
function AddAnyComponent({ initial, onDone }: { initial: string; onDone(): void }) {
  const ai = useStore((s) => s.aiStatus);
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [found, setFound] = useState<{ spec: CustomPartSpec; skillDir: string; reused: boolean } | null>(null);
  useEffect(() => setQ((x) => x || initial), [initial]);
  const go = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    setFound(null);
    try {
      const r = await fetch('/api/parts/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Lookup failed');
      setFound(d);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="any-part">
      <div className="lib-cat">Not in the list? Add any component</div>
      {!ai.enabled ? (
        <p className="muted small">Needs Claude (an API key or a Claude Code login) to find and read datasheets.</p>
      ) : (
        <form
          className="any-part-form"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Part number or datasheet URL, e.g. BME280, TMP36, VL53L0X" disabled={busy} aria-label="Part number or datasheet URL" />
          <button className="primary" disabled={busy || !q.trim()}>
            {busy ? 'Reading…' : 'Find datasheet'}
          </button>
        </form>
      )}
      {busy && <p className="assistant-status">Claude is finding and reading the datasheet (30–90 s)…</p>}
      {err && <div className="banner error">{err}</div>}
      {found && (
        <div className="part-card">
          <div className="part-card-head">
            <b>{found.spec.name}</b> <span className="muted">{found.spec.mpn}</span>
          </div>
          <p className="small">{found.spec.description}</p>
          <div className="small">
            <b>Supply</b> {found.spec.vmin}–{found.spec.vmax} V · <b>Interface</b> {found.spec.interface}
            {found.spec.i2cAddress !== undefined && ` (address 0x${found.spec.i2cAddress.toString(16)})`} · <b>≈ ${found.spec.priceUsd.toFixed(2)}</b>
          </div>
          <table className="pins">
            <tbody>
              {found.spec.pins.map((p) => (
                <tr key={p.name}>
                  <td className="pin-name">{p.name}</td>
                  <td>{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            {found.spec.datasheetUrl && (
              <a href={found.spec.datasheetUrl} target="_blank" rel="noreferrer">
                Datasheet
              </a>
            )}{' '}
            · {found.reused ? 'Already in your library' : 'Saved as a Claude Code skill'}: <code>{found.skillDir.replace(/^.*\/(\.claude\/)/, '$1')}</code>
            {found.spec.driver && <> · includes a MicroPython driver ({found.spec.driver.filename})</>}
          </p>
          <div className="part-card-actions">
            <button className="primary" onClick={() => addCustomPart(found.spec, true).then(onDone)}>
              Add & wire it
            </button>
            <button onClick={() => addCustomPart(found.spec, false).then(onDone)}>Add without wiring</button>
          </div>
        </div>
      )}
    </div>
  );
}
