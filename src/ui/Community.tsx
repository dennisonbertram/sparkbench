// Community features on this Sparkbench server: the gallery (publish, browse, remix), classes
// (assignments graded in the simulator, teacher dashboard) and live sharing (edit together, comments).
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { useDialog } from './useDialog';
import type { Project } from '../core/types';
import { BOARDS } from '../core/boards';
import { mergeProjects } from '../core/merge';
import { CostHint } from './CostHint';

const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Request failed');
  return d;
};
const load = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const store = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const myName = () => {
  try {
    return localStorage.getItem('sb-name') ?? '';
  } catch {
    return '';
  }
};
const saveName = (n: string) => {
  try {
    localStorage.setItem('sb-name', n);
  } catch {}
};
const link = (q: string) => `${location.origin}${location.pathname}?${q}`;
const boardLabel = (b: string) => (b === 'none' ? 'No MCU' : BOARDS[b as 'esp32']?.short ?? b);

function CopyButton({ text, label = 'Copy link', testid }: { text: string; label?: string; testid?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ghost small"
      data-testid={testid}
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

// ------------------------------------------------------------------ gallery
interface Entry {
  id: string;
  name: string;
  author: string;
  blurb: string;
  board: string;
  parts: number;
  likes: number;
  remixes: number;
  remixOf?: { id: string; name: string; author: string };
}
/** Entries published from this browser, with the key that lets their author update or remove them. */
type Mine = Record<string, { editKey: string; projectId: string; name: string }>;
const myEntries = () => load<Mine>('sb-published', {});

export function GallerySection() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [liked, setLiked] = useState<string[]>(() => load('sb-liked', []));
  useEffect(() => {
    fetch('/api/gallery')
      .then((r) => r.json())
      .then((d) => {
        const seen = new Set<string>();
        setEntries((d.entries ?? []).filter((e: Entry) => !seen.has(e.id) && seen.add(e.id)));
      })
      .catch(() => setEntries([]));
  }, []);
  if (!entries?.length) return null;
  const like = async (e: Entry) => {
    if (liked.includes(e.id)) return;
    try {
      const up: Entry = await post(`/api/gallery/${e.id}/like`, {});
      setEntries((list) => list!.map((x) => (x.id === e.id ? { ...x, likes: up.likes } : x)));
      const next = [...liked, e.id];
      setLiked(next);
      store('sb-liked', next);
    } catch {}
  };
  return (
    <section className="gallery community" id="community" aria-label="Community gallery" data-testid="community-gallery">
      <h2>Made by people on this Sparkbench</h2>
      <div className="cards">
        {entries.slice(0, 12).map((e) => (
          <div key={e.id} className="card-wrap">
            <button className="card" onClick={() => openGallery(e.id)} data-gallery={e.id}>
              <span className="card-meta">
                <span className="chip">{boardLabel(e.board)}</span>
                <span className="level">{e.remixes ? `${e.remixes} remix${e.remixes > 1 ? 'es' : ''}` : ''}</span>
              </span>
              <span className="card-title">{e.name}</span>
              <span className="card-blurb">{e.blurb || `${e.parts} parts`} — by {e.author}{e.remixOf ? `, remixed from ${e.remixOf.author}’s ${e.remixOf.name}` : ''}</span>
            </button>
            <button
              className={`like${liked.includes(e.id) ? ' on' : ''}`}
              onClick={() => like(e)}
              aria-pressed={liked.includes(e.id)}
              aria-label={liked.includes(e.id) ? `You like ${e.name} (${e.likes} likes)` : `Like ${e.name} (${e.likes} likes)`}
              data-testid="gallery-like"
            >
              ♥ {e.likes}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Open a gallery project as your own copy (a remix that remembers where it came from). */
export async function openGallery(id: string) {
  const d = await fetch(`/api/gallery/${id}`).then((r) => r.json());
  const p: Project = d.project;
  useStore.getState().setProject({ ...p, id: `p${Date.now().toString(36)}`, ...({ remixOf: { id, name: d.entry.name, author: d.entry.author } } as any) });
  // Your copy is saved like any project: a reload reopens it (not the welcome page or a fresh copy).
  history.replaceState(null, '', location.pathname);
  useStore.getState().addChat({ role: 'ai', text: `You opened **${d.entry.name}** by ${d.entry.author} from the gallery. This is your own copy: change anything you like, then publish your remix from the Sparkbench menu.` });
}

const designKey = (p: Project) => JSON.stringify([p.board, p.parts.map((x) => [x.type, x.props]), p.wires.map((w) => [w.a, w.b]), p.files]);

export function PublishDialog({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)!;
  const remixOf = (project as any).remixOf as Entry['remixOf'];
  const earlier = Object.entries(myEntries()).find(([, m]) => m.projectId === project.id);
  const [author, setAuthor] = useState(myName());
  const [title, setTitle] = useState(earlier?.[1].name ?? (remixOf && myName() ? `${myName()}’s ${project.name}` : project.name));
  const [blurb, setBlurb] = useState(project.summary ?? '');
  const [update, setUpdate] = useState(!!earlier);
  const [unchanged, setUnchanged] = useState(false);
  const [done, setDone] = useState<Entry | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!remixOf) return;
    fetch(`/api/gallery/${remixOf.id}`)
      .then((r) => r.json())
      .then((d) => d.project && setUnchanged(designKey(d.project) === designKey(project)))
      .catch(() => {});
  }, []);
  return (
    <Modal title="Publish to the gallery" onClose={onClose}>
      {done ? (
        <div data-testid="publish-done">
          <p>Published! Everyone using this Sparkbench can now open, like and remix <strong>{done.name}</strong>.</p>
          <p className="muted">
            Link: <code>{link(`gallery=${done.id}`)}</code> <CopyButton text={link(`gallery=${done.id}`)} />
          </p>
          <button onClick={onClose} data-autofocus>Done</button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              saveName(author);
              const mine = myEntries();
              const res = await post('/api/gallery', { project, author, blurb, name: title, update: update && earlier ? { id: earlier[0], editKey: earlier[1].editKey } : undefined });
              mine[res.id] = { editKey: res.editKey, projectId: project.id, name: res.name };
              store('sb-published', mine);
              setDone(res);
            } catch (err: any) {
              setError(err.message);
            }
          }}
        >
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} data-testid="publish-title" /></label>
          <label>Your name<input value={author} onChange={(e) => setAuthor(e.target.value)} required maxLength={40} /></label>
          <label>What is it? (one or two sentences)<textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={3} maxLength={300} /></label>
          {remixOf && <p className="muted">It will say it’s a remix of {remixOf.author}’s {remixOf.name}.</p>}
          {unchanged && <div className="banner warn" data-testid="publish-unchanged">You haven’t changed anything from {remixOf!.author}’s original yet. Change something first, so your remix is worth opening.</div>}
          {earlier && (
            <label className="check">
              <input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} /> Update my earlier entry “{earlier[1].name}” instead of adding a new one
            </label>
          )}
          {error && <div className="banner error">{error}</div>}
          <div className="row">
            <button className="primary" type="submit" data-testid="publish-go">{update && earlier ? 'Update it' : 'Publish'}</button>
            {earlier && (
              <button
                type="button"
                className="ghost"
                onClick={async () => {
                  try {
                    await post(`/api/gallery/${earlier[0]}/delete`, { editKey: earlier[1].editKey });
                    const mine = myEntries();
                    delete mine[earlier[0]];
                    store('sb-published', mine);
                    onClose();
                  } catch (err: any) {
                    setError(err.message);
                  }
                }}
              >
                Take my entry down
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ classes
interface Assignment {
  code: string;
  title: string;
  brief: string;
  requirements: string[];
  teacher: string;
}
interface Grade {
  score: number;
  max: number;
  items: { label: string; pass: boolean; detail: string }[];
}
/** The two checks every submission gets on top of the teacher's requirements (see server/grading.ts). */
const BUILT_IN = [
  { label: 'The wiring passes the design checks', short: 'Design checks' },
  { label: 'The program runs without crashing', short: 'Program runs' },
];
/** Classes this browser created: the teacher can get back to each dashboard. */
type MyClass = { code: string; key: string; title: string; at: number };
const myClasses = () => load<MyClass[]>('sb-classes', []);
const rememberClass = (c: MyClass) => store('sb-classes', [c, ...myClasses().filter((x) => x.code !== c.code)].slice(0, 30));
const gradeTime = (n: number) => `about ${Math.max(1, Math.round((20 + n * 30) / 60))} min`;

export function TeachDialog({ onClose }: { onClose(): void }) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [reqs, setReqs] = useState('');
  const [teacher, setTeacher] = useState(myName());
  const [made, setMade] = useState<(Assignment & { teacherKey: string }) | null>(null);
  const [error, setError] = useState('');
  const dash = made ? link(`teach=${made.code}&key=${made.teacherKey}`) : '';
  return (
    <Modal title="Set an assignment" onClose={onClose}>
      {made ? (
        <div data-testid="teach-done">
          <p>Students open Sparkbench and type the class code <strong className="class-code">{made.code}</strong> (or use the link below).</p>
          <p className="muted">
            Student link: <code>{link(`class=${made.code}`)}</code> <CopyButton text={link(`class=${made.code}`)} />
          </p>
          <p>
            Your dashboard (keep this link private): <a href={dash} target="_blank" rel="noreferrer" data-testid="teach-dashboard-link">open the dashboard</a>{' '}
            <CopyButton text={dash} label="Copy dashboard link" testid="teach-copy" />
          </p>
          <p className="muted">This computer remembers it: find it later under <strong>My classes</strong> on the start page. On another computer you’ll need the dashboard link.</p>
          <button onClick={onClose}>Done</button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              saveName(teacher);
              const a = await post('/api/class', { title, brief, teacher, requirements: reqs.split('\n').map((x) => x.trim()).filter(Boolean) });
              rememberClass({ code: a.code, key: a.teacherKey, title: a.title, at: Date.now() });
              setMade(a);
            } catch (err: any) {
              setError(err.message);
            }
          }}
        >
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Traffic light with a crossing button" /></label>
          <label>Brief<textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} placeholder="What should students build? Say which board or example to start from." /></label>
          <label>
            What it must do (one per line: each becomes an automatic test)
            <textarea value={reqs} onChange={(e) => setReqs(e.target.value)} rows={4} required placeholder={'The red, yellow and green LEDs light in turn\nPressing the button turns the light red'} />
          </label>
          <label>Your name<input value={teacher} onChange={(e) => setTeacher(e.target.value)} maxLength={40} /></label>
          <p className="muted">Every hand-in also gets two automatic checks: the wiring passes the design checks, and the program runs.</p>
          {error && <div className="banner error">{error}</div>}
          <button className="primary" type="submit" data-testid="teach-go">Create the class</button>
        </form>
      )}
    </Modal>
  );
}

