// AI pair-programmer for the Code tab: ask for a change in plain words, review the diff,
// accept it. The server runs the new code in the simulator (and lets Claude fix crashes)
// before you ever see it.
import React, { useState } from 'react';
import { useStore } from './store';
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
}

export function CodeAssistant({ file }: { file: string }) {
  const ai = useStore((s) => s.aiStatus);
  const err = useStore((s) => s.sim.error);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (instruction: string, withError?: string) => {
    const project = useStore.getState().project!;
    setBusy(true);
    setError(null);
    setProposal(null);
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
      setProposal({ file, before: project.files[file], after, reply: data.reply, log: data.log ?? [], ok: data.ok, behavior: (data.project as Project).behavior });
      setText('');
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!ai.enabled)
    return (
      <div className="assistant off">
        AI code editing needs Claude. Start Sparkbench with <code>ANTHROPIC_API_KEY</code> set, or install and log in to Claude Code on this computer.
      </div>
    );

  return (
    <div className="assistant" data-testid="code-assistant">
      {err && err.file === file && !busy && !proposal && (
        <button className="fix-ai" onClick={() => ask('The program crashes. Find and fix the bug, and explain it simply.', err.raw)}>
          Fix this crash with AI
        </button>
      )}
      {proposal && <ProposalView p={proposal} onDone={() => setProposal(null)} />}
      {error && <div className="banner error">{error}</div>}
      <form
        className="assistant-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) ask(text.trim());
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          disabled={busy}
          aria-label="Ask the AI to change this file"
          placeholder={busy ? '' : `Ask AI to change ${file}… e.g. “make the LED blink twice as fast” or “show the temperature in Fahrenheit”. Select code first to focus on it.`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) ask(text.trim());
            }
          }}
        />
        <button type="submit" className="primary" disabled={busy || !text.trim()}>
          {busy ? 'Working…' : 'Ask AI'}
        </button>
      </form>
      {busy && <div className="assistant-status">Claude is editing {file} and testing it in the simulator… this takes 15–60 seconds.</div>}
    </div>
  );
}

function ProposalView({ p, onDone }: { p: Proposal; onDone(): void }) {
  const diff = lineDiff(p.before, p.after);
  const added = diff.filter((d) => d.t === '+').length;
  const removed = diff.filter((d) => d.t === '-').length;
  const accept = () => {
    useStore.getState().update((pr) => ({ ...pr, files: { ...pr.files, [p.file]: p.after }, codeCustom: p.file === 'main.py' ? true : pr.codeCustom, behavior: p.file === 'main.py' ? p.behavior : pr.behavior }));
    onDone();
    const project = useStore.getState().project!;
    startSim(project);
  };
  return (
    <div className="proposal" data-testid="ai-proposal">
      <div className="proposal-head">
        <div>
          <b>Suggested change to {p.file}</b> <span className="muted">+{added} −{removed} lines</span>
          <div className="proposal-reply">{p.reply}</div>
          {p.log.map((l, i) => (
            <div key={i} className={`proposal-log ${p.ok ? 'ok' : 'warn'}`}>
              {l}
            </div>
          ))}
        </div>
        <div className="proposal-actions">
          <button className="primary" onClick={accept}>
            Accept & run
          </button>
          <button onClick={onDone}>Discard</button>
        </div>
      </div>
      <pre className="diff">
        {compactDiff(diff).map((d, i) => (
          <div key={i} className={`dl dl-${d.t === '+' ? 'add' : d.t === '-' ? 'del' : d.t === '…' ? 'gap' : 'ctx'}`}>
            <span className="dm">{d.t === '=' ? ' ' : d.t}</span>
            {d.s}
          </div>
        ))}
      </pre>
    </div>
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
