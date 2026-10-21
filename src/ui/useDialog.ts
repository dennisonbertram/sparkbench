// Keyboard behaviour shared by dialogs, side panels, menus and the tour: focus moves inside on open,
// Tab stays inside, Escape closes, and focus goes back to whatever opened it.
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, newest last: only the top one reacts to Escape and Tab. */
const stack: object[] = [];

export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void, opts: { trap?: boolean; autoFocus?: boolean } = {}) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const { trap = true, autoFocus = true } = opts;
  useEffect(() => {
    const me = {};
    stack.push(me);
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (el && autoFocus) {
      const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('input:not([disabled]):not([type=hidden]), textarea:not([disabled])') ?? el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      const node = ref.current;
      if (!node || stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !trap) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (!node.contains(document.activeElement)) {
        e.preventDefault();
        a.focus();
      } else if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      stack.splice(stack.indexOf(me), 1);
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

/** Popup menus: close on Escape, outside click/tap or focus leaving; returns a ref for the anchor. */
export function useMenu<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close.current();
        (ref.current?.querySelector('[aria-haspopup]') as HTMLElement | null)?.focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) close.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);
  return ref;
}

/** Keep a menu inside the viewport: flips it to whichever side of its anchor has room. */
export function fitMenu(el: HTMLElement | null) {
  if (!el) return;
  el.style.left = '';
  el.style.right = '';
  const r = el.getBoundingClientRect();
  if (r.left < 8) {
    el.style.left = '0';
    el.style.right = 'auto';
  } else if (r.right > window.innerWidth - 8) {
    el.style.right = '0';
    el.style.left = 'auto';
  }
}