function openDashboard(code: string, key: string) {
  history.pushState(null, '', `${location.pathname}?teach=${code}&key=${encodeURIComponent(key)}`);
  useStore.getState().set({ teach: { code, key }, teachReturn: null });
}

/** Shown while a student is working on a class assignment (?class=CODE), or a teacher views a submission. */
export function ClassBanner() {
  const code = useStore((s) => s.classCode);
  const back = useStore((s) => s.teachReturn);
  const project = useStore((s) => s.project);
  const [a, setA] = useState<Assignment | null>(null);
  const [student, setStudent] = useState(myName());
  const [grade, setGrade] = useState<(Grade & { at?: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!code) return;
    setError('');
    setA(null);
    setGrade(load(`sb-grade-${code}`, null));
    fetch(`/api/class/${code}`)
      .then((r) => r.json().then((d) => (r.ok ? setA(d) : setError(d.error))))
      .catch((e) => setError(String(e)));
  }, [code]);
  if (back)
    return (
      <div className="class-banner" data-testid="teacher-return">
        <span className="cb-main">You’re looking at <strong>{back.student}</strong>’s submission. Changes here don’t change what they handed in.</span>
        <button className="primary" onClick={() => openDashboard(back.code, back.key)} data-testid="back-to-dashboard">Back to class dashboard</button>
      </div>
    );
  if (!code) return null;
  return (
    <div className="class-banner" data-testid="class-banner">
      {error && !a ? (
        <>
          <span className="cb-main">{error}</span>
          <button className="ghost" onClick={() => useStore.getState().set({ classCode: null })}>Close</button>
        </>
      ) : !a ? (
        <span>Loading the assignment…</span>
      ) : (
        <>
          <div className="cb-main">
            <strong>Assignment: {a.title}</strong> <span className="muted">({a.teacher ? `${a.teacher}’s class ` : ''}{a.code})</span>
            {a.brief && <div>{a.brief}</div>}
            <ul>{a.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
            {!project && <div className="cb-next" data-testid="class-next">Next: describe your design below or open an example, build it, then press <strong>Hand it in</strong>.</div>}
          </div>
          <div className="cb-submit">
            <input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Your name" aria-label="Your name" />
            <button
              className="primary"
              disabled={!project || !student.trim() || busy}
              title={!project ? 'Open or design your project first' : !student.trim() ? 'Type your name first' : undefined}
              data-testid="class-submit"
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  saveName(student);
                  const sub = await post(`/api/class/${a.code}/submit`, { student, project });
                  const g = { ...sub.grade, at: Date.now() };
                  setGrade(g);
                  store(`sb-grade-${a.code}`, g);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? `Checking your project… (${gradeTime(a.requirements.length)})` : grade ? 'Hand it in again' : 'Hand it in'}
            </button>
            <CostHint kind="grade" />
            <button className="ghost" onClick={() => useStore.getState().set({ classCode: null })}>Leave class</button>
          </div>
          {error && <div className="banner error cb-grade">{error}</div>}
          {grade && (
            <div className="cb-grade" data-testid="class-grade">
              <strong>{grade.score} of {grade.max} checks passed</strong> (your teacher sees this too{grade.at ? `; handed in ${new Date(grade.at).toLocaleString()}` : ''})
              <ul>{grade.items.map((g, i) => <li key={i} className={g.pass ? 'pass' : 'fail'}>{g.pass ? '✓' : '✗'} {g.label}{!g.pass && <span className="muted"> — {g.detail}</span>}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Teacher dashboard (?teach=CODE&key=KEY). */
export function TeacherDashboard({ code, teacherKey }: { code: string; teacherKey: string }) {
  const [d, setD] = useState<{ assignment: Assignment; submissions: { id: string; student: string; submittedAt: number; grade: Grade }[] } | null>(null);
  const [error, setError] = useState('');
  const fetchIt = () =>
    fetch(`/api/class/${code}/dashboard?key=${encodeURIComponent(teacherKey)}`)
      .then((r) => r.json().then((x) => (r.ok ? setD(x) : setError(x.error))))
      .catch((e) => setError(String(e)));
  useEffect(() => {
    fetchIt();
    const t = setInterval(fetchIt, 10000);
    return () => clearInterval(t);
  }, [code, teacherKey]);
  useEffect(() => {
    if (d) rememberClass({ code, key: teacherKey, title: d.assignment.title, at: Date.now() });
  }, [d?.assignment.title]);
  const cols = d ? [...BUILT_IN.map((b) => ({ label: b.label, head: b.short })), ...d.assignment.requirements.map((r) => ({ label: r, head: r }))] : [];
  return (
    <div className="teacher" data-testid="teacher-dashboard">
      <header className="welcome-top">
        <span className="brand">
          <TinyLogo /> <span>Sparkbench</span>
        </span>
        <button
          className="ghost"
          onClick={() => {
            history.replaceState(null, '', location.pathname);
            useStore.getState().set({ teach: null });
          }}
        >
          Back to Sparkbench
        </button>
      </header>
      {error && <div className="banner error">{error}</div>}
      {d && (
        <>
          <h1>{d.assignment.title}</h1>
          <p>
            Class code <strong className="class-code">{d.assignment.code}</strong> · {d.submissions.length} hand-in{d.submissions.length === 1 ? '' : 's'} (this page refreshes by itself)
          </p>
          {d.submissions.length === 0 ? (
            <div className="empty-state" data-testid="teacher-empty">
              No students have handed in yet. Give them the class code <strong>{d.assignment.code}</strong> or this link: <code>{link(`class=${d.assignment.code}`)}</code> <CopyButton text={link(`class=${d.assignment.code}`)} />
            </div>
          ) : (
            <div className="table-scroll">
              <table className="bom teacher-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Score</th>
                    {cols.map((c, i) => <th key={i} title={c.label}>{c.head}</th>)}
                    <th>Handed in</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.submissions.map((s) => (
                    <tr key={s.id} data-testid="teacher-row">
                      <td>{s.student}</td>
                      <td><strong>{s.grade.score}/{s.grade.max}</strong></td>
                      {cols.map((c, i) => {
                        const it = s.grade.items.find((x) => x.label === c.label);
                        return <td key={i} title={it?.detail}>{it ? (it.pass ? '✓' : '✗') : '—'}</td>;
                      })}
                      <td>{new Date(s.submittedAt).toLocaleString()}</td>
                      <td>
                        <button
                          onClick={async () => {
                            const x = await fetch(`/api/class/${code}/submission?key=${encodeURIComponent(teacherKey)}&id=${s.id}`).then((r) => r.json());
                            history.pushState(null, '', location.pathname);
                            useStore.getState().set({ tourStep: null });
                            useStore.getState().setProject({ ...x.project, id: `p${Date.now().toString(36)}`, name: `${s.student}: ${x.project.name}` }, { record: false });
                            useStore.getState().set({ teach: null, teachReturn: { code, key: teacherKey, student: s.student } });
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">Hover a ✓ or ✗ to see what the test found. “Design checks” and “Program runs” are checked for every hand-in, on top of your requirements.</p>
        </>
      )}
    </div>
  );
}

function TinyLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="var(--mat, #2e7d32)" />
      <path d="M13 4 7 13h4l-1 7 6-9h-4z" fill="#fff" />
    </svg>
  );
}

// ------------------------------------------------------------------ live sharing
/** Join a shared room (?room=ID): stays in sync with everyone else editing it. */
const contentKey = (p: Project | null) => (p ? JSON.stringify([p.name, p.board, p.parts, p.wires, p.files, p.tests ?? null, p.revision ?? null, p.revisions ?? null]) : '');

type RoomState = NonNullable<ReturnType<typeof useStore.getState>['room']>;
const roomSet = (patch: Partial<RoomState> & { justStarted?: boolean }) => {
  const r = useStore.getState().room;
  if (r) useStore.getState().set({ room: { ...r, ...patch } });
};

export function useLiveRoom() {
  const roomId = useStore((s) => s.room?.id);
  const project = useStore((s) => s.project);
  const applying = useRef(false);
  /** The design as the server last had it: my unsent edits are the difference from this. */
  const base = useRef<Project | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const sending = useRef(false);

  const applyLocal = (p: Project) => {
    const cur = useStore.getState().project;
    if (contentKey(p) === contentKey(cur)) return;
    applying.current = true;
    useStore.getState().setProject(p, { record: false, keepSim: true, remote: !!cur && cur.id === p.id });
    setTimeout(() => (applying.current = false), 0);
  };
  const send = async () => {
    if (!roomId || sending.current) return;
    sending.current = true;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const mine = useStore.getState().project;
        if (!mine || contentKey(mine) === contentKey(base.current)) return;
        const r = useStore.getState().room!;
        const res = await post(`/api/room/${roomId}/update`, { project: mine, version: r.version, by: myName() || 'Someone' }).catch(() => null);
        if (!res) return;
        if (res.ok) {
          base.current = mine;
          roomSet({ version: res.version });
          continue; // anything edited while this was sending goes next
        }
        if (!res.project) return;
        // Someone saved first: put my changes on top of theirs, part by part, then try again.
        const m = mergeProjects(base.current ?? res.project, useStore.getState().project!, res.project, 'ours');
        base.current = res.project;
        roomSet({ version: res.version, ...(m.clashes.length ? { conflict: `You and someone else changed ${m.clashes.join(', ')} at the same moment: your change was kept, theirs was replaced.` } : {}) });
        applyLocal(m.project);
      }
    } finally {
      sending.current = false;
    }
  };

  useEffect(() => {
    if (!roomId) return;
    const name = myName() || 'Someone';
    const es = new EventSource(`/api/room/${roomId}/events?name=${encodeURIComponent(name)}`);
    const incoming = (theirs: Project, version: number, by?: string) => {
      const mine = useStore.getState().project;
      let next = theirs;
      if (mine && base.current && mine.id === theirs.id && contentKey(mine) !== contentKey(base.current)) {
        // I have edits the server hasn't got yet: keep them on top of the incoming version.
        const m = mergeProjects(base.current, mine, theirs, 'ours');
        next = m.project;
        if (m.clashes.length && by && by !== name) roomSet({ conflict: `You and ${by} changed ${m.clashes.join(', ')} at the same moment: your change was kept, ${by}’s was replaced.` });
      }
      base.current = theirs;
      applyLocal(next);
      roomSet({ version: Math.max(version, useStore.getState().room?.version ?? 0) });
      if (contentKey(next) !== contentKey(theirs)) {
        clearTimeout(timer.current);
        timer.current = setTimeout(send, 300);
      }
    };
    es.addEventListener('state', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      base.current = null;
      incoming(d.project, d.version);
      roomSet({ comments: d.comments });
    });
    es.addEventListener('update', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      incoming(d.project, d.version, d.by);
      if (d.by !== name) roomSet({ lastBy: d.by });
    });
    es.addEventListener('people', (e) => roomSet({ people: JSON.parse((e as MessageEvent).data) }));
    es.addEventListener('comment', (e) => {
      const c = JSON.parse((e as MessageEvent).data);
      const r = useStore.getState().room!;
      const fresh = !(r.comments ?? []).some((x) => x.id === c.id);
      roomSet({ comments: [...(r.comments ?? []).filter((x) => x.id !== c.id), c], ...(fresh && c.by !== name ? { unread: (r.unread ?? 0) + 1 } : {}) });
    });
    es.onerror = () => roomSet({ offline: true });
    es.onopen = () => roomSet({ offline: false });
    return () => es.close();
  }, [roomId]);
  // Send my changes (debounced).
  useEffect(() => {
    if (!roomId || !project || applying.current || contentKey(project) === contentKey(base.current)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(send, 500);
  }, [project]);
}

export async function startSharing() {
  const project = useStore.getState().project!;
  const { room } = await post('/api/room', { project });
  history.replaceState(null, '', `${location.pathname}?room=${room}`);
  const url = link(`room=${room}`);
  navigator.clipboard?.writeText(url).catch(() => {});
  useStore.getState().set({ room: { id: room, version: 1, people: [], comments: [], justStarted: true } as RoomState });
  return url;
}

function stopSharing() {
  history.replaceState(null, '', location.pathname);
  // Keep a copy of the shared design as my own project, so leaving never loses work.
  const p = useStore.getState().project;
  useStore.getState().set({ room: null });
  if (p) useStore.getState().setProject({ ...p, id: `p${Date.now().toString(36)}` }, { record: false, keepSim: true });
}

export function ShareBar() {
  const room = useStore((s) => s.room) as (RoomState & { justStarted?: boolean }) | null;
  const project = useStore((s) => s.project);
  const [copied, setCopied] = useState(false);
  const [showComments, setShowComments] = useState(false);
  if (!room) return null;
  const others = (room.people ?? []).filter((p) => p !== myName());
  const comments = room.comments ?? [];
  const partName = (id: string) => {
    const p = project?.parts.find((x) => x.id === id);
    return p ? p.ref ?? p.label ?? p.id : 'the design';
  };
  const latest = comments[comments.length - 1];
  return (
    <div className="share-bar" data-testid="share-bar">
      <span role="status">
        {room.justStarted && !copied ? 'Invite link copied: send it to a friend to edit together. ' : ''}
        Editing together{` with ${others.join(', ') || 'nobody else yet'}`}
        {room.lastBy && room.lastBy !== myName() ? ` · last change by ${room.lastBy}` : ''}
        {room.offline ? ' · reconnecting…' : ''}
      </span>
      {room.conflict && (
        <span className="share-conflict" role="alert" data-testid="share-conflict">
          {room.conflict} <button className="ghost small" onClick={() => roomSet({ conflict: undefined })}>OK</button>
        </span>
      )}
      {room.unread && latest ? (
        <span className="share-new" role="status" data-testid="comment-notice">
          💬 {latest.by} on {partName(latest.target)}: “{latest.text.slice(0, 60)}”
        </span>
      ) : null}
      <button
        className="ghost"
        aria-expanded={showComments}
        data-testid="share-comments"
        onClick={() => {
          setShowComments(!showComments);
          roomSet({ unread: 0 });
        }}
      >
        Comments ({comments.length}){room.unread ? ` · ${room.unread} new` : ''}
      </button>
      <button
        className="ghost"
        onClick={() => {
          navigator.clipboard?.writeText(link(`room=${room.id}`));
          setCopied(true);
          roomSet({ justStarted: false });
        }}
      >
        {copied ? 'Link copied' : 'Copy invite link'}
      </button>
      <button className="ghost" onClick={stopSharing} data-testid="share-stop">Stop sharing</button>
      {showComments && (
        <div className="share-comments" data-testid="share-comment-list">
          {comments.length ? (
            <ul>
              {comments.map((c) => (
                <li key={c.id}>
                  <button
                    className="link"
                    onClick={() => {
                      if (project?.parts.some((p) => p.id === c.target)) {
                        useStore.getState().set({ tab: 'breadboard' });
                        useStore.getState().select({ kind: 'part', id: c.target });
                      }
                      setShowComments(false);
                    }}
                  >
                    {partName(c.target)}
                  </button>{' '}
                  <strong>{c.by}</strong>: {c.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No comments yet. Click a part, then write a comment under its details.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Comments on the selected part (live sharing). */
export function CommentsPanel({ target, label }: { target: string; label: string }) {
  const room = useStore((s) => s.room);
  const [text, setText] = useState('');
  if (!room) return null;
  const list = (room.comments ?? []).filter((c) => c.target === target);
  return (
    <section className="comments" data-testid="comments">
      <h3>Comments on {label}</h3>
      {list.length ? (
        <ul>{list.map((c) => <li key={c.id}><strong>{c.by}</strong>: {c.text}</li>)}</ul>
      ) : (
        <p className="muted">No comments yet.</p>
      )}
      <form
        className="comment-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await post(`/api/room/${room.id}/comment`, { target, text, by: myName() || 'Someone' });
          setText('');
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label={`Comment on ${label}`} />
        <button type="submit" disabled={!text.trim()}>Send</button>
      </form>
    </section>
  );
}

// ------------------------------------------------------------------ bits
function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="panel-head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function JoinClass() {
  const [code, setCode] = useState('');
  const [hint, setHint] = useState('');
  const classes = myClasses();
  return (
    <>
      <form
        className="join-class"
        onSubmit={(e) => {
          e.preventDefault();
          if (!code.trim()) return setHint('Type the class code your teacher gave you.');
          setHint('');
          useStore.getState().set({ classCode: code.trim().toUpperCase() });
        }}
      >
        <input value={code} onChange={(e) => (setCode(e.target.value), setHint(''))} placeholder="Class code" aria-label="Class code" maxLength={10} />
        <button type="submit">Join a class</button>
        <button type="button" className="ghost" onClick={() => useStore.getState().set({ dialog: 'teach' })}>I’m a teacher</button>
        {hint && <span className="join-hint" role="alert">{hint}</span>}
      </form>
      {classes.length > 0 && (
        <div className="my-classes" data-testid="my-classes">
          My classes:{' '}
          {classes.slice(0, 6).map((c, i) => (
            <React.Fragment key={c.code}>
              {i > 0 && ', '}
              <button className="link" onClick={() => openDashboard(c.code, c.key)}>{c.title} ({c.code})</button>
            </React.Fragment>
          ))}
        </div>
      )}
    </>
  );
}
