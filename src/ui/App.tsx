import React, { useEffect, useRef, useState } from 'react';
import { useStore, listSaved, loadCurrent, deleteSaved, type Tab } from './store';
import { Breadboard } from './Breadboard';
import { Copilot, Inspector, Console, PartLibrary } from './panels';
import { SchematicView, CodeView, BomView, MarkdownView } from './views';
import { startSim, stopSim, setSpeed, simSupported } from './simClient';
import { sendPrompt, cancelDesign } from './copilot';
import { EXAMPLES, buildExample } from '../core/examples';
import { downloadZip, download, slug } from './exporters';
import { audio } from './audio';
import { Tour } from './Tour';
import { PcbView } from './PcbView';
import { useTestRunner } from './TestsPanel';
import { useMenu, fitMenu } from './useDialog';
import { BoardPanel } from './BoardPanel';
import { AttachImages } from './Attach';
import { QuestionsCard } from './Requirements';
import { GallerySection, PublishDialog, TeachDialog, ClassBanner, TeacherDashboard, ShareBar, JoinClass, useLiveRoom, openGallery, startSharing } from './Community';
import type { Shrunk } from './images';
import { BOARDS } from '../core/boards';
import type { Project } from '../core/types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'breadboard', label: 'Wiring' },
  { id: 'schematic', label: 'Schematic' },
  { id: 'code', label: 'Code' },
  { id: 'bom', label: 'Parts list' },
  { id: 'guide', label: 'Build guide' },
  { id: 'pcb', label: 'Circuit board' },
  { id: 'blog', label: 'Blog post' },
];

