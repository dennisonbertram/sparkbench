// A short guided tour that points at the real UI regions.
import React, { useLayoutEffect, useState } from 'react';
import { useStore } from './store';
import { Button, Coachmark } from './ds';

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
  const close = () => {
    useStore.getState().set({ tourStep: null });
    try {
      localStorage.setItem('sparkbench.tour.done', '1');
    } catch {}
  };
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
  }, [i]);
  const last = i >= steps.length - 1;
  return (
    <div className="tour">
      <div className="tour-backdrop" onClick={close} aria-hidden />
      {rect && <div className="tour-ring" style={{ left: rect.left - 6, top: Math.max(2, rect.top - 6), width: rect.width + 12, height: Math.min(rect.height + 12, window.innerHeight - Math.max(2, rect.top - 6) - 2) }} />}
      <Coachmark
        className="tour-card"
        anchorRect={rect}
        onClose={close}
        trapFocus
        focusKey={i}
        step={`Step ${i + 1} of ${steps.length}`}
        title={s.title}
        actions={
          <>
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
          </>
        }
      >
        <p>{touch() && 'touchBody' in s ? s.touchBody : s.body}</p>
      </Coachmark>
    </div>
  );
}

function targetOf(t: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(t === 'breadboard' ? '[data-testid="breadboard"]' : `[data-tour="${t}"]`);
}
