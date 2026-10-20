// The design copilot: routes chat messages to Claude (when available) or to the offline planner,
// answers questions without touching the design, and applies design changes to the open project.
import { useStore } from './store';
import { planFromPrompt, editSpec, buildProject, parseIntent, PlanError, FEATURE_LABELS } from '../core/planner';
import { explainDesign } from '../core/docs';
import { runChecks } from '../core/checks';
import { buildBom, bomTotal } from '../core/bom';
import { PARTS, partDef } from '../core/parts';
import { BOARDS } from '../core/boards';
import { startSim, stopSim } from './simClient';
import type { Project } from '../core/types';
import { GLOSSARY } from './glossary';

const NEW_RE = /^\s*(start over|new project|(build|create|design|make)( me)? an? (new|different|whole new) |i want to build|i'd like to build|let'?s build|help me build)/i;
const BUILD_RE = /^\s*(build|create|design|i want|i'd like|i would like|can you (build|make|design)|make me)\b/i;
const EDIT_RE = /^\s*(add|remove|delete|drop|use|switch|swap|change|replace|move|put|also|plus|include|attach|get rid)\b/i;
const QUESTION_RE = /^\s*(what|why|how|which|where|when|who|can|could|does|do|is|are|should|will|explain|define|tell me)\b|\?\s*$/i;
const BEHAVIOUR_RE = /^\s*(make|have|let|when|if|whenever|show|display|print|beep|blink|flash|count|log|send|turn|play)\b/i;

/** Should this message start a brand-new project (vs edit / question)? */
export function looksLikeNewProject(text: string, current: Project | null) {
  if (!current) return true;
  if (EDIT_RE.test(text) || QUESTION_RE.test(text)) return false;
  if (NEW_RE.test(text)) return true;
  // "build a pico traffic light" while another project is open: a full description = new project.
  const spec = parseIntent(text);
  const namesBoard = /\b(esp-?32|pico|raspberry|rpi|555)\b/i.test(text);
  return BUILD_RE.test(text) && (namesBoard || spec.features.length >= 3);
}

function setBusy(label: string | null) {
  useStore.getState().set({ busy: label });
}

export async function sendPrompt(text: string) {
  const st = useStore.getState();
  const trimmed = text.trim();
  if (!trimmed || st.busy) return;
  st.addChat({ role: 'user', text: trimmed });
  const current = st.project;
  const pending = st.addChat({ role: 'ai', text: current ? 'Thinking…' : 'Designing…', pending: true });

  // Simple commands
  if (/^(run|simulate|start)( it| the simulation)?[.!]?$/i.test(trimmed) && current) {
    startSim(current);
    st.patchChat(pending, { text: 'Simulation started. Change sensor values in the panel on the right, or press the buttons on the breadboard.', pending: false });
    return;
  }

  try {
    if (st.aiStatus.enabled) {
      setBusy(current ? 'Claude is working on your request…' : 'Claude is designing your project…');
      st.patchChat(pending, { text: current ? 'Claude is working on it… (up to a minute if it rewrites the code)' : 'Claude is choosing parts, wiring them and writing the code…' });
      const history = st.chat
        .filter((m) => !m.pending && m.id !== pending)
        .slice(-7, -1)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
      try {
        const res = await fetch('/api/ai/design', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: trimmed, project: current, history }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'AI request failed');
        if (data.project) applyProject(data.project, data.intent === 'new');
        st.patchChat(pending, { text: data.reply, details: data.log, pending: false, actions: data.project ? nextActions() : undefined });
        return;
      } catch (e: any) {
        st.patchChat(pending, { text: `Claude was unavailable (${e?.message ?? e}); using the offline planner instead.` });
      } finally {
        setBusy(null);
      }
    }
    offline(trimmed, current, pending);
  } catch (e: any) {
    const msg = e instanceof PlanError ? e.message : `Something went wrong: ${e?.message ?? e}`;
    st.patchChat(pending, { text: msg, pending: false });
  }
}

