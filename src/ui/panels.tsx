// Side and bottom panels: copilot chat, inspector, console (serial / problems / scope), part library.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { useDialog } from './useDialog';
import { sendPrompt, suggestions as suggestFor, cancelDesign } from './copilot';
import { Glossed } from './Glossed';
import { startSim } from './simClient';
import { PARTS, partDef } from '../core/parts';
import { boardPart, buildNets, pinKey } from '../core/netlist';
import { runChecks } from '../core/checks';
import { SimControls } from './SimControls';
import { TestsPanel, TestsBadge } from './TestsPanel';
import { RequirementsCard, QuestionsCard } from './Requirements';
import { AttachImages } from './Attach';
import { PowerCard } from './PowerCard';
import { CostHint } from './CostHint';
import { CommentsPanel } from './Community';
import type { Shrunk } from './images';
import type { CheckResult, FixAction } from '../core/types';
import { annotate } from '../core/netlist';
import { registerCustomPart, type CustomPartSpec } from '../core/customParts';
import { withCustomPart } from '../core/autowire';
import { partSize } from '../core/layout';
import { Banner, Button, Card, ChatMessage, ChatThread, ColorInput, Composer, IconButton, LoadingState, PanelHead, Select, TextInput } from './ds';

// ------------------------------------------------------------------ Copilot
export function Copilot() {
  const chat = useStore((s) => s.chat);
  const project = useStore((s) => s.project);
  const ai = useStore((s) => s.aiStatus);
  const busy = useStore((s) => s.busy);
  const [text, setText] = useState('');
  const [images, setImages] = useState<Shrunk[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    const behavior = first.current ? 'auto' : 'smooth';
    first.current = false;
    // A finished AI reply: show its first line at the top, so the explanation is read from the start.
    const last = chat[chat.length - 1];
    const node = last?.role === 'ai' && !last.pending ? el.querySelector<HTMLElement>(`[data-msg="${last.id}"]`) : null;
    if (node) el.scrollTo({ top: el.scrollTop + node.getBoundingClientRect().top - el.getBoundingClientRect().top - 8, behavior });
    else el.scrollTo({ top: el.scrollHeight, behavior });
  }, [chat]);
  const submit = () => {
    if (!text.trim() && !images.length) return;
    sendPrompt(text, images);
    setText('');
    setImages([]);
  };
  const suggestions = suggestFor(project);
  return (
    <aside className="copilot" data-tour="copilot">
      <PanelHead title="Copilot">
        <span className={`ai-badge ${ai.enabled ? 'on' : ''}`} title={ai.enabled ? `Using ${ai.model}${ai.via === 'claude-cli' ? ' through your Claude Code login' : ''}` : 'Using the built-in offline planner. Set ANTHROPIC_API_KEY or log in to Claude Code to use Claude.'}>
          {ai.enabled ? 'Claude AI' : 'Offline planner'}
        </span>
      </PanelHead>
      <ChatThread className="chat-log" ref={log}>
        {!chat.length && (
          <div className="chat-empty">
            <p>Tell me what you want to build, in plain words. I'll pick the parts, wire them to valid pins, write the code and the docs.</p>
            <p>
              Then you can ask for changes: <em>“add a buzzer”</em>, <em>“use a Pico instead”</em>.
            </p>
          </div>
        )}
        {chat.map((m) => {
          // ChatMessage draws its extras box for any children, so pass none when there is nothing to show.
          const extras = !!(m.images?.length || m.questions || m.requirements || m.details?.length || m.actions);
          // `msg ai|user` stay as hooks for the e2e scripts; the look comes from ChatMessage.
          return (
            <ChatMessage key={m.id} data-msg={m.id} from={m.role === 'ai' ? 'assistant' : 'user'} text={m.text} pending={m.pending} className={`msg ${m.role}`}>
              {extras && (
                <>
                  {m.images && m.images.length > 0 && (
                    <div className="msg-images">
                      {m.images.map((src, i) => (
                        <img key={i} src={src} alt={`Attached image ${i + 1}`} />
                      ))}
                    </div>
                  )}
                  {m.questions && <QuestionsCard questions={m.questions} />}
                  {m.requirements && <RequirementsCard requirements={m.requirements} />}
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
                        <Button
                          key={a.label}
                          size="sm"
                          onClick={() => {
                            const p = useStore.getState().project;
                            if (a.run === 'run' && p) startSim(p);
                            else if (a.run.startsWith('tab:')) useStore.getState().setTab(a.run.slice(4) as any);
                            else if (a.run.startsWith('bottom:')) useStore.getState().set({ bottomTab: a.run.slice(7) as any });
                            else if (a.run === 'tour') useStore.getState().set({ tourStep: 0 });
                          }}
                        >
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </ChatMessage>
          );
        })}
      </ChatThread>
      <div className="suggest">
        {suggestions.map((s) => (
          <Button key={s} onClick={() => sendPrompt(s)} disabled={!!busy}>
            {s}
          </Button>
        ))}
      </div>
      <Composer
        className="composer"
        label="Message the copilot"
        value={text}
        onChange={setText}
        onSend={submit}
        canSend={!!text.trim() || images.length > 0}
        placeholder={busy ? busy : project ? 'Ask a question or for a change… (Enter to send)' : 'Describe your gadget… (Enter to send)'}
        busy={!!busy}
        disabled={!!busy}
        onStop={ai.enabled ? cancelDesign : undefined}
        attach={<AttachImages images={images} onChange={setImages} label="" />}
        top={ai.enabled && <CostHint kind="design" />}
      />
    </aside>
  );
}

// ------------------------------------------------------------------ Inspector
export function Inspector() {
  const project = useStore((s) => s.project)!;
  const runtime = useStore((s) => s.runtime);
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
        <PanelHead
          title={
            <>
              {part.ref} <span className="muted">{def.name}</span>
            </>
          }
        >
          <IconButton label="Close" onClick={() => useStore.getState().select(null)}>
            ✕
          </IconButton>
        </PanelHead>
        <div className="panel-body">
          <p className="eli5">
            <Glossed text={def.eli5} />
          </p>
          {runtime === 'python' && def.category !== 'board' && def.category !== 'passive' && project.board !== 'none' && !(project.features ?? []).some((f) => f.parts.includes(part.id)) && !new RegExp(`\\b${part.id}\\b|${part.ref}`).test(project.files['main.py'] ?? '') && (
            <Banner tone="warn">
              The code doesn't use {part.ref} yet.{' '}
              {project.wires.some((w) => (w.a.part === part.id || w.b.part === part.id) && (w.a.part === boardPart(project)?.id || w.b.part === boardPart(project)?.id))
                ? 'It is wired to the board: ask the copilot to'
                : 'Wire it to a free pin, then ask the copilot to'}{' '}
              “use the {def.name.toLowerCase()} I added” (with Claude), or add it in the Code tab.
            </Banner>
          )}
          <p className="muted small">{def.description}</p>
          {running && (def.controls ?? []).some((c) => c.key !== 'wifi' || (project.features ?? []).some((f) => f.kind === 'internet') || /network|urequests|requests|socket/.test(project.files['main.py'] ?? '')) && (
            <section>
              <h3>Simulate</h3>
              <SimControls part={part} />
            </section>
          )}
          {running && v && [v.led, v.angle, v.tone, v.relay, v.powered].some((x) => x !== undefined) && (
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
                    <Select value={part.props[pr.key]} onChange={(e) => useStore.getState().setPartProp(part.id, pr.key, e.target.value)}>
                      {pr.options!.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </Select>
                  ) : (
                    <TextInput
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
            <Button variant="danger" onClick={() => useStore.getState().removeSelection()}>
              Remove {part.ref}
            </Button>
          )}
          <CommentsPanel target={part.id} label={`${part.ref} ${part.label ?? def.name}`} />
        </div>
      </aside>
    );
  }

  if (wire) {
    const net = netOf.get(pinKey(wire.a));
    const ref = (r: { part: string; pin: string }) => `${project.parts.find((p) => p.id === r.part)?.ref}.${r.pin}`;
    return (
      <aside className="inspector">
        <PanelHead title="Wire">
          <IconButton label="Close" onClick={() => useStore.getState().select(null)}>
            ✕
          </IconButton>
        </PanelHead>
        <div className="panel-body">
          <p>
            {ref(wire.a)} → {ref(wire.b)}
          </p>
          <p className="muted small">Net {net?.name}</p>
          <label className="field">
            <span>Colour</span>
            <ColorInput value={wire.color ?? '#2e7d32'} onChange={(e) => useStore.getState().update((p) => ({ ...p, wires: p.wires.map((w) => (w.id === wire.id ? { ...w, color: e.target.value } : w)) }))} />
          </label>
          <Button variant="danger" onClick={() => useStore.getState().removeSelection()}>
            Delete wire
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector" data-tour="inspector">
      <PanelHead title="Project" />
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
              <li>Build it for real: <b>Build guide</b> → <b>Build it step by step</b> shows every hole.</li>
              <li>Plug your board in and click <b>Your board</b> to copy the program and test every part.</li>
              <li>Make it permanent: <b>Circuit board</b> designs a board you can order, with a case.</li>
            </ol>
          </section>
        )}
        <section>
          <PowerCard />
        </section>
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
        <Button role="tab" aria-selected={tab === 'serial'} className={tab === 'serial' ? 'active' : undefined} onClick={() => useStore.getState().set({ bottomTab: 'serial' })}>
          {discrete ? 'Scope' : 'Serial monitor'}
        </Button>
        <Button role="tab" aria-selected={tab === 'problems'} className={tab === 'problems' ? 'active' : undefined} onClick={() => useStore.getState().set({ bottomTab: 'problems' })}>
          Problems
          {errs > 0 && <span className="count err" title={`${errs} problem${errs === 1 ? '' : 's'} to fix`}>{errs}</span>}
          {warns > 0 && <span className="count warn" title={`${warns} warning${warns === 1 ? '' : 's'}`}>{warns}</span>}
          {infos > 0 && <span className="count info" title={`${infos} tip${infos === 1 ? '' : 's'}, not problems`}>{infos}</span>}
          {errs + warns + infos === 0 && <span className="count ok">✓</span>}
        </Button>
        {!discrete && (
          <Button role="tab" aria-selected={tab === 'pins'} className={tab === 'pins' ? 'active' : undefined} onClick={() => useStore.getState().set({ bottomTab: 'pins' })}>
            Pins
          </Button>
        )}
        <Button role="tab" aria-selected={tab === 'tests'} className={tab === 'tests' ? 'active' : undefined} onClick={() => useStore.getState().set({ bottomTab: 'tests' })} data-testid="tests-tab">
          Tests
          <TestsBadge />
        </Button>
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
      {tab === 'tests' && <TestsPanel />}
      {tab === 'problems' && (
        <div className="problems" data-testid="problems">
          {sim.error && (
            <div className="problem error">
              <b>Program crashed{sim.error.line ? ` at ${sim.error.file}:${sim.error.line}` : ''}:</b> {sim.error.message}
              {sim.error.hint && <div className="hint">{sim.error.hint}</div>}
              {sim.error.line && (
                <Button variant="link" onClick={() => useStore.getState().set({ tab: 'code', activeFile: sim.error!.file ?? 'main.py' })}>
                  Show in code
                </Button>
              )}
            </div>
          )}
          {sim.warnings.map((w) => (
            <div key={w.id} className={`problem ${w.severity}`}>
              {w.severity === 'info' && <span className="tip-tag">Tip</span>}
              <b>Simulation:</b> {w.text}
            </div>
          ))}
          {checks.map((c) => (
            <div key={c.id} className={`problem ${c.severity}`}>
              {c.severity === 'info' && <span className="tip-tag">Tip</span>}
              <b>{c.title}</b> — {c.detail}
              {c.fix && (
                <Button variant="link" onClick={() => applyFix(c.fix!.action)}>
                  {c.fix.label}
                </Button>
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
            const others = (net?.pins ?? [])
              .filter((r) => r.part !== board?.id)
              .map((r) => {
                const part = project.parts.find((x) => x.id === r.part);
                return part ? `${part.label ?? partDef(part.type).name} ${part.ref} (its ${r.pin} pin)` : r.pin;
              });
            return (
              <tr key={g}>
                <td className="mono">{bp?.name ?? `GPIO${g}`} <span className="muted">GPIO{g}</span></td>
                <td title={p.mode === 'pwm' ? 'PWM: the pin switches on and off very fast; the % is how much of the time it is on' : undefined}>{p.mode === 'out' ? 'output' : p.mode === 'in' ? 'input' : p.mode === 'pwm' ? 'PWM output' : p.mode}</td>
                <td>
                  <span className={`lvl ${p.level ? 'hi' : 'lo'}`}>{p.level ? 'HIGH' : 'LOW'}</span>
                </td>
                <td className="mono">{p.mode === 'pwm' ? `on ${Math.round(((p.duty ?? 0) / 65535) * 100)}% of the time, ${p.freq}× a second` : ''}</td>
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
  const span = Math.min(3000, Math.max(1, t1 - scope[0].t));
  const t0 = t1 - span;
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
          <polyline key={k} fill="none" stroke={colors[i]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" points={pts.map((p) => `${((p.t - t0) / span) * W},${H - ((p.v[k] ?? 0) / vmax) * (H - 6) - 3}`).join(' ')} />
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
        <span className="muted">last {span >= 1000 ? `${(span / 1000).toFixed(1)} s` : `${Math.round(span)} ms`} · max {vmax.toFixed(1)} V</span>
      </div>
    </div>
  );
}

/** A part from the parts library (datasheet parts), with its checked status. */
function LibraryItem({ spec: s, onDone }: { spec: CustomPartSpec; onDone(): void }) {
  const lib = (s as any).library;
  const checked = lib?.status === 'checked';
  return (
    <Button className="lib-item" onClick={() => addCustomPart(s).then(onDone)}>
      <span className="lib-name">
        {s.name}{' '}
        <span className={`ds-badge${checked ? ' checked' : ''}`} title={checked ? [lib.note, lib.simNote, lib.caveat].filter(Boolean).join(' ') : 'Read from the datasheet by Claude; not checked by the part check yet.'}>
          {checked ? '✓ checked in simulation' : 'from a datasheet'}
        </span>
      </span>
      <span className="lib-desc">
        {s.eli5}
        {s.vmin !== undefined && ` · ${s.vmin}–${s.vmax} V`}
      </span>
      <span className="lib-price">${s.priceUsd.toFixed(2)}</span>
    </Button>
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
  const list = PARTS.filter((p) => p.category !== 'board' && !p.production).filter((p) => match(`${p.name} ${p.description} ${p.keywords.join(' ')}`));
  const myList = mine.filter((s) => match(`${s.name} ${s.mpn} ${s.description}`));
  const cats = ['sensor', 'display', 'input', 'output', 'actuator', 'ic', 'passive', 'power'];
  const ref = useDialog<HTMLDivElement>(onClose, { trap: false, autoFocus: false });
  return (
    <div className="library" role="dialog" aria-label="Add a part" onPointerDown={(e) => e.stopPropagation()} ref={ref}>
      <div className="library-head">
        <TextInput autoFocus placeholder="Search parts (e.g. button, OLED, servo)" value={q} onChange={(e) => setQ(e.target.value)} />
        <IconButton label="Close" onClick={onClose}>
          ✕
        </IconButton>
      </div>
      <div className="library-list">
        <AddAnyComponent initial={list.length + myList.length === 0 ? q : ''} onDone={onClose} />
        {cats.map((c) => {
          const items = list.filter((p) => p.category === c);
          const mine = myList.filter((s) => s.category === c);
          if (!items.length && !mine.length) return null;
          return (
            <div key={c}>
              <div className="lib-cat">{c === 'ic' ? 'Chips' : c[0].toUpperCase() + c.slice(1) + 's'}</div>
              {mine.map((s) => (
                <LibraryItem key={s.type} spec={s} onDone={onClose} />
              ))}
              {items.map((p) => (
                <Button
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
                </Button>
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
  const st = useStore.getState();
  const p = st.project;
  if (!p) return;
  const { project: next, notes, id } = withCustomPart(p, spec, { wire });
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
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Part number or datasheet URL, e.g. BME280, TMP36, VL53L0X" disabled={busy} aria-label="Part number or datasheet URL" />
          <Button type="submit" variant="primary" disabled={busy || !q.trim()}>
            {busy ? 'Reading…' : 'Find datasheet'}
          </Button>
          {ai.enabled && <CostHint kind="datasheet" />}
        </form>
      )}
      {busy && <LoadingState label="Claude is finding and reading the datasheet" detail="Usually 30–90 seconds." slowAfterMs={90_000} />}
      {err && <Banner tone="error">{err}</Banner>}
      {found && (
        <Card className="part-card">
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
            <Button variant="primary" onClick={() => addCustomPart(found.spec, true).then(onDone)}>
              Add & wire it
            </Button>
            <Button onClick={() => addCustomPart(found.spec, false).then(onDone)}>Add without wiring</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
