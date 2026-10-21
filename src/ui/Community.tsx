// Community features on this Sparkbench server: the gallery (publish, browse, remix), classes
// (assignments graded in the simulator, teacher dashboard) and live sharing (edit together, comments).
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import type { Project } from '../core/types';

const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Request failed');
  return d;
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

export function GallerySection() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => {
    fetch('/api/gallery')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setEntries([]));
  }, []);
  if (!entries?.length) return null;
  return (
    <section className="gallery community" aria-label="Community gallery" data-testid="community-gallery">
      <h2>Made by people on this Sparkbench</h2>
      <div className="cards">
        {entries.slice(0, 12).map((e) => (
          <button key={e.id} className="card" onClick={() => openGallery(e.id)} data-gallery={e.id}>
            <span className="card-meta">
              <span className="chip">{e.board === 'none' ? 'No MCU' : e.board.toUpperCase()}</span>
              <span className="level">♥ {e.likes}{e.remixes ? ` · ${e.remixes} remix${e.remixes > 1 ? 'es' : ''}` : ''}</span>
            </span>
            <span className="card-title">{e.name}</span>
            <span className="card-blurb">{e.blurb || `${e.parts} parts`} — by {e.author}{e.remixOf ? `, remixed from ${e.remixOf.author}’s ${e.remixOf.name}` : ''}</span>
          </button>
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
  useStore.getState().addChat({ role: 'ai', text: `You opened **${d.entry.name}** by ${d.entry.author} from the gallery. This is your own copy: change anything you like, then publish your remix from the Sparkbench menu.` });
}

export function PublishDialog({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project)!;
  const [author, setAuthor] = useState(myName());
  const [blurb, setBlurb] = useState(project.summary ?? '');
  const [done, setDone] = useState<Entry | null>(null);
  const [error, setError] = useState('');
  return (
    <Modal title="Publish to the gallery" onClose={onClose}>
      {done ? (
        <div data-testid="publish-done">
          <p>Published! Everyone using this Sparkbench can now open, like and remix <strong>{done.name}</strong>.</p>
          <p className="muted">Link: <code>{link(`gallery=${done.id}`)}</code></p>
          <button onClick={onClose}>Done</button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              saveName(author);
              setDone(await post('/api/gallery', { project, author, blurb }));
            } catch (err: any) {
              setError(err.message);
            }
          }}
        >
          <label>Your name<input value={author} onChange={(e) => setAuthor(e.target.value)} required maxLength={40} /></label>
          <label>What is it? (one or two sentences)<textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={3} maxLength={300} /></label>
          {(project as any).remixOf && <p className="muted">It will say it’s a remix of {(project as any).remixOf.author}’s {(project as any).remixOf.name}.</p>}
          {error && <div className="banner error">{error}</div>}
          <button className="primary" type="submit" data-testid="publish-go">Publish</button>
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

export function TeachDialog({ onClose }: { onClose(): void }) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [reqs, setReqs] = useState('');
  const [teacher, setTeacher] = useState(myName());
  const [made, setMade] = useState<(Assignment & { teacherKey: string }) | null>(null);
  const [error, setError] = useState('');
  return (
    <Modal title="Set an assignment" onClose={onClose}>
      {made ? (
        <div data-testid="teach-done">
          <p>Students open Sparkbench and type the class code <strong className="class-code">{made.code}</strong> (or use the link below).</p>
          <p className="muted">Student link: <code>{link(`class=${made.code}`)}</code></p>
          <p>Your dashboard (keep this link private): <a href={link(`teach=${made.code}&key=${made.teacherKey}`)} data-testid="teach-dashboard-link">open the dashboard</a></p>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              saveName(teacher);
              setMade(await post('/api/class', { title, brief, teacher, requirements: reqs.split('\n').map((x) => x.trim()).filter(Boolean) }));
            } catch (err: any) {
              setError(err.message);
            }
          }}
        >
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Traffic light with a crossing button" /></label>
          <label>Brief<textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} placeholder="What should students build?" /></label>
          <label>
            What it must do (one per line: each becomes an automatic test)
            <textarea value={reqs} onChange={(e) => setReqs(e.target.value)} rows={4} required placeholder={'The red, yellow and green LEDs light in turn\nPressing the button turns the light red'} />
          </label>
          <label>Your name<input value={teacher} onChange={(e) => setTeacher(e.target.value)} maxLength={40} /></label>
          {error && <div className="banner error">{error}</div>}
          <button className="primary" type="submit" data-testid="teach-go">Create the class</button>
        </form>
      )}
    </Modal>
  );
}

