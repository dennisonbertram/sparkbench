// Adapted from Praci (github.com/dennisonbertram/praci, Apache-2.0, derived from Rakazo):
//   apps/web/src/components/ai/primitives.tsx (Shimmer, LoadingState, SuccessPop, formatElapsed)
//   apps/web/src/components/ai/ToolCallLabel.tsx (ToolCall)
//   apps/web/src/components/ToolActivityDisclosure.tsx (ToolCallGroup, ToolCallList)
//   apps/web/src/components/UserTextBubble.tsx, apps/web/src/pages/shell/transcript.tsx and
//   apps/web/src/components/MessageHoverMetadata.tsx (ChatThread, ChatMessage)
//   packages/chat-ui/src/markdown.web.tsx + markdown.web.css (Markdown, on top of `marked`)
//   apps/web/src/pages/shell/composer.tsx and composer-error.tsx (Composer, ComposerError)
//   apps/web/src/components/MailApprovalCard.tsx, AskCard.tsx (approval actions) and
//   apps/mobile/components/McpApprovalCard.tsx (ApprovalCard)
//   apps/web/src/components/AskCard.tsx and pages/shell/message-cards.tsx ChoiceCard (AskCard)
// Praci's primitives were themselves hand-ported from beautifului.dev
// (github.com/TurboKach/ai-native-react-components, MIT © 2026 Turbo).
//
// Sparkbench's AI chrome: the copilot chat, its tool activity, and the cards where the agent asks
// for permission or for an answer. Plain CSS in ./ds.css (the "AI and chat" section), tokens only.
// Catalog: docs/design/design-system.md, "AI and chat".
import { Children, forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Marked } from 'marked';
import { Button, IconButton, TextArea, TextInput } from './index';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ') || undefined;

// ------------------------------------------------------------------ icons
export type IconName = 'check' | 'x' | 'clock' | 'circle' | 'dash' | 'chevron-right' | 'chevron-down' | 'arrow-up' | 'stop' | 'plus' | 'key' | 'more' | 'spark';

const ICON_PATHS: Record<IconName, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="8" />,
  dash: <path d="M6 12h12" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'arrow-up': <path d="M12 19V5M5 12l7-7 7 7" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />,
  plus: <path d="M12 5v14M5 12h14" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8.2-8.2M16 7l3 3M14 9l2 2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
};