export function App() {
  const project = useStore((s) => s.project);
  const tab = useStore((s) => s.tab);
  const tourStep = useStore((s) => s.tourStep);
  const boardPanel = useStore((s) => s.boardPanel);
  const dialog = useStore((s) => s.dialog);
  const teach = useStore((s) => s.teach);
  useTestRunner();
  useLiveRoom();

  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && useStore.getState().set({ aiStatus: { enabled: !!d.ai?.enabled, model: d.ai?.model, via: d.ai?.via, kicad: d.kicad, ngspice: d.ngspice, pcb: d.pcb } }))
      .catch(() => {});
    const p = loadCurrent();
    const url = new URL(location.href);
    const cls = url.searchParams.get('class');
    if (cls) useStore.getState().set({ classCode: cls.toUpperCase() });
    const teach = url.searchParams.get('teach');
    if (teach && url.searchParams.get('key')) useStore.getState().set({ teach: { code: teach.toUpperCase(), key: url.searchParams.get('key')! } });
    const room = url.searchParams.get('room');
    if (room) useStore.getState().set({ room: { id: room, version: 0, people: [], comments: [] } });
    const gal = url.searchParams.get('gallery');
    if (gal) openGallery(gal).catch(() => {});
    const ex = url.searchParams.get('example');
    if (ex && EXAMPLES.some((e) => e.id === ex)) {
      useStore.getState().setProject(buildExample(ex), { record: false });
      // Drop ?example= so a reload reopens this (possibly edited) project and its chat, not a fresh copy.
      url.searchParams.delete('example');
      history.replaceState(null, '', url.toString());
    }
    else if (p && !url.searchParams.has('welcome')) useStore.getState().setProject(p, { record: false });
  }, []);

  // First project ever opened: offer the guided tour.
  useEffect(() => {
    if (!project) return;
    try {
      const q = new URL(location.href).searchParams;
      // Not when arriving through a shared room, a class or a teacher's link: the design is someone else's.
      const visiting = ['notour', 'room', 'class', 'teach', 'gallery'].some((k) => q.has(k)) || !!useStore.getState().room || !!useStore.getState().classCode;
      // A design Claude just made: let them read the result first; the reply offers the tour instead.
      const justDesigned = useStore.getState().chat.some((m) => m.role === 'ai' && !m.pending && m.requirements);
      if (!localStorage.getItem('sparkbench.tour.done') && !visiting && !justDesigned) setTimeout(() => !useStore.getState().room && useStore.getState().set({ tourStep: 0 }), 600);
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

  useEffect(() => {
    document.querySelector('.tabs [aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab, !!project]);

  if (teach) return <TeacherDashboard code={teach.code} teacherKey={teach.key} />;
  const dialogs = (
    <>
      {dialog === 'publish' && <PublishDialog onClose={() => useStore.getState().set({ dialog: null })} />}
      {dialog === 'teach' && <TeachDialog onClose={() => useStore.getState().set({ dialog: null })} />}
    </>
  );
  if (!project)
    return (
      <>
        <Welcome />
        {dialogs}
      </>
    );
  return (
    <div className="app">
      <Topbar />
      <ClassBanner />
      <ShareBar />
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
            {tab === 'pcb' && <PcbView />}
            {tab === 'blog' && <MarkdownView kind="blog" />}
          </div>
          <Console />
        </section>
        <Inspector />
      </div>
      {dialogs}
      {boardPanel && <BoardPanel onClose={() => useStore.getState().set({ boardPanel: false })} />}
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
  const projectsRef = useMenu<HTMLDivElement>(menu === 'projects', () => setMenu(null));
  const exportRef = useMenu<HTMLDivElement>(menu === 'export', () => setMenu(null));
  const running = status === 'running' || status === 'booting';
  const board = project.board === 'none' ? 'No microcontroller' : BOARDS[project.board].name;
  return (
    <header className="topbar">
      <div className="menu-anchor brand-anchor" ref={projectsRef}>
        <button className="brand" onClick={() => setMenu(menu === 'projects' ? null : 'projects')} title="Projects: new, open, share" aria-haspopup="menu" aria-expanded={menu === 'projects'}>
          <Logo />
          <span>Sparkbench</span>
          <span className="brand-caret">Projects ▾</span>
        </button>
        {menu === 'projects' && <ProjectsMenu onClose={() => setMenu(null)} />}
      </div>
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
          ♪<span className="sound-label"> {sound ? 'Sound on' : 'Sound off'}</span>
        </button>
        <span className={`status status-${status}`}>{statusText(status)}</span>
      </div>
      <span className="spacer" />
      <button className="ghost" onClick={() => useStore.getState().undo()} disabled={!past} title="Undo (⌘Z)" aria-label="Undo">
        <span aria-hidden>↶</span>
        <span className="undo-label"> Undo</span>
      </button>
      <button className="ghost" onClick={() => useStore.getState().redo()} disabled={!future} title="Redo (⇧⌘Z)" aria-label="Redo">
        <span aria-hidden>↷</span>
        <span className="undo-label"> Redo</span>
      </button>
      <button className="ghost" onClick={() => useStore.getState().set({ tourStep: 0 })}>
        Tour
      </button>
      <button className="board-btn" onClick={() => useStore.getState().set({ boardPanel: !useStore.getState().boardPanel })} data-testid="board-open" data-tour="board" title="Program and test the real hardware over USB">
        Your board
      </button>
      <div className="menu-anchor" ref={exportRef}>
        <button className="primary" onClick={() => setMenu(menu === 'export' ? null : 'export')} data-tour="export" aria-haspopup="menu" aria-expanded={menu === 'export'}>
          Export
        </button>
        {menu === 'export' && (
          <div className="menu" role="menu" ref={fitMenu}>
            <button role="menuitem" onClick={() => downloadZip(project).then(() => setMenu(null))}>Everything (.zip)</button>
            <button role="menuitem" onClick={() => (download(`${slug(project.name)}.sparkbench.json`, JSON.stringify(project, null, 2), 'application/json'), setMenu(null))}>Project file (.json)</button>
            <div className="menu-note">KiCad, SPICE, BOM and docs are also on their own tabs.</div>
          </div>
        )}
      </div>
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
    <div className="menu projects-menu" role="menu" ref={fitMenu}>
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
      <div className="menu-sep">Share</div>
      <button onClick={() => (useStore.getState().set({ dialog: 'publish' }), onClose())} data-testid="menu-publish">Publish to the gallery…</button>
      <button
        data-testid="menu-share"
        onClick={async () => {
          const url = await startSharing();
          navigator.clipboard?.writeText(url).catch(() => {});
          onClose();
        }}
      >
        Edit together (copy a live link)
      </button>
      <button onClick={() => (useStore.getState().set({ dialog: 'teach' }), onClose())}>Set a class assignment…</button>
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

const PHASES = [
  { id: 'read', label: 'Reading your idea and choosing parts' },
  { id: 'wire', label: 'Assigning pins and wiring' },
  { id: 'code', label: 'Writing the program' },
  { id: 'tests', label: 'Writing tests and checking it in the simulator' },
  { id: 'fix', label: 'Fixing what the tests found' },
] as const;

/** The waiting screen while Claude designs: real phases streamed from the server, elapsed time and Cancel. */
function Designing({ text, status }: { text: string; status: string }) {
  const [t, setT] = useState(0);
  const phase = useStore((s) => s.designPhase);
  const seen = useRef(new Set<string>());
  if (phase) seen.current.add(phase);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const at = PHASES.findIndex((p) => p.id === phase);
  const shown = PHASES.filter((p) => p.id !== 'fix' || seen.current.has('fix'));
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
          {shown.map((p) => {
            const i = PHASES.findIndex((x) => x.id === p.id);
            const cls = p.id === phase ? 'now' : seen.current.has(p.id) ? 'done' : at > i ? 'skip' : '';
            return (
              <li key={p.id} className={cls}>
                {p.label}
                {cls === 'skip' && <span className="muted"> (not needed)</span>}
              </li>
            );
          })}
        </ol>
        <p className="hero-hint">
          {t < 60
            ? `${t} s — most designs take 30–90 seconds.`
            : `${t} s — still working. Designs with custom code and tests can take 2–3 minutes; this is normal.`}
        </p>
        <button className="ghost" onClick={cancelDesign} data-testid="design-cancel">
          Cancel
        </button>
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

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const isTouch = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

function Welcome() {
  const [text, setText] = useState('');
  const [images, setImages] = useState<Shrunk[]>([]);
  const busy = useStore((s) => s.busy);
  const chat = useStore((s) => s.chat);
  const lastAi = [...chat].reverse().find((m) => m.role === 'ai' && !m.pending);
  const [community, setCommunity] = useState(0);
  useEffect(() => {
    fetch('/api/gallery')
      .then((r) => r.json())
      .then((d) => setCommunity(d.entries?.length ?? 0))
      .catch(() => {});
  }, []);
  if (busy) return <Designing text={useStore.getState().chat.find((m) => m.role === 'user')?.text ?? ''} status={busy} />;
  const saved = listSaved();
  const go = () => (text.trim() || images.length) && sendPrompt(text, images);
  const boardName = (b: string) => (b === 'none' ? 'No MCU' : BOARDS[b as 'esp32'].short);
  return (
    <div className="welcome">
      <ClassBanner />
      <header className="welcome-top">
        <span className="brand">
          <Logo /> <span>Sparkbench</span>
        </span>
        <nav className="welcome-nav">
          <a href="#examples">Examples</a>
          {community > 0 && <a href="#community">Community projects ({community})</a>}
          {saved.length > 0 && (
            <button className="ghost" onClick={() => useStore.getState().setProject(saved[0], { record: false })}>
              Continue “{saved[0].name}”
            </button>
          )}
        </nav>
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
            autoFocus={!isTouch()}
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
          <button className="primary big" type="submit" disabled={(!text.trim() && !images.length) || !!busy}>
            Design it
          </button>
        </form>
        <div className="hero-attach">
          <AttachImages images={images} onChange={setImages} label="Or start from a photo or sketch of a gadget" />
        </div>
        {lastAi && (
          <div className="hero-reply" role="status">
            <b>Copilot:</b> {lastAi.text}
            {lastAi.questions && <QuestionsCard questions={lastAi.questions} />}
          </div>
        )}
        <p className="hero-hint">Works with ESP32, Raspberry Pi Pico, Raspberry Pi 4, or plain components (555 timers, transistors).</p>
        <JoinClass />
      </section>
      <section className="gallery" id="examples" aria-label="Example projects">
        <h2>Or open a working example</h2>
        <div className="cards">
          {[...EXAMPLES].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)).map((ex) => (
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
      <GallerySection />
    </div>
  );
}