/** Shown while a student is working on a class assignment (?class=CODE). */
export function ClassBanner() {
  const code = useStore((s) => s.classCode);
  const project = useStore((s) => s.project);
  const [a, setA] = useState<Assignment | null>(null);
  const [student, setStudent] = useState(myName());
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!code) return;
    fetch(`/api/class/${code}`)
      .then((r) => r.json().then((d) => (r.ok ? setA(d) : setError(d.error))))
      .catch((e) => setError(String(e)));
  }, [code]);
  if (!code) return null;
  return (
    <div className="class-banner" data-testid="class-banner">
      {error ? (
        <span>{error}</span>
      ) : !a ? (
        <span>Loading the assignment…</span>
      ) : (
        <>
          <div className="cb-main">
            <strong>Assignment: {a.title}</strong> <span className="muted">({a.teacher ? `${a.teacher}’s class ` : ''}{a.code})</span>
            {a.brief && <div>{a.brief}</div>}
            <ul>{a.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
          <div className="cb-submit">
            <input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Your name" aria-label="Your name" />
            <button
              className="primary"
              disabled={!project || !student.trim() || busy}
              data-testid="class-submit"
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  saveName(student);
                  const sub = await post(`/api/class/${a.code}/submit`, { student, project });
                  setGrade(sub.grade);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Checking your project… (about a minute)' : 'Hand it in'}
            </button>
            <button className="ghost" onClick={() => useStore.getState().set({ classCode: null })}>Leave class</button>
          </div>
          {grade && (
            <div className="cb-grade" data-testid="class-grade">
              <strong>{grade.score} of {grade.max} checks passed</strong> (your teacher sees this too)
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
  const load = () =>
    fetch(`/api/class/${code}/dashboard?key=${encodeURIComponent(teacherKey)}`)
      .then((r) => r.json().then((x) => (r.ok ? setD(x) : setError(x.error))))
      .catch((e) => setError(String(e)));
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="teacher" data-testid="teacher-dashboard">
      <header className="welcome-top"><span className="brand"><span>Sparkbench</span></span><a href={location.pathname}>Back to Sparkbench</a></header>
      {error && <div className="banner error">{error}</div>}
      {d && (
        <>
          <h1>{d.assignment.title}</h1>
          <p>Class code <strong className="class-code">{d.assignment.code}</strong> · {d.submissions.length} submission{d.submissions.length === 1 ? '' : 's'} (refreshes by itself)</p>
          <table className="bom teacher-table">
            <thead><tr><th>Student</th><th>Score</th>{d.assignment.requirements.map((r, i) => <th key={i} title={r}>{r.length > 28 ? `${r.slice(0, 26)}…` : r}</th>)}<th>Handed in</th><th /></tr></thead>
            <tbody>
              {d.submissions.map((s) => (
                <tr key={s.id} data-testid="teacher-row">
                  <td>{s.student}</td>
                  <td><strong>{s.grade.score}/{s.grade.max}</strong></td>
                  {d.assignment.requirements.map((r, i) => {
                    const it = s.grade.items.find((x) => x.label === r);
                    return <td key={i} title={it?.detail}>{it ? (it.pass ? '✓' : '✗') : '—'}</td>;
                  })}
                  <td>{new Date(s.submittedAt).toLocaleString()}</td>
                  <td>
                    <button
                      onClick={async () => {
                        const x = await fetch(`/api/class/${code}/submission?key=${encodeURIComponent(teacherKey)}&id=${s.id}`).then((r) => r.json());
                        history.replaceState(null, '', location.pathname);
                        useStore.getState().setProject({ ...x.project, id: `p${Date.now().toString(36)}`, name: `${s.student}: ${x.project.name}` }, { record: false });
                        useStore.getState().set({ teach: null });
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ live sharing
/** Join a shared room (?room=ID): stays in sync with everyone else editing it. */
const contentKey = (p: Project | null) => (p ? JSON.stringify([p.name, p.board, p.parts, p.wires, p.files, p.tests ?? null]) : '');

export function useLiveRoom() {
  const roomId = useStore((s) => s.room?.id);
  const project = useStore((s) => s.project);
  const applying = useRef(false);
  /** The design as the server last had it: changes equal to this are echoes, not edits. */
  const serverKey = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!roomId) return;
    const name = myName() || 'Someone';
    const es = new EventSource(`/api/room/${roomId}/events?name=${encodeURIComponent(name)}`);
    const apply = (p: Project, version: number) => {
      serverKey.current = contentKey(p);
      applying.current = true;
      useStore.getState().setProject(p, { record: false, keepSim: true });
      useStore.getState().set({ room: { ...useStore.getState().room!, version } });
      setTimeout(() => (applying.current = false), 0);
    };
    es.addEventListener('state', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      apply(d.project, d.version);
      useStore.getState().set({ room: { ...useStore.getState().room!, comments: d.comments } });
    });
    es.addEventListener('update', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      apply(d.project, d.version);
      useStore.getState().set({ room: { ...useStore.getState().room!, lastBy: d.by } });
    });
    es.addEventListener('people', (e) => useStore.getState().set({ room: { ...useStore.getState().room!, people: JSON.parse((e as MessageEvent).data) } }));
    es.addEventListener('comment', (e) => {
      const c = JSON.parse((e as MessageEvent).data);
      const r = useStore.getState().room!;
      useStore.getState().set({ room: { ...r, comments: [...(r.comments ?? []).filter((x) => x.id !== c.id), c] } });
    });
    es.onerror = () => useStore.getState().set({ room: { ...useStore.getState().room!, offline: true } });
    es.onopen = () => useStore.getState().set({ room: { ...useStore.getState().room!, offline: false } });
    return () => es.close();
  }, [roomId]);
  // Send my changes (debounced). A stale edit gets the latest version back instead of overwriting it.
  useEffect(() => {
    if (!roomId || !project || applying.current || contentKey(project) === serverKey.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const mine = useStore.getState().project!;
      if (contentKey(mine) === serverKey.current) return;
      let r = useStore.getState().room!;
      let res = await post(`/api/room/${roomId}/update`, { project: mine, version: r.version, by: myName() || 'Someone' }).catch(() => null);
      if (res && !res.ok && res.project) {
        // Someone saved first: put my edit on top of their version (last writer wins) and say so.
        res = await post(`/api/room/${roomId}/update`, { project: mine, version: res.version, by: myName() || 'Someone' }).catch(() => null);
        useStore.getState().set({ room: { ...useStore.getState().room!, conflict: true } });
      }
      if (res?.ok) {
        serverKey.current = contentKey(mine);
        r = useStore.getState().room!;
        useStore.getState().set({ room: { ...r, version: res.version } });
      }
    }, 500);
  }, [project]);
}

export async function startSharing() {
  const project = useStore.getState().project!;
  const { room } = await post('/api/room', { project });
  history.replaceState(null, '', `${location.pathname}?room=${room}`);
  useStore.getState().set({ room: { id: room, version: 1, people: [], comments: [] } });
  return link(`room=${room}`);
}

export function ShareBar() {
  const room = useStore((s) => s.room);
  const [copied, setCopied] = useState(false);
  if (!room) return null;
  return (
    <div className="share-bar" data-testid="share-bar">
      <span>
        Editing together{room.people?.length ? ` with ${room.people.filter((p) => p !== myName()).join(', ') || 'nobody else yet'}` : ''}
        {room.lastBy && room.lastBy !== myName() ? ` · last change by ${room.lastBy}` : ''}
        {room.offline ? ' · reconnecting…' : ''}
        {room.conflict ? ' · you and someone else edited at the same moment: your latest change was kept' : ''}
      </span>
      <button
        className="ghost"
        onClick={() => {
          navigator.clipboard?.writeText(link(`room=${room.id}`));
          setCopied(true);
        }}
      >
        {copied ? 'Link copied' : 'Copy invite link'}
      </button>
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
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await post(`/api/room/${room.id}/comment`, { target, text, by: myName() || 'Someone' });
          setText('');
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label={`Comment on ${label}`} />
      </form>
    </section>
  );
}

// ------------------------------------------------------------------ bits
function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
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
  return (
    <form
      className="join-class"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) useStore.getState().set({ classCode: code.trim().toUpperCase() });
      }}
    >
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Class code" aria-label="Class code" maxLength={10} />
      <button type="submit">Join a class</button>
      <button type="button" className="ghost" onClick={() => useStore.getState().set({ dialog: 'teach' })}>I’m a teacher</button>
    </form>
  );
}
