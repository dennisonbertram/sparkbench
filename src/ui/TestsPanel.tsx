// Tests tab: the project's acceptance tests ("press SW1 → D1 lights", "dry soil → screen says Water
// me"), run in the simulator after every change, with a pass/fail badge on the tab.
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { sendPrompt } from './copilot';
import type { AcceptanceTest, TestResult } from '../core/acceptance';
import type { Project } from '../core/types';

const keyOf = (p: Project) => JSON.stringify([p.files, p.parts.map((x) => [x.id, x.type, x.props]), p.wires.map((w) => [w.a, w.b]), p.tests]);

let timer: ReturnType<typeof setTimeout> | undefined;

/** Re-run the tests (debounced) whenever the design, code or tests change. */
export function useTestRunner() {
  const project = useStore((s) => s.project);
  const key = useMemo(() => (project ? keyOf(project) : ''), [project]);
  useEffect(() => {
    if (!project) return;
    const st = useStore.getState();
    if (st.testRun?.key === key && !st.testRun.error) return;
    clearTimeout(timer);
    useStore.getState().set({ testRun: { key, running: true, results: st.testRun?.results ?? [] } });
    timer = setTimeout(async () => {
      try {
        const r = await fetch('/api/tests/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'Could not run the tests');
        if (useStore.getState().testRun?.key === key) useStore.getState().set({ testRun: { key, running: false, results: d.results } });
      } catch (e: any) {
        useStore.getState().set({ testRun: { key, running: false, results: [], error: e.message ?? String(e) } });
      }
    }, 1200);
  }, [key]);
}

export function TestsBadge() {
  const run = useStore((s) => s.testRun);
  if (!run) return null;
  if (run.running) return <span className="count info" title="Running the tests in the simulator">…</span>;
  if (run.error || !run.results.length) return null;
  const failed = run.results.filter((r) => !r.pass).length;
  return failed ? <span className="count err">{failed}</span> : <span className="count ok">{run.results.length} ✓</span>;
}

const SOURCE: Record<string, string> = { auto: 'Sparkbench', ai: 'From your request', user: 'Yours' };

export function TestsPanel() {
  const project = useStore((s) => s.project)!;
  const run = useStore((s) => s.testRun);
  const ai = useStore((s) => s.aiStatus);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const sourceOf = (r: TestResult) => project.tests?.find((t) => t.id === r.id)?.source ?? 'auto';

  async function add() {
    if (!text.trim()) return;
    setAdding(true);
    setError('');
    try {
      const r = await fetch('/api/ai/tests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, text }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not write that test');
      const tests: AcceptanceTest[] = d.tests;
      if (!tests.length) throw new Error("I couldn't turn that into a test. Try naming a part and what should happen, e.g. \"press SW1 and D1 lights up\".");
      useStore.getState().update((p) => ({ ...p, tests: [...(p.tests ?? []), ...tests] }));
      setText('');
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setAdding(false);
    }
  }

  const remove = (id: string) => useStore.getState().update((p) => ({ ...p, tests: (p.tests ?? []).filter((t) => t.id !== id) }));
  const failing = run?.results.filter((r) => !r.pass) ?? [];

  return (
    <div className="tests" data-testid="tests">
      <p className="tests-intro">
        Each test checks one thing your project should do, by running it in the simulator: pressing buttons, moving sensor sliders, and reading the screen, LEDs and serial output. They run again after every change.
        {run?.running && <span className="muted"> Running…</span>}
      </p>
      {run?.error && <div className="problem error">The tests couldn't run: {run.error}</div>}
      <ul className="test-list">
        {(run?.results ?? []).map((r) => (
          <li key={r.id} className={r.pass ? 'pass' : 'fail'} data-testid="test-result">
            <span className="mark" aria-label={r.pass ? 'passes' : 'fails'}>{r.pass ? '✓' : '✗'}</span>
            <span className="t-title">{r.title}</span>
            <span className="t-source">{SOURCE[sourceOf(r)]}</span>
            {sourceOf(r) !== 'auto' && (
              <button className="link" onClick={() => remove(r.id)} aria-label={`Delete test: ${r.title}`}>Delete</button>
            )}
            {!r.pass && <div className="t-detail">{r.detail}</div>}
          </li>
        ))}
      </ul>
      {failing.length > 0 && ai.enabled && (
        <button className="primary" onClick={() => sendPrompt(`Change the program so these tests pass:\n${failing.map((f) => `- ${f.title} (${f.detail})`).join('\n')}`)}>
          Fix the code with AI
        </button>
      )}
      <form
        className="test-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={ai.enabled ? 'Add a test in plain words, e.g. "when I press SW1 the buzzer beeps"' : 'Adding tests in plain words needs Claude'} disabled={!ai.enabled || adding} aria-label="Describe a new test" />
        <button type="submit" disabled={!ai.enabled || adding || !text.trim()}>{adding ? 'Writing the test…' : 'Add test'}</button>
      </form>
      {error && <div className="problem error">{error}</div>}
    </div>
  );
}
