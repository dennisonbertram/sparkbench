import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AskCard, ApprovalCard, ChatMessage, Composer, ComposerError, LoadingState, Markdown, ToolCall, ToolCallGroup, ToolCallList, formatElapsed } from '../../src/ui/ds';

const html = (el: JSX.Element) => renderToStaticMarkup(el);

describe('ds: AI and chat', () => {
  it('formats elapsed time like Praci', () => {
    expect(formatElapsed(0, 1234)).toBe('1.2s');
    expect(formatElapsed(0, 62_300)).toBe('1m 2.3s');
    expect(formatElapsed(0, 125_000)).toBe('2m 5s');
  });

  it('shimmers a running tool call and names its state for screen readers', () => {
    const out = html(<ToolCall label="Placing parts" state="running" count={3} />);
    expect(out).toContain('data-state="running"');
    expect(out).toContain('ds-shimmer');
    expect(out).toContain('In progress: ');
    expect(out).toContain('×3');
  });

  it('shows the summary once a tool call is done, and its steps as a disclosure', () => {
    const out = html(<ToolCall label="Running checks" state="done" summary="Ran 12 checks" lines={[{ text: 'Pin conflict', failed: true }]} />);
    expect(out).toContain('Ran 12 checks');
    expect(out).not.toContain('Running checks');
    expect(out).toContain('<details');
    expect(out).toContain('class="failed"');
  });

  it('windows a long list and labels the group', () => {
    const steps = Array.from({ length: 9 }, (_, i) => ({ label: `Step ${i}` }));
    const out = html(
      <ToolCallGroup live count={9}>
        <ToolCallList steps={steps} limit={6} />
      </ToolCallGroup>,
    );
    expect(out).toContain('+3 earlier steps');
    expect(out).toContain('Working… · 9 tools');
    expect(out).toContain(' open=""');
    expect(html(<ToolCallGroup live={false} count={1} durationMs={42_000}>x</ToolCallGroup>)).toContain('Done · 1 tool · 42s');
  });

  it('renders assistant markdown and escapes raw HTML and script links', () => {
    expect(html(<ChatMessage from="assistant" text="**Hi** there" />)).toContain('<strong>Hi</strong>');
    expect(html(<ChatMessage from="user" text="**literal**" />)).toContain('**literal**');
    const out = html(<Markdown text={'<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))'} />);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('javascript:');
  });

  it('labels the composer and switches Send to Stop while busy', () => {
    const idle = html(<Composer value="" onChange={() => {}} onSend={() => {}} label="Message the copilot" />);
    expect(idle).toContain('aria-label="Message the copilot"');
    expect(idle).toMatch(/aria-label="Send"[^>]*disabled/);
    const busy = html(<Composer value="hi" onChange={() => {}} onSend={() => {}} onStop={() => {}} busy label="m" error="Network down" />);
    expect(busy).toContain('aria-label="Stop"');
    expect(busy).toContain('role="alert"');
    expect(html(<ComposerError message="x" onRetry={() => {}} />)).toContain('Retry');
  });

  it('offers approve, deny and always-allow while pending, and a result once answered', () => {
    const pending = html(<ApprovalCard title="Change main.py" onApprove={() => {}} onDeny={() => {}} onAlwaysAllow={() => {}} />);
    expect(pending).toContain('Needs approval');
    expect(pending).toContain('Approve');
    expect(pending).toContain('Always allow this');
    const done = html(<ApprovalCard title="Change main.py" status="denied" onApprove={() => {}} onDeny={() => {}} />);
    expect(done).toContain('Denied');
    expect(done).toContain('aria-expanded="false"');
    expect(done).not.toContain('>Approve<');
  });

  it('asks with numbered options, or as a radio group in pick mode', () => {
    const opts = [
      { id: 'a', label: 'ESP32' },
      { id: 'b', label: 'Pico' },
    ];
    const ask = html(<AskCard question="Which board?" options={opts} recommendedId="a" onAnswer={() => {}} />);
    expect(ask).toContain('(suggested)');
    expect(ask).not.toContain('role="radio"');
    const pick = html(<AskCard question="Which board?" options={opts} selected="b" onSelect={() => {}} />);
    expect(pick).toContain('role="radiogroup"');
    expect(pick).toContain('aria-checked="true"');
    expect(html(<AskCard question="Which board?" options={opts} answer="b" />)).toContain('Answered: Pico');
  });

  it('renders a loading state as a status', () => {
    expect(html(<LoadingState label="Designing your circuit" detail="Wiring" />)).toContain('role="status"');
  });
});
