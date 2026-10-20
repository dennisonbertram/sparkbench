// The design copilot: routes chat messages to Claude (when the local server has an API key)
// or to the offline planner, and applies the result to the open project.
import { useStore } from './store';
import { planFromPrompt, editSpec, buildProject, PlanError } from '../core/planner';
import { explainDesign } from '../core/docs';
import { runChecks } from '../core/checks';
import { startSim } from './simClient';
import type { Project } from '../core/types';
import { GLOSSARY } from './glossary';

const NEW_RE = /^\s*(build|make|create|design|start|new project|i want|i'd like|i would like|can you (build|make|design)|let'?s build|help me build)\b/i;
const EDIT_RE = /^\s*(add|remove|delete|drop|use|switch|swap|change|replace|move|put|also|plus|include|attach|get rid)\b/i;

export function looksLikeNewProject(text: string, current: Project | null) {
  if (!current) return true;
  if (EDIT_RE.test(text)) return false;
  return NEW_RE.test(text);
}

export async function sendPrompt(text: string) {
  const st = useStore.getState();
  const trimmed = text.trim();
  if (!trimmed) return;
  st.addChat({ role: 'user', text: trimmed });
  const pending = st.addChat({ role: 'ai', text: 'Designing…', pending: true });
  const current = st.project;

  // Simple commands
  if (/^(run|simulate|start)( it| the simulation)?[.!]?$/i.test(trimmed) && current) {
    startSim(current);
    st.patchChat(pending, { text: 'Simulation started. Use the controls under each sensor to change what it measures.', pending: false });
    return;
  }
  const q = glossaryAnswer(trimmed);
  if (q) {
    st.patchChat(pending, { text: q, pending: false });
    return;
  }

  try {
    if (st.aiStatus.enabled) {
      const res = await fetch('/api/ai/design', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: trimmed, project: current }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI request failed');
      if (data.project) applyProject(data.project, data.intent === 'new');
      st.patchChat(pending, { text: data.reply, details: data.log, pending: false, actions: data.project ? nextActions() : undefined });
      return;
    }
    if (looksLikeNewProject(trimmed, current)) {
      const p = planFromPrompt(trimmed);
      applyProject(p, true);
      st.patchChat(pending, { text: explainDesign(p), details: p.notes, pending: false, actions: nextActions() });
    } else {
      const spec = current!.spec ?? { board: current!.board, features: [] };
      const r = editSpec(spec, trimmed);
      if (!r.changed) {
        st.patchChat(pending, { text: r.message, pending: false });
        return;
      }
      const p = buildProject(r.spec, { previous: current!, prompt: current!.prompt, name: renameIfBoardChanged(current!, r.spec.board) });
      applyProject(p, false);
      st.patchChat(pending, { text: `${r.message} ${summarizeChecks(p)}`.trim(), details: p.notes.slice(0, 8), pending: false, actions: nextActions() });
    }
  } catch (e: any) {
    const msg = e instanceof PlanError ? e.message : `Something went wrong: ${e?.message ?? e}`;
    st.patchChat(pending, { text: msg, pending: false });
  }
}

function renameIfBoardChanged(prev: Project, board: Project['board']) {
  if (board === prev.board) return prev.name;
  const short: Record<string, string> = { esp32: 'ESP32', pico: 'Pico', rpi4: 'Raspberry Pi', none: '' };
  const old = short[prev.board];
  return old && prev.name.startsWith(old) ? prev.name.replace(old, short[board]) : prev.name;
}

function applyProject(p: Project, fresh: boolean) {
  const st = useStore.getState();
  st.setProject(p);
  if (fresh) st.setTab('breadboard');
}

function summarizeChecks(p: Project) {
  const errs = runChecks(p).filter((c) => c.severity === 'error');
  return errs.length ? `Heads up: ${errs.length} problem${errs.length > 1 ? 's' : ''} to look at in the Problems tab.` : 'Wiring checks pass.';
}

function nextActions() {
  return [
    { label: '▶ Run the simulation', run: 'run' },
    { label: 'Show the schematic', run: 'tab:schematic' },
    { label: 'Build guide', run: 'tab:guide' },
  ];
}

function glossaryAnswer(text: string): string | null {
  const m = /^(what('s| is| are| does)|explain|define)\s+(an? |the )?([\w\s-]+?)\??$/i.exec(text.trim());
  if (!m) return null;
  const term = m[4].toLowerCase().trim();
  const hit = Object.entries(GLOSSARY).find(([k]) => k.toLowerCase() === term || term.startsWith(k.toLowerCase()) || k.toLowerCase().startsWith(term));
  return hit ? `${hit[0]}: ${hit[1]}` : null;
}