/** A small line icon in the current text colour. Decorative: give the control around it a label. */
export function Icon({ name, size = 14, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={cx('ds-icon', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

// ------------------------------------------------------------------ motion primitives
/** A light sweep travelling across a text label: "this is happening now". Static under reduced motion. */
export function Shimmer({ children }: { children: ReactNode }) {
  return <span className="ds-shimmer">{children}</span>;
}

/** After this long a run offers Stop and Try again, and the timer drops its tenths. */
export const SLOW_RUN_AFTER_MS = 120_000;
/** After this long without a new step, the time since the last one is shown next to it. */
export const QUIET_SECONDS_SHOWN_AFTER_MS = 15_000;

/** Wall-clock time since `startedAtMs`: `0.0s`, `1m 2.3s`, and `2m 5s` once past `slowAfterMs`. */
export function formatElapsed(startedAtMs: number, nowMs: number, slowAfterMs = SLOW_RUN_AFTER_MS): string {
  const totalTenths = Math.round(Math.max(0, nowMs - startedAtMs) / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = (totalTenths % 600) / 10;
  if (minutes === 0) return `${seconds.toFixed(1)}s`;
  if (totalTenths * 100 >= slowAfterMs) return `${minutes}m ${Math.floor(seconds)}s`;
  return `${minutes}m ${seconds.toFixed(1)}s`;
}

function useNow(intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// A chevron wavefront over a 3x3 pixel grid: each cell fires by its distance from the middle row.
const PIXEL_DELAYS = Array.from({ length: 9 }, (_, i) => ((i % 3) + Math.abs(Math.floor(i / 3) - 1)) * 90);

export interface LoadingStateProps {
  /** What the agent is doing, as a phrase: "Designing your circuit". */
  label: string;
  /** Epoch ms when the run started. Falls back to when this mounted. */
  startedAt?: number;
  /** The latest step, such as "Wiring the OLED to I2C". */
  detail?: string;
  /** After this long the row says it is taking longer than usual (and offers Stop / Try again). Default 2 min. */
  slowAfterMs?: number;
  /** Shown once slow; e.g. "Designs with custom code can take 2–3 minutes." */
  slowHint?: string;
  onStop?: () => void;
  onRetry?: () => void;
  className?: string;
}

/** Pixel-grid loader with a shimmering label, a live elapsed timer and the latest step. */
export function LoadingState({ label, startedAt, detail, slowAfterMs = SLOW_RUN_AFTER_MS, slowHint, onStop, onRetry, className }: LoadingStateProps) {
  const [mountedAt] = useState(() => Date.now());
  const now = useNow();
  const start = startedAt ?? mountedAt;
  // The quiet time restarts whenever the latest step changes.
  const [seen, setSeen] = useState({ detail, at: now });
  if (seen.detail !== detail) setSeen({ detail, at: Date.now() });
  const quiet = detail ? now - seen.at : 0;
  const slow = now - start >= slowAfterMs;
  return (
    <div className={cx('ds-loading', className)} role="status" data-testid="loading-state">
      <span className="ds-pixels" aria-hidden="true">
        {PIXEL_DELAYS.map((delay, i) => (
          <span key={i} style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
      <span className="ds-loading-text">
        <span className="ds-loading-head">
          <span className="ds-loading-label">
            <Shimmer>{label}</Shimmer>
          </span>
          {/* The ticking timer is not announced every tenth of a second. */}
          <span className="ds-loading-time" aria-hidden="true">
            {formatElapsed(start, now, slowAfterMs)}
          </span>
        </span>
        {detail && (
          <span className="ds-loading-detail">
            {detail}
            {quiet >= QUIET_SECONDS_SHOWN_AFTER_MS ? ` · ${Math.floor(quiet / 1000)}s` : ''}
          </span>
        )}
        {slow && (
          <span className="ds-loading-slow" data-testid="loading-slow">
            {slowHint ?? 'Taking longer than usual.'}
            {onStop && (
              <Button variant="link" onClick={onStop}>
                Stop
              </Button>
            )}
            {onRetry && (
              <Button variant="link" onClick={onRetry}>
                Try again
              </Button>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

/** Pop-in check with a fading-up label: the beat after an approved change lands. */
export function SuccessPop({ label }: { label: ReactNode }) {
  return (
    <span className="ds-success" role="status">
      <span className="ds-success-dot">
        <Icon name="check" size={12} />
      </span>
      <span className="ds-success-label">{label}</span>
    </span>
  );
}

// ------------------------------------------------------------------ tool calls
export type ToolCallState = 'running' | 'done' | 'failed' | 'waiting' | 'queued' | 'skipped';
export interface ToolCallLine {
  text: string;
  failed?: boolean;
}

export interface ToolCallProps {
  /** The activity as a plain phrase: "Placing parts", "Wiring", "Running checks". */
  label: string;
  state?: ToolCallState;
  /** Repeated calls fold into one row: "Reading datasheet ×3". */
  count?: number;
  /** What the finished call found, such as "Ran 12 checks · 1 warning". Replaces the label once done. */
  summary?: string;
  /** The steps the call took; the row becomes a disclosure listing them. */
  lines?: readonly ToolCallLine[];
  /** Tooltip: the raw tool id or extra detail. */
  title?: string;
  className?: string;
}

const TOOL_ICON: Record<ToolCallState, IconName> = { running: 'clock', waiting: 'clock', done: 'check', failed: 'x', queued: 'circle', skipped: 'dash' };
const TOOL_STATE_TEXT: Record<ToolCallState, string> = { running: 'In progress', waiting: 'Waiting', done: 'Done', failed: 'Failed', queued: 'Not started', skipped: 'Skipped' };

/** One tool call as a phrase. Running shimmers; done, failed, waiting, queued and skipped get an icon. */
export function ToolCall({ label, state = 'done', count = 1, summary, lines, title, className }: ToolCallProps) {
  const settled = state === 'done' || state === 'failed' || state === 'skipped';
  const phrase = (settled && summary) || label;
  const row = (
    <span className={cx('ds-tool', className)} data-testid="tool-call" data-state={state} title={title}>
      <span className="ds-tool-icon">
        <Icon name={TOOL_ICON[state]} size={12} />
      </span>
      <span className="ds-tool-text">
        <span className="ds-visually-hidden">{TOOL_STATE_TEXT[state]}: </span>
        {state === 'running' ? <Shimmer>{phrase}</Shimmer> : phrase}
        {count > 1 ? ` ×${count}` : ''}
      </span>
    </span>
  );
  if (!lines?.length) return row;
  return (
    <details className="ds-tool-details">
      <summary>{row}</summary>
      <ul className="ds-tool-lines">
        {lines.map((line, i) => (
          <li key={i} className={line.failed ? 'is-failed' : undefined}>
            {line.text}
          </li>
        ))}
      </ul>
    </details>
  );
}

export interface ToolStep extends Omit<ToolCallProps, 'state' | 'className'> {
  state?: ToolCallState;
}

/**
 * A list of tool calls. With `limit`, only the last few show, under a count of the earlier ones,
 * so a long live run does not push the chat down.
 */
export function ToolCallList({ steps, limit }: { steps: readonly ToolStep[]; limit?: number }) {
  const hidden = limit !== undefined && steps.length > limit ? steps.length - limit : 0;
  return (
    <div className="ds-tool-list" data-testid="tool-list">
      {hidden > 0 && <div className="ds-tool-hidden">+{hidden} earlier {hidden === 1 ? 'step' : 'steps'}</div>}
      {steps.slice(hidden).map((s, i) => (
        <ToolCall key={hidden + i} {...s} />
      ))}
    </div>
  );
}

/** While a run is live, ToolCallGroup shows this many of the latest steps. */
export const LIVE_TOOL_STEP_WINDOW = 6;

function formatDuration(ms?: number): string {
  if (ms === undefined) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * The tool-activity disclosure: "Working… · 3 tools" while live (open), "Done · 3 tools · 42s" after
 * (folded). It reopens on its own only when a new run starts; a manual collapse during a run holds.
 */
export function ToolCallGroup({ live, count, durationMs, label, children }: { live: boolean; count: number; durationMs?: number; label?: ReactNode; children: ReactNode }) {
  const tools = `${count} ${count === 1 ? 'tool' : 'tools'}`;
  const duration = formatDuration(durationMs);
  return (
    // The key swap remounts the element when the run ends, so `open` restarts from `live`.
    <details key={live ? 'live' : 'done'} open={live} className="ds-tool-group" data-live={live || undefined} data-testid="tool-group">
      <summary>
        <Icon name="chevron-right" size={14} className="ds-tool-chevron" />
        {label ?? (live ? `Working… · ${tools}` : `Done · ${tools}${duration ? ` · ${duration}` : ''}`)}
      </summary>
      <div className="ds-tool-group-body">{children}</div>
    </details>
  );
}

// ------------------------------------------------------------------ markdown
// Sparkbench already renders replies with `marked`. This instance escapes raw HTML and drops
// script-capable link targets, since the text comes from a model.
const md = new Marked({
  breaks: true,
  async: false,
  renderer: {
    html({ text }) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
  },
  walkTokens(token) {
    if ((token.type === 'link' || token.type === 'image') && /^\s*(javascript|vbscript|data):/i.test(token.href)) token.href = '#';
  },
});

/** Renders a model's markdown reply (paragraphs, lists, code, tables, links) in chat type. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = md.parse(text, { async: false }) as string;
  return <div className={cx('ds-md', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ------------------------------------------------------------------ messages
/**
 * The scrolling transcript. A polite live region, so finished replies are announced.
 * Forward a ref to scroll it.
 */
export const ChatThread = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ChatThread({ className, ...rest }, ref) {
  return <div ref={ref} role="log" aria-live="polite" aria-relevant="additions" className={cx('ds-thread', className)} {...rest} />;
});

export interface ChatMessageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  /** user: the person's own bubble (right, --chat-user). assistant: the copilot's reply (left). */
  from: 'user' | 'assistant';
  /** Markdown text for an assistant reply. User text is always shown literally. */
  text?: string;
  /** Still streaming or thinking: muted. */
  pending?: boolean;
  /** Time, model, cost or quick actions: revealed on hover or focus beside the bubble (always shown on touch). */
  meta?: ReactNode;
  /** Keep `meta` visible (e.g. while its menu is open). */
  metaPinned?: boolean;
  /** Cards, tool activity, images and actions under the text. The extras box is drawn only when there is at least one. */
  children?: ReactNode;
  /** Extra attributes for the text bubble (it carries `data-testid="msg-text"` unless overridden). */
  bubbleProps?: HTMLAttributes<HTMLDivElement> & { 'data-testid'?: string };
}

/** One chat message. Extra cards (ToolCallGroup, ApprovalCard, AskCard, actions) go in children. */
export function ChatMessage({ from, text, pending, meta, metaPinned, children, bubbleProps, className, ...rest }: ChatMessageProps) {
  // `false`, `null` and `undefined` children count as nothing, so `{cond && <Card />}` alone draws no box.
  const extras = Children.toArray(children).length > 0;
  return (
    <div className={cx('ds-msg', `ds-from-${from}`, pending && 'is-pending', className)} data-from={from} data-pending={pending || undefined} {...rest}>
      {text !== undefined && text !== '' && (
        <div data-testid="msg-text" dir="auto" {...bubbleProps} className={cx('ds-msg-bubble', bubbleProps?.className)}>
          {from === 'assistant' && !pending ? <Markdown text={text} /> : <span className="ds-msg-plain">{text}</span>}
        </div>
      )}
      {extras && <div className="ds-msg-extras">{children}</div>}
      {meta && <div className={cx('ds-msg-meta', metaPinned && 'is-pinned')}>{meta}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ composer
/** A send or run error above the composer, with Retry and a dismiss button. */
export function ComposerError({ message, onDismiss, onRetry, retryLabel = 'Retry', children }: { message: ReactNode; onDismiss?: () => void; onRetry?: () => void; retryLabel?: string; children?: ReactNode }) {
  return (
    <div role="alert" className="ds-composer-error" data-testid="composer-error">
      <span className="ds-composer-error-text">{message}</span>
      <span className="ds-composer-error-actions">
        {children}
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
        {onDismiss && (
          <IconButton label="Dismiss error" className="ds-composer-error-x" onClick={onDismiss}>
            <Icon name="x" size={13} />
          </IconButton>
        )}
      </span>
    </div>
  );
}

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter (without Shift) and the send button call this when there is something to send. */
  onSend: () => void;
  /** The accessible name of the text box, e.g. "Message the copilot". */
  label: string;
  placeholder?: string;
  /** Override what counts as sendable (e.g. images attached with no text). Default: non-blank text. */
  canSend?: boolean;
  /** The agent is working: the box stays usable but Send is off; with onStop a Stop button shows. */
  busy?: boolean;
  onStop?: () => void;
  /** Nothing can be typed (e.g. AI is off). Say why in the placeholder. */
  disabled?: boolean;
  /** Left of the box: an attach button or FilePicker. */
  attach?: ReactNode;
  /** Above the box: attachment previews, chips. */
  top?: ReactNode;
  /** Between the box and Send: a cost hint, a model badge. */
  aside?: ReactNode;
  /** Below the box: a cost hint or a note about what Send does. */
  footer?: ReactNode;
  /** Extra attributes for the Stop button, e.g. a screen's own `data-testid` (default `composer-stop`). */
  stopProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type' | 'aria-label'> & { 'data-testid'?: string };
  /** An error line above the box; pass a string, or a ComposerError for actions. */
  error?: ReactNode;
  onDismissError?: () => void;
  sendLabel?: string;
  /** The box grows with its text up to this many pixels, then scrolls. */
  maxHeight?: number;
  className?: string;
}

/** The chat input: a growing text box, attach slot and a round Send (or Stop) button. Enter sends; Shift+Enter is a new line. */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { value, onChange, onSend, label, placeholder, canSend, busy, onStop, disabled, attach, top, aside, footer, stopProps, error, onDismissError, sendLabel = 'Send', maxHeight = 160, className },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const sendable = (canSend ?? value.trim().length > 0) && !busy && !disabled;
  const stoppable = !!busy && !!onStop;
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    // An empty box is as tall as its placeholder, which changes while busy.
  }, [value, maxHeight, placeholder]);
  const send = () => {
    if (sendable) onSend();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an IME is composing confirms the character, never sends.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  return (
    <form
      className={cx('ds-composer', className)}
      aria-busy={busy || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {error && (typeof error === 'string' ? <ComposerError message={error} onDismiss={onDismissError} /> : error)}
      {top && <div className="ds-composer-top">{top}</div>}
      {/* While the agent works the box may be off, but Stop stays at full strength. */}
      <div className={cx('ds-composer-bar', disabled && 'is-disabled', stoppable && 'is-stoppable')}>
        {attach && <span className="ds-composer-attach">{attach}</span>}
        <TextArea
          ref={(el) => {
            inner.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) ref.current = el;
          }}
          data-composer-input=""
          className="ds-composer-input"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={label}
          dir="auto"
        />
        <span className="ds-composer-actions">
          {aside}
          {stoppable ? (
            <IconButton data-testid="composer-stop" {...stopProps} label="Stop" variant="default" className={cx('ds-round', stopProps?.className)} onClick={onStop}>
              <Icon name="stop" size={14} />
            </IconButton>
          ) : (
            <IconButton label={sendLabel} variant="primary" type="submit" className="ds-round" disabled={!sendable}>
              <Icon name="arrow-up" size={16} />
            </IconButton>
          )}
        </span>
      </div>
      {footer && <div className="ds-composer-footer">{footer}</div>}
    </form>
  );
});

// ------------------------------------------------------------------ approval
export type ApprovalStatus = 'pending' | 'approved' | 'always' | 'denied' | 'expired';

// When a card here was last answered. A card that appears right after keeps its buttons off for
// a moment, so a double click meant for the old card cannot approve the new one.
let lastAnsweredAt = 0;
const RECENT_ANSWER_MS = 30_000;
const SETTLE_MS = 1000;

function useSettling(pending: boolean) {
  const [settling, setSettling] = useState(() => pending && Date.now() - lastAnsweredAt < RECENT_ANSWER_MS);
  useEffect(() => {
    if (!settling) return;
    const t = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(t);
  }, [settling]);
  return settling;
}

/** Runs an answer handler, tracking which action is in flight and any error. */
function useAnswer() {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (id: string, fn: () => void | Promise<void>) => {
    if (pendingAction) return;
    setPendingAction(id);
    setError(null);
    try {
      await fn();
      lastAnsweredAt = Date.now();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not submit this answer');
    } finally {
      setPendingAction(null);
    }
  };
  return { pendingAction, error, run };
}

const APPROVAL_RESULT: Record<Exclude<ApprovalStatus, 'pending'>, { text: string; icon?: IconName; tone: string }> = {
  approved: { text: 'Approved', icon: 'check', tone: 'ink' },
  always: { text: 'Always allowed', icon: 'check', tone: 'ink' },
  denied: { text: 'Denied', icon: 'x', tone: 'error' },
  expired: { text: 'No longer active', tone: 'muted' },
};

export interface ApprovalCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children' | 'role'> {
  /** What the agent wants to do: "Rewire the motor driver", "Change main.py". */
  title: ReactNode;
  /** A short line under the title: the file, the parts touched, "+12 −3 lines". */
  summary?: ReactNode;
  /** What it will do and why, in a sentence or two. */
  description?: ReactNode;
  /** Details or a diff preview. Tall content is clipped with "Show more". */
  children?: ReactNode;
  icon?: IconName;
  status?: ApprovalStatus;
  /** False when the run no longer waits for this answer. */
  canAnswer?: boolean;
  approveLabel?: string;
  denyLabel?: string;
  onApprove: () => void | Promise<void>;
  onDeny: () => void | Promise<void>;
  /** Offers a quiet "Always allow this" under the buttons. */
  onAlwaysAllow?: () => void | Promise<void>;
  alwaysLabel?: string;
  alwaysHint?: string;
  /** Replaces the default result line once answered ("Applied and running"). */
  resultText?: ReactNode;
  /** Clip height of the preview, in px. */
  previewHeight?: number;
  /** Native div props (`data-testid`, `id`, …) pass through to the card; `data-testid` defaults to `approval-card`. */
}

/**
 * The agent asks before doing something: title, what it will do, a preview, Approve / Deny and an
 * optional "Always allow". Once answered it folds to its header, which toggles the details.
 */
export function ApprovalCard({
  title,
  summary,
  description,
  children,
  icon = 'spark',
  status = 'pending',
  canAnswer = true,
  approveLabel = 'Approve',
  denyLabel = 'Deny',
  onApprove,
  onDeny,
  onAlwaysAllow,
  alwaysLabel = 'Always allow this',
  alwaysHint = "Won't ask again for this kind of change.",
  resultText,
  previewHeight = 220,
  className,
  ...rest
}: ApprovalCardProps) {
  const answered = status !== 'pending';
  const interactive = !answered && canAnswer;
  const [open, setOpen] = useState(!answered);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const settling = useSettling(!answered);
  const { pendingAction, error, run } = useAnswer();
  const busy = pendingAction !== null || settling;

  // A card answered while on screen folds to its header and keeps focus there if focus was in the card.
  const wasAnswered = useRef(answered);
  useEffect(() => {
    if (!answered || wasAnswered.current) return;
    wasAnswered.current = true;
    setOpen(false);
    const active = document.activeElement;
    if (!active || active === document.body || card.current?.contains(active)) toggle.current?.focus();
  }, [answered]);

  useLayoutEffect(() => {
    const el = preview.current;
    if (el && !expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [expanded, children, open]);

  const result = answered ? APPROVAL_RESULT[status] : null;
  const statusText = result ? resultText ?? result.text : canAnswer ? 'Needs approval' : 'Not waiting for approval';
  const header = (
    <>
      <span className="ds-approval-tile">
        <Icon name={icon} size={15} />
      </span>
      <span className="ds-approval-headline">
        <span id={titleId} className="ds-approval-title">
          {title}
        </span>
        <span className={cx('ds-approval-status', result && `tone-${result.tone}`)}>
          {result?.icon && <Icon name={result.icon} size={13} />}
          {statusText}
          {summary && !open ? <span className="ds-approval-summary"> · {summary}</span> : null}
        </span>
      </span>
    </>
  );

  return (
    <div ref={card} role="group" aria-labelledby={titleId} data-testid="approval-card" {...rest} className={cx('ds-approval', interactive && 'ds-approval-live', className)} data-status={status}>
      {answered ? (
        <button ref={toggle} type="button" className="ds-approval-head ds-approval-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {header}
          <Icon name="chevron-down" size={14} className="ds-approval-chevron" />
        </button>
      ) : (
        <div className="ds-approval-head">{header}</div>
      )}
      {open && (
        <div className="ds-approval-body">
          {summary && <div className="ds-approval-sub">{summary}</div>}
          {description && <div className="ds-approval-desc">{description}</div>}
          {children && (
            <>
              <div ref={preview} className={cx('ds-approval-preview', !expanded && 'is-clipped', overflows && !expanded && 'is-faded')} style={expanded ? undefined : { maxHeight: previewHeight }}>
                {children}
              </div>
              {(overflows || expanded) && (
                <Button variant="link" className="ds-approval-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? 'Show less' : 'Show more'}
                </Button>
              )}
            </>
          )}
          {interactive && (
            <>
              <div className="ds-approval-actions">
                <Button variant="primary" disabled={busy} onClick={() => void run('approve', onApprove)}>
                  {pendingAction === 'approve' ? 'Sending…' : approveLabel}
                </Button>
                <Button disabled={busy} onClick={() => void run('deny', onDeny)}>
                  {pendingAction === 'deny' ? 'Sending…' : denyLabel}
                </Button>
              </div>
              {onAlwaysAllow && (
                <div className="ds-approval-always">
                  <Button variant="link" disabled={busy} onClick={() => void run('always', onAlwaysAllow)}>
                    {pendingAction === 'always' ? 'Sending…' : alwaysLabel}
                  </Button>
                  <span>{alwaysHint}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="ds-card-error">
          {error}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ask
export interface AskOption {
  id: string;
  label: ReactNode;
  /** A second line under the label. */
  hint?: ReactNode;
}

export interface AskCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect' | 'children' | 'role'> {
  /** The question, as markdown. */
  question: string;
  /** Background under the question. */
  detail?: ReactNode;
  options?: readonly AskOption[];
  /** Marks one option "(suggested)". */
  recommendedId?: string;
  /** Answer mode: called with an option id or the typed text. The card shows "Answered" once `answer` is set. */
  onAnswer?: (answer: string) => void | Promise<void>;
  /** Offer a free-text answer (always on when there are no options). */
  allowText?: boolean;
  textPlaceholder?: string;
  /**
   * Pick mode: options act as a radio group and nothing is sent; the screen sends all its
   * questions with one button. Pass the picked id and a setter.
   */
  selected?: string;
  onSelect?: (id: string) => void;
  /** The answer already given: an option id or text. Set it to close the card. */
  answer?: string;
  /** False when the run no longer waits for this answer. */
  canAnswer?: boolean;
  /** Native div props (`data-testid`, `id`, …) pass through to the card; `data-testid` defaults to `ask-card`. */
}

/** The agent asks the person a question: numbered options and/or a free-text answer. */
export function AskCard({ question, detail, options, recommendedId, onAnswer, allowText, textPlaceholder = 'Type your answer', selected, onSelect, answer, canAnswer = true, className, ...rest }: AskCardProps) {
  const qid = useId();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const answered = answer !== undefined;
  const settling = useSettling(!answered && !onSelect);
  const { pendingAction, error, run } = useAnswer();
  const busy = pendingAction !== null || settling;
  const pick = !!onSelect;
  const chosen = answered ? options?.find((o) => o.id === answer) : undefined;
  const showText = !pick && (allowText || !options?.length);
  const submit = (value: string) => {
    if (!onAnswer || !value.trim()) return;
    void run(value, async () => {
      await onAnswer(value.trim());
      // The buttons vanish with the answer: keep the keyboard in the conversation.
      document.querySelector<HTMLElement>('[data-composer-input]')?.focus();
    });
  };

  return (
    <div role="group" aria-labelledby={qid} data-testid="ask-card" {...rest} className={cx('ds-ask', className)}>
      <div id={qid} className="ds-ask-question">
        <Markdown text={question} />
      </div>
      {detail && <div className="ds-ask-detail">{detail}</div>}
      {answered ? (
        <div className="ds-ask-answered">
          <Icon name="check" size={13} />
          {chosen ? <>Answered: {chosen.label}</> : 'Answered'}
        </div>
      ) : !canAnswer ? (
        <div className="ds-ask-answered is-muted">No longer active</div>
      ) : (
        <>
          {!!options?.length && (
            <div className="ds-ask-options" role={pick ? 'radiogroup' : undefined} aria-labelledby={pick ? qid : undefined}>
              {options.map((o, i) => {
                const on = pick && selected === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={cx('ds-ask-option', on && 'is-on')}
                    role={pick ? 'radio' : undefined}
                    aria-checked={pick ? on : undefined}
                    disabled={busy}
                    onClick={() => (pick ? onSelect!(o.id) : submit(o.id))}
                  >
                    <span className="ds-ask-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="ds-ask-option-text">
                      <span>
                        {pendingAction === o.id ? 'Sending…' : o.label}
                        {o.id === recommendedId && <span className="ds-ask-rec"> (suggested)</span>}
                      </span>
                      {o.hint && <span className="ds-ask-hint">{o.hint}</span>}
                    </span>
                    {on && <Icon name="check" size={14} className="ds-ask-check" />}
                  </button>
                );
              })}
            </div>
          )}
          {showText &&
            (options?.length && !typing ? (
              <Button variant="link" className="ds-ask-other" disabled={busy} onClick={() => setTyping(true)}>
                Something else…
              </Button>
            ) : (
              <form
                className="ds-ask-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(text);
                }}
              >
                <TextInput aria-label="Answer" value={text} onChange={(e) => setText(e.target.value)} placeholder={textPlaceholder} disabled={busy} autoFocus={typing} />
                <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
                  {pendingAction && pendingAction === text.trim() ? 'Sending…' : 'Send answer'}
                </Button>
              </form>
            ))}
        </>
      )}
      {error && (
        <p role="alert" className="ds-card-error">
          {error}
        </p>
      )}
    </div>
  );
}
