// Requirements card (what it will do / power / size / budget) and the multiple-choice questions
// the copilot asks before designing when a request is ambiguous.
import React, { useState } from 'react';
import { sendPrompt } from './copilot';
import { useStore } from './store';
import { AskCard, Button, Card, TextArea, TextInput } from './ds';
import type { Requirements } from '../core/types';

export function QuestionsCard({ questions }: { questions: { question: string; options: string[] }[] }) {
  const busy = useStore((s) => s.busy);
  // Option ids are their index, so options with the same text stay distinct. The first option is the suggestion.
  const [picked, setPicked] = useState<number[]>(() => questions.map(() => 0));
  const [sent, setSent] = useState(false);
  return (
    <div className="questions" data-testid="questions">
      {questions.map((q, i) => (
        <AskCard
          key={i}
          question={q.question}
          options={q.options.map((o, j) => ({ id: String(j), label: o }))}
          recommendedId="0"
          selected={String(picked[i])}
          onSelect={(id) => setPicked((p) => p.map((x, k) => (k === i ? Number(id) : x)))}
          // Once sent, each card closes on its answer.
          answer={sent ? String(picked[i]) : undefined}
        />
      ))}
      <Button
        variant="primary"
        disabled={sent || !!busy}
        data-testid="questions-go"
        onClick={() => {
          setSent(true);
          sendPrompt(`My answers: ${questions.map((q, i) => `${q.question} → ${q.options[picked[i]] ?? ''}`).join('; ')}. Please design it now.`);
        }}
      >
        Design it with these answers
      </Button>
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
      <Card className="req-card editing">
        <form
          className="req-form"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            sendPrompt(`Update the design to match these requirements.\nWhat it should do:\n${does.split('\n').filter(Boolean).map((d) => `- ${d}`).join('\n')}\nPower: ${power}`);
          }}
        >
          <label>
            What it should do (one per line)
            <TextArea value={does} onChange={(e) => setDoes(e.target.value)} rows={5} />
          </label>
          <label>
            Power
            <TextInput value={power} onChange={(e) => setPower(e.target.value)} />
          </label>
          <div className="req-actions">
            <Button type="submit" variant="primary" disabled={!!busy}>Update the design</Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      </Card>
    );
  return (
    <Card className={`req-card ${compact ? 'compact' : ''}`} data-testid="requirements">
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
      <Button variant="link" onClick={() => setEditing(true)} disabled={!!busy}>Not quite right? Change it</Button>
    </Card>
  );
}
