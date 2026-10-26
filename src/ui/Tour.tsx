// A short guided tour that points at the real UI regions.
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { useDialog } from './useDialog';
import { Button } from './ds';

const touch = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

const STEPS = [
  { target: 'copilot', title: 'Talk to the copilot', body: 'Describe a gadget or ask for changes in plain words — “add a buzzer”, “use a Pico instead”. It re-wires and re-codes the design for you.' },
  {
    target: 'breadboard',
    title: 'Your wiring',
    body: 'Every part and wire is real. Drag parts around, hover a pin to see what it connects to, or click two pins to add a wire.',
    touchBody: 'Every part and wire is real. Drag parts around, tap a part to learn what it does, or tap two pins to add a wire.',
  },
  { target: 'run', title: 'Run it', body: 'Press Run to start the simulator. The exact Python code that would run on the board runs here. Press buttons, turn knobs and move the sensor sliders that appear under each part.' },
  { target: 'tabs', title: 'Your outputs', body: 'Schematic, Code, Parts list with prices, a step-by-step Build guide, a Circuit board you can order and a Blog post — all kept in sync with the design.' },
  { target: 'console', title: 'Serial monitor, problems and tests', body: 'See what your program prints, a checklist of wiring problems with plain-English fixes, and Tests that check the gadget does what you asked.' },
  { target: 'inspector', title: 'Next steps', body: 'This panel describes your project and suggests what to do next. Click any part to see what it does and change its settings here.' },
  { target: 'board', title: 'Your board', body: 'When you have the real hardware, plug it in over USB and use Your board to install the program and check the wiring.' },
];

export function Tour() {
  const step = useStore((s) => s.tourStep) ?? 0;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(220);
  const close = () => {
    useStore.getState().set({ tourStep: null });
    try {
      localStorage.setItem('sparkbench.tour.done', '1');
    } catch {}
  };
  const ref = useDialog<HTMLDivElement>(close);
  const card = useRef<HTMLDivElement>(null);
  const steps = STEPS.filter((x) => targetOf(x.target));
  const i = Math.min(step, steps.length - 1);
  const s = steps[i] ?? STEPS[0];
  useLayoutEffect(() => {
    const el = targetOf(s.target);
    if (!el) return setRect(null);
    // Bring the target on screen first (on a phone the panels are stacked in one scrolling column).
    const r0 = el.getBoundingClientRect();
    if (r0.top < 0 || r0.bottom > window.innerHeight) el.scrollIntoView({ block: r0.height > window.innerHeight * 0.6 ? 'start' : 'center' });
    setRect(el.getBoundingClientRect());
    if (card.current) setCardH(card.current.offsetHeight);
    (card.current?.querySelector<HTMLElement>('[data-autofocus]') ?? card.current)?.focus({ preventScroll: true });
  }, [i]);
  useLayoutEffect(() => {
    if (card.current && Math.abs(card.current.offsetHeight - cardH) > 2) setCardH(card.current.offsetHeight);
  });
  const pos = rect ? placeCard(rect, cardH) : { left: Math.max(8, window.innerWidth / 2 - 170), top: 120 };
  const last = i >= steps.length - 1;
  return (
    <div className="tour" ref={ref}>
      <div className="tour-backdrop" onClick={close} aria-hidden />
      {rect && <div className="tour-ring" style={{ left: rect.left - 6, top: Math.max(2, rect.top - 6), width: rect.width + 12, height: Math.min(rect.height + 12, window.innerHeight - Math.max(2, rect.top - 6) - 2) }} />}
      <div className="tour-card" style={pos} ref={card} role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1}>
        <div className="tour-step">
          Step {i + 1} of {steps.length}
        </div>
        <h3 id="tour-title">{s.title}</h3>
        <p>{touch() && 'touchBody' in s ? s.touchBody : s.body}</p>
        <div className="tour-actions">
          <Button variant="ghost" onClick={close}>
            Skip tour
          </Button>
          {i > 0 && (
            <Button variant="ghost" onClick={() => useStore.getState().set({ tourStep: i - 1 })}>
              Back
            </Button>
          )}
          {!last ? (
            <Button variant="primary" onClick={() => useStore.getState().set({ tourStep: i + 1 })} data-autofocus>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={close} data-autofocus>
              Got it
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function targetOf(t: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(t === 'breadboard' ? '[data-testid="breadboard"]' : `[data-tour="${t}"]`);
}

/** Put the card beside, above or below the highlighted area, never off screen. */
function placeCard(r: DOMRect, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = Math.min(340, vw - 16);
  const M = 12;
  const clampTop = (t: number) => Math.min(vh - h - M, Math.max(M, t));
  const clampLeft = (l: number) => Math.min(vw - W - 8, Math.max(8, l));
  if (r.right + W + 24 < vw) return { left: r.right + 16, top: clampTop(r.top + 20), width: W };
  if (r.left - W - 24 > 0) return { left: r.left - W - 16, top: clampTop(r.top + 20), width: W };
  if (r.top - h - 14 > M) return { left: clampLeft(r.left + 20), top: r.top - h - 14, width: W };
  if (r.bottom + h + 14 < vh - M) return { left: clampLeft(r.left), top: r.bottom + 14, width: W };
  // The target fills the screen: sit at the bottom so the top of the target stays visible.
  return { left: clampLeft(r.left + 20), top: vh - h - M, width: W };
}