function offline(text: string, current: Project | null, pending: string) {
  const st = useStore.getState();
  if (current && QUESTION_RE.test(text) && !EDIT_RE.test(text)) {
    const a = answerQuestion(text, current);
    st.patchChat(pending, { text: a.text, pending: false, actions: a.actions });
    return;
  }
  if (!current && QUESTION_RE.test(text) && parseIntent(text).features.length < 2) {
    const a = answerQuestion(text, null);
    st.patchChat(pending, { text: a.text, pending: false, actions: a.actions });
    return;
  }
  if (looksLikeNewProject(text, current)) {
    const p = planFromPrompt(text);
    applyProject(p, true);
    const behaviour = behaviourNote(text);
    st.patchChat(pending, { text: `${explainDesign(p)}${behaviour}`, details: p.notes, pending: false, actions: nextActions() });
    return;
  }
  const spec = current!.spec ?? { board: current!.board, features: [] };
  const r = editSpec(spec, text);
  if (!r.changed) {
    const behaviour = BEHAVIOUR_RE.test(text);
    st.patchChat(pending, {
      text: behaviour
        ? 'That sounds like a change to what the program does. The offline planner can only add, remove or move parts — open the Code tab to edit main.py, or start Sparkbench with Claude available (ANTHROPIC_API_KEY or a Claude Code login) and ask again.'
        : r.message,
      pending: false,
      actions: behaviour ? [{ label: 'Open the code', run: 'tab:code' }] : undefined,
    });
    return;
  }
  const p = buildProject(r.spec, { previous: current!, prompt: current!.prompt, name: renameIfBoardChanged(current!, r.spec.board) });
  applyProject(p, false);
  st.patchChat(pending, { text: `${r.message} ${summarizeChecks(p)}`.trim(), details: p.notes.slice(0, 8), pending: false, actions: nextActions() });
}

/** Offline mode wires parts with default behaviour; say so when the request asked for more. */
function behaviourNote(text: string) {
  const m = /\b(game|dice|doorbell|clock|log(ger|ging)?|record|count(er|s)?|score|menu|timer|reaction|simon|quiz|alarm clock|csv|email|notify|tweet)\b/i.exec(text);
  return m ? `\n\nNote: I wired the parts and gave them simple default behaviour. The specific “${m[1]}” logic needs to be written in the Code tab (or ask again with Claude available).` : '';
}

function renameIfBoardChanged(prev: Project, board: Project['board']) {
  if (board === prev.board) return prev.name;
  const short: Record<string, string> = { esp32: 'ESP32', pico: 'Pico', rpi4: 'Raspberry Pi', none: '' };
  const old = short[prev.board];
  return old && prev.name.startsWith(old) ? prev.name.replace(old, short[board]) : prev.name;
}

