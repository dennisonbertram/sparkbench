import React, { useEffect, useState } from 'react';
import { useStore, listSaved, loadCurrent, deleteSaved, type Tab } from './store';
import { Breadboard } from './Breadboard';
import { Copilot, Inspector, Console, PartLibrary } from './panels';
import { SchematicView, CodeView, BomView, MarkdownView } from './views';
import { startSim, stopSim, setSpeed, simSupported } from './simClient';
import { sendPrompt } from './copilot';
import { EXAMPLES, buildExample } from '../core/examples';
import { downloadZip, download, slug } from './exporters';
import { audio } from './audio';
import { Tour } from './Tour';
import { BOARDS } from '../core/boards';
import type { Project } from '../core/types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'breadboard', label: 'Breadboard' },
  { id: 'schematic', label: 'Schematic' },
  { id: 'code', label: 'Code' },
  { id: 'bom', label: 'Parts list' },
  { id: 'guide', label: 'Build guide' },
  { id: 'blog', label: 'Blog post' },
];

export function App() {
  const project = useStore((s) => s.project);
  const tab = useStore((s) => s.tab);
  const tourStep = useStore((s) => s.tourStep);

  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && useStore.getState().set({ aiStatus: { enabled: !!d.ai?.enabled, model: d.ai?.model, via: d.ai?.via, kicad: d.kicad, ngspice: d.ngspice } }))
      .catch(() => {});
    const p = loadCurrent();
    const url = new URL(location.href);
    const ex = url.searchParams.get('example');
    if (ex && EXAMPLES.some((e) => e.id === ex)) useStore.getState().setProject(buildExample(ex), { record: false });
    else if (p && !url.searchParams.has('welcome')) useStore.getState().setProject(p, { record: false });
  }, []);

  // First project ever opened: offer the guided tour.
  useEffect(() => {
    if (!project) return;
    try {
      if (!localStorage.getItem('sparkbench.tour.done') && !new URL(location.href).searchParams.has('notour')) setTimeout(() => useStore.getState().set({ tourStep: 0 }), 600);
    } catch {}
  }, [!!project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const st = useStore.getState();
      if (e.key === 'Escape') st.set({ wiringFrom: null });
      if (typing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection) {
        e.preventDefault();
        st.removeSelection();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!project) return <Welcome />;
  return (
    <div className="app">
      <Topbar />
      <div className="main">
        <Copilot />
        <section className="center">
          <nav className="tabs" role="tablist" data-tour="tabs">
            {TABS.filter((t) => t.id !== 'code' || project.board !== 'none').map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => useStore.getState().setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="view">
            {tab === 'breadboard' && <BreadboardWithLibrary />}
            {tab === 'schematic' && <SchematicView />}
            {tab === 'code' && <CodeView />}
            {tab === 'bom' && <BomView />}
            {tab === 'guide' && <MarkdownView kind="guide" />}
            {tab === 'blog' && <MarkdownView kind="blog" />}
          </div>
          <Console />
        </section>
        <Inspector />
      </div>
      {tourStep !== null && <Tour />}
    </div>
  );
}

function BreadboardWithLibrary() {
  const [lib, setLib] = useState(false);
  return (
    <div className="bb-wrap">
      <Breadboard />
      <button className="add-part" onClick={() => setLib((v) => !v)} data-tour="add-part">
        + Add part
      </button>
      {lib && <PartLibrary onClose={() => setLib(false)} />}
    </div>
  );
}

function Topbar() {
  const project = useStore((s) => s.project)!;
  const status = useStore((s) => s.sim.status);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const [speed, setSpd] = useState(1);
  const [sound, setSound] = useState(false);
  const [menu, setMenu] = useState<null | 'projects' | 'export'>(null);
  const running = status === 'running' || status === 'booting';
  const board = project.board === 'none' ? 'No microcontroller' : BOARDS[project.board].name;
  return (
    <header className="topbar">
      <button className="brand" onClick={() => setMenu(menu === 'projects' ? null : 'projects')} title="Projects">
        <Logo />
        <span>Sparkbench</span>
      </button>
      <input className="project-name" value={project.name} aria-label="Project name" onChange={(e) => useStore.getState().update((p) => ({ ...p, name: e.target.value }), false)} />
      <span className="board-chip" title="Target board">
        {board}
      </span>
      <div className="run-group" data-tour="run">
        {!running ? (
          <button className="run" onClick={() => startSim(project, speed)} disabled={!simSupported()} title={simSupported() ? 'Run the simulation' : 'This browser blocks the simulator (needs cross-origin isolation)'}>
            <span className="run-icon" aria-hidden>▶</span> Run
          </button>
        ) : (
          <button className="run stop" onClick={() => stopSim()}>
            <span className="run-icon" aria-hidden>■</span> Stop
          </button>
        )}
        {running && (
          <button className="ghost" onClick={() => startSim(useStore.getState().project!, speed)} title="Restart from the beginning" aria-label="Restart">
            ↻<span className="restart-label"> Restart</span>
          </button>
        )}
        <select
          value={speed}
          aria-label="Simulation speed"
          onChange={(e) => {
            const v = Number(e.target.value);
            setSpd(v);
            setSpeed(v);
          }}
        >
          <option value={0.25}>¼× speed</option>
          <option value={0.5}>½× speed</option>
          <option value={1}>1× speed</option>
          <option value={2}>2× speed</option>
          <option value={5}>5× speed</option>
        </select>
        <button
          className={`ghost ${sound ? 'on' : ''}`}
          onClick={() => {
            audio.setEnabled(!sound);
            setSound(!sound);
          }}
          title="Play the buzzer through your speakers"
          aria-pressed={sound}
        >
          {sound ? 'Sound on' : 'Sound off'}
        </button>
        <span className={`status status-${status}`}>{statusText(status)}</span>
      </div>
      <span className="spacer" />
      <button className="ghost" onClick={() => useStore.getState().undo()} disabled={!past} title="Undo (⌘Z)">
        Undo
      </button>
      <button className="ghost" onClick={() => useStore.getState().redo()} disabled={!future} title="Redo (⇧⌘Z)">
        Redo
      </button>
      <button className="ghost" onClick={() => useStore.getState().set({ tourStep: 0 })}>
        Tour
      </button>
      <div className="menu-anchor">
        <button className="primary" onClick={() => setMenu(menu === 'export' ? null : 'export')} data-tour="export">
          Export
        </button>
        {menu === 'export' && (
          <div className="menu" onMouseLeave={() => setMenu(null)}>
            <button onClick={() => downloadZip(project).then(() => setMenu(null))}>Everything (.zip)</button>
            <button onClick={() => download(`${slug(project.name)}.sparkbench.json`, JSON.stringify(project, null, 2), 'application/json')}>Project file (.json)</button>
            <div className="menu-note">KiCad, SPICE, BOM and docs are also on their own tabs.</div>
          </div>
        )}
      </div>
      {menu === 'projects' && <ProjectsMenu onClose={() => setMenu(null)} />}
    </header>
  );
}

function statusText(s: string) {
  return { idle: 'Not running', booting: 'Starting…', running: 'Running', stopped: 'Stopped', error: 'Crashed — see Problems', finished: 'Program ended' }[s] ?? s;
}

function ProjectsMenu({ onClose }: { onClose(): void }) {
  const saved = listSaved();
  const [, force] = useState(0);
  return (
    <div className="menu projects-menu" onMouseLeave={onClose}>
      <button
        onClick={() => {
          stopSim(true);
          useStore.getState().set({ project: null, showWelcome: true, chat: [] });
          onClose();
        }}
      >
        New project…
      </button>
      <label className="menu-file">
        Import project file…
        <input
          type="file"
          accept=".json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const p = JSON.parse(await f.text()) as Project;
              if (!p.parts || !p.wires) throw new Error('not a Sparkbench project');
              useStore.getState().setProject({ ...p, id: `p${Date.now().toString(36)}` });
              onClose();
            } catch (err: any) {
              alert(`Could not open that file: ${err.message}`);
            }
          }}
        />
      </label>
      <button
        onClick={() => {
          const p = useStore.getState().project!;
          useStore.getState().setProject({ ...p, id: `p${Date.now().toString(36)}`, name: `${p.name} (copy)` });
          onClose();
        }}
      >
        Duplicate this project
      </button>
      <div className="menu-sep">Recent</div>
      {saved.slice(0, 10).map((p) => (
        <div className="menu-row" key={p.id}>
          <button
            onClick={() => {
              stopSim(true);
              useStore.getState().setProject(p, { record: false });
              onClose();
            }}
          >
            {p.name}
          </button>
          <button
            className="ghost small"
            aria-label={`Delete ${p.name}`}
            onClick={() => {
              if (confirm(`Delete “${p.name}”?`)) {
                deleteSaved(p.id);
                if (useStore.getState().project?.id === p.id) {
                  // Deleting the open project: close it so it isn't saved again.
                  stopSim(true);
                  useStore.getState().set({ project: null, showWelcome: true, chat: [] });
                  onClose();
                }
                force((n) => n + 1);
              }
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

const STEPS = ['Reading your description', 'Choosing parts', 'Assigning pins and wiring', 'Writing the code', 'Testing it in the simulator'];

/** Shown while Claude designs a project from the welcome screen (it can take up to a minute). */
function Designing({ text, status }: { text: string; status: string }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const step = Math.min(STEPS.length - 1, Math.floor(t / 9));
  return (
    <div className="welcome designing" aria-live="polite">
      <header className="welcome-top">
        <span className="brand">
          <Logo /> <span>Sparkbench</span>
        </span>
      </header>
      <section className="hero">
        <p className="lede">“{text}”</p>
        <h1>{status}</h1>
        <ol className="design-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
              {s}
            </li>
          ))}
        </ol>
        <p className="hero-hint">{t} s — designs with custom code usually take 30–60 seconds.</p>
      </section>
    </div>
  );
}

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2.5" fill="var(--mat)" />
      {[6, 10, 14, 18].map((x) => (
        <circle key={x} cx={x} cy="9" r="1.1" fill="var(--mat-line)" />
      ))}
      {[6, 10, 14, 18].map((x) => (
        <circle key={x} cx={x} cy="15" r="1.1" fill="var(--mat-line)" />
      ))}
      <path d="M13.5 3 L9 12.5 h4 L10.5 21 L16 10.5 h-4 Z" fill="var(--signal)" stroke="var(--ink)" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}

function Welcome() {
  const [text, setText] = useState('');
  const busy = useStore((s) => s.busy);
  const chat = useStore((s) => s.chat);
  const lastAi = [...chat].reverse().find((m) => m.role === 'ai' && !m.pending);
  if (busy) return <Designing text={useStore.getState().chat.find((m) => m.role === 'user')?.text ?? ''} status={busy} />;
  const saved = listSaved();
  const go = () => text.trim() && sendPrompt(text);
  const boardName = (b: string) => (b === 'none' ? 'No MCU' : BOARDS[b as 'esp32'].short);
  return (
    <div className="welcome">
      <header className="welcome-top">
        <span className="brand">
          <Logo /> <span>Sparkbench</span>
        </span>
        {saved.length > 0 && (
          <button className="ghost" onClick={() => useStore.getState().setProject(saved[0], { record: false })}>
            Continue “{saved[0].name}”
          </button>
        )}
      </header>
      <section className="hero">
        <h1>Describe a gadget. Get a circuit you can run.</h1>
        <p className="lede">Sparkbench picks the parts, wires them to the right pins, writes the code and simulates it — then hands you the schematic, parts list, build guide and a write-up.</p>
        <form
          className="hero-input"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. An ESP32 with a small screen, two buttons, a temperature sensor and a motion sensor"
            rows={3}
            aria-label="Describe what you want to build"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                go();
              }
            }}
          />
          <button className="primary big" type="submit" disabled={!text.trim() || !!busy}>
            Design it
          </button>
        </form>
        {lastAi && (
          <div className="hero-reply" role="status">
            <b>Copilot:</b> {lastAi.text}
          </div>
        )}
        <p className="hero-hint">Works with ESP32, Raspberry Pi Pico, Raspberry Pi 4, or plain components (555 timers, transistors).</p>
      </section>
      <section className="gallery" aria-label="Example projects">
        <h2>Or open a working example</h2>
        <div className="cards">
          {EXAMPLES.map((ex) => (
            <button key={ex.id} className="card" data-example={ex.id} onClick={() => useStore.getState().setProject(buildExample(ex.id), { record: false })}>
              <span className="card-meta">
                <span className="chip">{boardName(ex.board)}</span>
                <span className="level">{ex.level}</span>
              </span>
              <span className="card-title">{ex.title}</span>
              <span className="card-blurb">{ex.blurb}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
