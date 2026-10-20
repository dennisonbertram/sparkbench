// A short guided tour that points at the real UI regions.
import React, { useLayoutEffect, useState } from 'react';
import { useStore } from './store';

const STEPS = [
  { target: 'copilot', title: 'Talk to the copilot', body: 'Describe a gadget or ask for changes in plain words — “add a buzzer”, “use a Pico instead”. It re-wires and re-codes the design for you.' },
  { target: 'breadboard', title: 'Your breadboard', body: 'Every part and wire is real. Drag parts around, hover a pin to see what it connects to, or click two pins to add a wire.' },
  { target: 'run', title: 'Run it', body: 'Press Run to start the simulator. The exact Python code that would run on the board runs here. Press buttons, turn knobs and move the sensor sliders that appear under each part.' },
  { target: 'tabs', title: 'Your outputs', body: 'Schematic (with KiCad export), Code, Parts list with prices, a step-by-step Build guide and a Blog post — all kept in sync with the design.' },
  { target: 'console', title: 'Serial monitor & problems', body: 'See what your program prints, and a checklist of wiring problems with plain-English explanations and one-click fixes.' },
];

export function Tour() {
  const step = useStore((s) => s.tourStep) ?? 0;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const s = STEPS[step];
  useLayoutEffect(() => {
    const el = s.target === 'breadboard' ? document.querySelector('[data-testid="breadboard"]') : document.querySelector(`[data-tour="${s.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);
  const close = () => {
    useStore.getState().set({ tourStep: null });
    try {
      localStorage.setItem('sparkbench.tour.done', '1');
    } catch {}
  };
  const pos = rect ? placeCard(rect) : { left: window.innerWidth / 2 - 170, top: 120 };
  return (
    <div className="tour" role="dialog" aria-label="Guided tour">
      {rect && <div className="tour-ring" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div className="tour-card" style={pos}>
        <div className="tour-step">
          Step {step + 1} of {STEPS.length}
        </div>
        <h3>{s.title}</h3>
        <p>{s.body}</p>
        <div className="tour-actions">
          <button className="ghost" onClick={close}>
            Skip tour
          </button>
          {step > 0 && (
            <button className="ghost" onClick={() => useStore.getState().set({ tourStep: step - 1 })}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="primary" onClick={() => useStore.getState().set({ tourStep: step + 1 })}>
              Next
            </button>
          ) : (
            <button className="primary" onClick={close}>
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function placeCard(r: DOMRect) {
  const W = 340;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (r.right + W + 24 < vw) return { left: r.right + 16, top: Math.min(vh - 230, Math.max(16, r.top + 20)) };
  if (r.left - W - 24 > 0) return { left: r.left - W - 16, top: Math.min(vh - 230, Math.max(16, r.top + 20)) };
  if (r.bottom + 220 < vh) return { left: Math.min(vw - W - 16, Math.max(16, r.left)), top: r.bottom + 14 };
  return { left: Math.min(vw - W - 16, Math.max(16, r.left + 20)), top: Math.max(16, r.top + 20) };
}
