// Before anything slow or paid: what it uses and roughly how long it takes.
import React from 'react';
import { useStore } from './store';

const KINDS = {
  design: { ai: true, time: '30–90 s' },
  code: { ai: true, time: '20–60 s' },
  photo: { ai: true, time: 'about 30 s' },
  debug: { ai: true, time: 'about 30 s' },
  test: { ai: true, time: 'about 20 s' },
  arduino: { ai: true, time: '1–5 min' },
  grade: { ai: true, time: 'about 30 s per requirement' },
  datasheet: { ai: true, time: '1–3 min' },
  pcb: { ai: false, time: '15–40 s', where: 'runs on this computer with KiCad' },
  parts: { ai: false, time: 'about 10 s', where: 'looks up LCSC over the internet' },
  case: { ai: false, time: 'a second', where: 'runs on this computer' },
} as const;

export function CostHint({ kind }: { kind: keyof typeof KINDS }) {
  const ai = useStore((s) => s.aiStatus);
  const k = KINDS[kind];
  const who = k.ai ? (ai.via === 'api' ? 'uses Claude (billed to your Anthropic API key, usually a few cents)' : 'uses Claude through your Claude Code plan') : 'where' in k ? k.where : '';
  return (
    <span className="cost-hint" data-testid={`cost-${kind}`}>
      {k.time}
      {who ? ` · ${who}` : ''}
      {!k.ai ? ' · free' : ''}
    </span>
  );
}
