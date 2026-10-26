// AI pair-programmer for the Code tab: ask for a change in plain words, review the diff,
// accept it. The server runs the new code in the simulator (and lets Claude fix crashes)
// before you ever see it.
import React, { useState } from 'react';
import { useStore } from './store';
import { ApprovalCard, Button, Composer, ComposerError, LoadingState, SuccessPop, ToolCallList } from './ds';
import { startSim } from './simClient';
import { getEditorSelection } from './CodeEditor';
import type { Project } from '../core/types';

interface Proposal {
  file: string;
  before: string;
  after: string;
  reply: string;
  log: string[];
  ok: boolean;
  behavior?: Project['behavior'];
  instruction: string;
}

export function CodeAssistant({ file }: { file: string }) {
  const ai = useStore((s) => s.aiStatus);
  const err = useStore((s) => s.sim.error);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  const ask = async (instruction: string, withError?: string) => {
    const project = useStore.getState().project!;
    setBusy(true);
    setError(null);
    setProposal(null);
    setAccepted(null);
    try {
      const selection = getEditorSelection();
      const res = await fetch('/api/ai/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, file, instruction, error: withError, selection: selection || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI request failed');
      const after = (data.project as Project).files[file];
      setProposal({ file, before: project.files[file], after, reply: data.reply, log: data.log ?? [], ok: data.ok, behavior: (data.project as Project).behavior, instruction });
      setText('');
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!ai.enabled)
    return (
      <div className="code-assistant off">
        AI code editing needs Claude. Start Sparkbench with <code>ANTHROPIC_API_KEY</code> set, or install and log in to Claude Code on this computer.
      </div>
    );

  return (
    <div className="code-assistant" data-testid="code-assistant">
      {err && err.file === file && !busy && !proposal && (
        <Button className="fix-ai" onClick={() => ask('The program crashes. Find and fix the bug, and explain it simply.', err.raw)}>
          Fix this crash with AI
        </Button>
      )}
      {proposal && (
        <ProposalView
          p={proposal}
          onDone={(ok) => {
            setProposal(null);
            if (ok) setAccepted(proposal.instruction);
          }}
        />
      )}
      {accepted && !busy && <SuccessPop label={`Applied to ${file}. Running it now.`} />}
      {accepted && !busy && <AfterAccept instruction={accepted} onClose={() => setAccepted(null)} />}
      {busy && <LoadingState label={`Claude is editing ${file} and trying it in the simulator`} detail="Usually about a minute." slowAfterMs={60_000} slowHint="Taking longer than usual, still working." />}
      <Composer
        className="assistant-form"
        label="Ask the AI to change this file"
        sendLabel="Ask AI"
        value={text}
        onChange={setText}
        onSend={() => ask(text.trim())}
        busy={busy}
        disabled={busy}
        placeholder={busy ? '' : `Ask AI to change ${file}… e.g. “make the LED blink twice as fast” or “show the temperature in Fahrenheit”. Select code first to focus on it.`}
        error={error ? <ComposerError message={error} onDismiss={() => setError(null)} /> : undefined}
      />
      {!busy && !proposal && <div className="assistant-note muted">This box changes only the code. To add, remove or move parts, use the Copilot on the left.</div>}
    </div>
  );
}

/** After a change is accepted: the tests re-run, and a test for the new behaviour is one click away. */
function AfterAccept({ instruction, onClose }: { instruction: string; onClose(): void }) {
  const run = useStore((s) => s.testRun);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const passed = run?.results.filter((r) => r.pass).length ?? 0;
  const addTest = async () => {
    setAdding(true);
    setMsg('');
    try {
      const project = useStore.getState().project!;
      const r = await fetch('/api/ai/tests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, text: instruction }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not write that test');
      if (!d.tests.length) throw new Error("Couldn't turn this change into a test. Add one in the Tests tab in your own words.");
      useStore.getState().update((p) => ({ ...p, tests: [...(p.tests ?? []), ...d.tests] }));
      setMsg(`Added ${d.tests.length === 1 ? 'a test' : `${d.tests.length} tests`} for this change; see the Tests tab.`);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setAdding(false);
    }
  };
  return (
    <div className="after-accept" data-testid="after-accept">
      {!run || run.running ? (
        <span>Re-running the tests in the simulator…</span>
      ) : (
        <span>
          Tests: {passed}/{run.results.length} pass.{' '}
          {msg || 'They were written before this change, so they may not check it yet.'}
        </span>
      )}{' '}
      {!msg && (
        <Button variant="link" onClick={addTest} disabled={adding}>
          {adding ? 'Writing the test…' : 'Add a test for this change'}
        </Button>
      )}{' '}
      <Button variant="link" onClick={onClose} aria-label="Close">
        Close
      </Button>
    </div>
  );
}

function ProposalView({ p, onDone }: { p: Proposal; onDone(accepted: boolean): void }) {
  const diff = lineDiff(p.before, p.after);
  const added = diff.filter((d) => d.t === '+').length;
  const removed = diff.filter((d) => d.t === '-').length;
  const accept = () => {
    useStore.getState().update((pr) => ({ ...pr, files: { ...pr.files, [p.file]: p.after }, codeCustom: p.file === 'main.py' ? true : pr.codeCustom, behavior: p.file === 'main.py' ? p.behavior : pr.behavior }));
    useStore.getState().addChat({ role: 'ai', text: `I changed ${p.file} (from the box under the code): ${p.reply}` });
    onDone(true);
    const project = useStore.getState().project!;
    startSim(project);
  };
  return (
    <ApprovalCard
      data-testid="ai-proposal"
      title={`Change ${p.file}`}
      summary={`+${added} −${removed} lines`}
      description={
        <>
          {p.reply}
          {p.log.length > 0 && <ToolCallList steps={p.log.map((l) => ({ label: l, state: p.ok ? 'done' : 'failed' }))} />}
        </>
      }
      approveLabel="Accept & run"
      denyLabel="Discard"
      onApprove={accept}
      onDeny={() => onDone(false)}
    >
      <pre className="diff">
        {compactDiff(diff).map((d, i) => (
          <div key={i} className={`dl dl-${d.t === '+' ? 'add' : d.t === '-' ? 'del' : d.t === '…' ? 'gap' : 'ctx'}`}>
            <span className="dm">{d.t === '=' ? ' ' : d.t}</span>
            {d.s}
          </div>
        ))}
      </pre>
    </ApprovalCard>
  );
}

type DL = { t: '+' | '-' | '=' | '…'; s: string };

/** Line diff via LCS (files are small). */
export function lineDiff(a: string, b: string): DL[] {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length;
  const m = B.length;
  const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DL[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ t: '=', s: A[i] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', s: A[i++] });
    else out.push({ t: '+', s: B[j++] });
  }
  while (i < n) out.push({ t: '-', s: A[i++] });
  while (j < m) out.push({ t: '+', s: B[j++] });
  return out;
}

/** Keep 2 lines of context around changes; collapse the rest. */
function compactDiff(d: DL[]): DL[] {
  const keep = d.map((x, i) => x.t !== '=' || d.slice(Math.max(0, i - 2), i + 3).some((y) => y.t !== '='));
  const out: DL[] = [];
  let skipping = false;
  d.forEach((x, i) => {
    if (keep[i]) {
      out.push(x);
      skipping = false;
    } else if (!skipping) {
      out.push({ t: '…', s: '' });
      skipping = true;
    }
  });
  return out;
}
