// Wraps electronics jargon in text with a dotted underline and a plain-English tooltip.
import React from 'react';
import { GLOSSARY } from './glossary';

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const RE = new RegExp(`\\b(${TERMS.map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})s?\\b`, 'gi');

export function Glossed({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  const seen = new Set<string>();
  for (const m of text.matchAll(RE)) {
    const key = TERMS.find((t) => t.toLowerCase() === m[1].toLowerCase())!;
    if (seen.has(key)) continue; // explain each term once per text
    seen.add(key);
    out.push(text.slice(last, m.index));
    out.push(
      <abbr key={m.index} className="gloss" title={GLOSSARY[key]} tabIndex={0}>
        {m[0]}
      </abbr>,
    );
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}
