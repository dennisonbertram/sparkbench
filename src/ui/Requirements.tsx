// Requirements card (what it will do / power / size / budget) and the multiple-choice questions
// the copilot asks before designing when a request is ambiguous.
import React, { useState } from 'react';
import { sendPrompt } from './copilot';
import { useStore } from './store';
import type { Requirements } from '../core/types';

export function QuestionsCard({ questions }: { questions: { question: string; options: string[] }[] }) {
  const busy = useStore((s) => s.busy);
  const [picked, setPicked] = useState<string[]>(() => questions.map((q) => q.options[0] ?? ''));
  const [sent, setSent] = useState(false);
  return (
    <div className="questions" data-testid="questions">
      {questions.map((q, i) => (
        <fieldset key={i} disabled={sent}>
          <legend>{q.question}</legend>
          <div className="q-options">
            {q.options.map((o, j) => (
              <label key={o} className={picked[i] === o ? 'on' : ''}>
                <input type="radio" name={`q${i}-${q.question}`} checked={picked[i] === o} onChange={() => setPicked((p) => p.map((x, k) => (k === i ? o : x)))} />
                {o}
                {j === 0 && <span className="q-rec"> (suggested)</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button
        className="primary"
        disabled={sent || !!busy}
        data-testid="questions-go"
        onClick={() => {
          setSent(true);
          sendPrompt(`My answers: ${questions.map((q, i) => `${q.question} → ${picked[i]}`).join('; ')}. Please design it now.`);
        }}
      >
        Design it with these answers
      </button>
    </div>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function RequirementsCard({ requirements: r, compact }: { requirements: Requirements; compact?: boolean }) {
  const busy = useStore((s) => s.busy);
  const [editing, setEditing] = useState(false);
  const [does, setDoes] = useState(r.does.join('\n'));
  const [power, setPower] = useState(r.power);
  if (editing)
    return (
      <form
        className="req-card editing"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          sendPrompt(`Update the design to match these requirements.\nWhat it should do:\n${does.split('\n').filter(Boolean).map((d) => `- ${d}`).join('\n')}\nPower: ${power}`);
        }}
      >
        <label>
          What it should do (one per line)
          <textarea value={does} onChange={(e) => setDoes(e.target.value)} rows={5} />
        </label>
        <label>
          Power
          <input value={power} onChange={(e) => setPower(e.target.value)} />
        </label>
        <div className="req-actions">
          <button type="submit" className="primary" disabled={!!busy}>Update the design</button>
          <button type="button" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    );
  return (
    <div className={`req-card ${compact ? 'compact' : ''}`} data-testid="requirements">
      <div className="req-row">
        <span className="req-label">What it will do</span>
        <ul>
          {r.does.map((d, i) => (
            <li key={i}>
              {d}
              {r.untested?.some((u) => norm(u) === norm(d)) && (
                <span className="req-untested" title="No simulator test checks this promise yet: try it yourself on the real build.">
                  {' '}not tested
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="req-row"><span className="req-label">Power</span><span>{r.power}</span></div>
      <div className="req-row"><span className="req-label">Size</span><span>{r.size}</span></div>
      <div className="req-row"><span className="req-label">Budget</span><span>{r.budget}</span></div>
      <button className="link" onClick={() => setEditing(true)} disabled={!!busy}>Not quite right? Change it</button>
    </div>
  );
}