function applyProject(p: Project, fresh: boolean) {
  const st = useStore.getState();
  // A new design means a new program: stop the old simulation instead of leaving it running.
  stopSim(true);
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

/** Answer a question from what Sparkbench knows, without changing the design. */
export function answerQuestion(text: string, p: Project | null): { text: string; actions?: { label: string; run: string }[] } {
  const t = text.toLowerCase();
  if (/\b(buy|cost|price|order|shopping|parts list|bom|need to get)\b/.test(t) && p) {
    const lines = buildBom(p).filter((l: any) => l.kind !== 'supply');
    const total = bomTotal(buildBom(p)) as any;
    return {
      text: `You need: ${lines.map((l: any) => `${l.quantity}× ${l.name}`).join(', ')} — plus a breadboard, jumper wires and a USB cable. About $${Number(typeof total === 'number' ? total : total.total).toFixed(0)} in total. The Parts list tab has links to shops.`,
      actions: [{ label: 'Open the parts list', run: 'tab:bom' }],
    };
  }
  if (/\b(how (do|can|should) i (build|make|assemble|wire|put)|build it|assemble|instructions|step by step)\b/.test(t)) return { text: 'The Build guide tab walks you through it step by step: what to buy, a wiring table (pin by pin), how to put it on a breadboard, how to load the code onto the board, and how to test it.', actions: [{ label: 'Open the build guide', run: 'tab:guide' }] };
  if (/\b(flash|upload|load|install|copy) (the )?(code|program|firmware)|get (the )?(code|files)\b/.test(t) && p) {
    const b = p.board === 'none' ? undefined : BOARDS[p.board];
    return { text: b ? `Download the files with Export → Everything (.zip) or from the Code tab. Then: ${b.flashing.slice(0, 3).join(' ')} (Full steps are in the Build guide.)` : 'This circuit has no microcontroller, so there is no code to load — just build it and connect the battery.', actions: [{ label: 'Open the build guide', run: 'tab:guide' }] };
  }
  if (/\b(simulat|run it|test it|try it)\b/.test(t)) return { text: 'Press the yellow Run button at the top. While it runs, press buttons on the breadboard and drag the sensor sliders in the right-hand panel; the Serial monitor at the bottom shows what the program prints.', actions: [{ label: '▶ Run the simulation', run: 'run' }] };
  if (/\bwhy\b/.test(t) && p?.notes.length) return { text: `Here's the reasoning behind the wiring:\n• ${p.notes.slice(0, 6).join('\n• ')}` };
  // A part in the library?
  const part = PARTS.find((d) => t.includes(d.type) || t.includes(d.name.toLowerCase()) || d.keywords.some((k) => k.length > 3 && new RegExp(`\\b${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}s?\\b`).test(t)));
  if (part) {
    const inDesign = p?.parts.filter((x) => x.type === part.type).map((x) => x.ref) ?? [];
    const where = inDesign.length ? ` In this design it's ${inDesign.join(', ')} — click it on the breadboard to see its pins.` : '';
    return { text: `${part.name}: ${part.eli5} ${part.description}${where}` };
  }
  const g = Object.entries(GLOSSARY).find(([k]) => new RegExp(`\\b${k.toLowerCase()}s?\\b`).test(t));
  if (g) return { text: `${g[0]}: ${g[1]}` };
  if (p) return { text: `I can explain parts and terms (“what is I2C?”, “what does the DHT22 do?”), tell you what to buy, or change the design (“add a buzzer”, “use a Pico instead”). This design is: ${p.summary}` };
  return { text: 'Describe what you want to build — for example “an ESP32 with a screen, two buttons and a temperature sensor” — and I will design it.' };
}

/** Suggestion chips that fit the current design. */
export function suggestions(p: Project | null): string[] {
  if (!p) return ['ESP32 with an OLED, two buttons, temperature sensor and IMU', 'Pico traffic light', 'Raspberry Pi plant waterer with an LCD'];
  if (p.board === 'none') return ['What is a 555 timer?', 'How do I build it?', 'What do I need to buy?'];
  const kinds = new Set((p.features ?? []).map((f) => f.kind));
  const out: string[] = [];
  if (!kinds.has('buzzer')) out.push('Add a buzzer');
  if (!kinds.has('led')) out.push('Add an LED');
  else out.push('Remove an LED');
  if (!kinds.has('oled') && !kinds.has('lcd') && !kinds.has('epaper')) out.push('Add an OLED screen');
  out.push(p.board === 'pico' ? 'Use an ESP32 instead' : p.board === 'esp32' ? 'Use a Raspberry Pi Pico instead' : 'Use an ESP32 instead');
  const first = (p.features ?? []).find((f) => f.kind !== 'internet');
  if (first) out.push(`What does the ${FEATURE_LABELS[first.kind].toLowerCase()} do?`);
  out.push('What do I need to buy?');
  return out.slice(0, 5);
}

export { partDef };
