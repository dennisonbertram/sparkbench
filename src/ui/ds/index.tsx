// Sparkbench design system: the only place UI building blocks are defined. Screens compose these;
// they don't style raw <button>, <input>, banners, chips, menus, tabs or dialogs themselves.
// Catalog and rules: docs/design/design-system.md. Styles: ./ds.css (tokens too), loaded first by main.tsx.
import { forwardRef, useId, useLayoutEffect, useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type DetailsHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { fitMenu, useDialog, useMenu } from '../useDialog';
import { Icon } from './ai';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ') || undefined;

/** Point several refs (callback or object) at one element. */
function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (el: T | null) => {
    for (const r of refs) {
      if (typeof r === 'function') r(el);
      else if (r) (r as { current: T | null }).current = el;
    }
  };
}

// ------------------------------------------------------------------ actions
export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'link' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: the one main action in view (ink). ghost: toolbar and quiet actions. link: inline text action. */
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  /** Toggled on (for ghost toggles such as "Sound on"). */
  on?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'default', size = 'md', on, className, type = 'button', ...rest }, ref) {
  return <button ref={ref} type={type} className={cx(variant !== 'default' && variant, size === 'sm' && 'small', size === 'lg' && 'big', on && 'on', className)} {...rest} />;
});

const buttonClass = (variant: ButtonVariant, size: ButtonProps['size']) => cx(variant !== 'default' && variant, size === 'sm' && 'small', size === 'lg' && 'big');

/** A link that looks like a Button: downloads and "open in a new tab". Same variants and sizes as Button. */
export const ButtonLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & Pick<ButtonProps, 'variant' | 'size'>>(function ButtonLink({ variant = 'default', size = 'md', className, ...rest }, ref) {
  return <a ref={ref} className={cx('ds-button-link', buttonClass(variant, size), className)} {...rest} />;
});

/** Square icon-only button. Always needs a label for screen readers. */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'aria-label'> & { label: string }>(function IconButton({ label, variant = 'ghost', className, ...rest }, ref) {
  return <Button ref={ref} variant={variant} aria-label={label} title={rest.title ?? label} className={cx('icon-btn', className)} {...rest} />;
});

// ------------------------------------------------------------------ form controls
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ type = 'text', ...rest }, ref) {
  return <input ref={ref} type={type} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(props, ref) {
  return <textarea ref={ref} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return <select ref={ref} {...props} />;
});

/** A labelled form row: label above the control (or, with layout="row", to its left), optional hint below. */
export function Field({ label, hint, children, className, layout = 'stack' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; layout?: 'stack' | 'row' }) {
  return (
    <label className={cx('ds-field', layout === 'row' && 'row', className)}>
      <span className="ds-field-label">{label}</span>
      {children}
      {hint && <small className="ds-field-hint">{hint}</small>}
    </label>
  );
}

// ------------------------------------------------------------------ status and labels
export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'error';

/** A message across a panel or the page: what happened and, if needed, one action. */
export function Banner({ tone = 'neutral', variant = 'inset', className, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: Tone; variant?: 'inset' | 'strip' | 'inline' }) {
  const role = rest.role ?? (tone === 'error' ? 'alert' : undefined);
  // inset: a rounded box inside a panel. strip: full width across the page, under the top bar.
  // inline: a problem row in a list or form, with a coloured bar on the left and no outer margin.
  return <div role={role} className={cx('banner', variant !== 'inset' && variant, tone !== 'neutral' && tone, className)} {...rest} />;
}

/** Small rounded label: tags and counts in text. `board` is the target-board chip in the top bar (hidden on narrow screens). */
export function Chip({ variant = 'default', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { variant?: 'default' | 'board' }) {
  return <span className={cx(variant === 'board' ? 'board-chip' : 'chip', className)} {...rest} />;
}

// ------------------------------------------------------------------ surfaces
/** Bordered surface. Pass onClick to make the whole card a button. */
export function Card({ onClick, className, children, ...rest }: HTMLAttributes<HTMLElement> & { onClick?: () => void }) {
  if (onClick)
    return (
      <button type="button" className={cx('card', className)} onClick={onClick} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    );
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * A Card that folds: the summary is always shown, the children when open. `plain` drops the card
 * border, for a smaller disclosure inside another surface. `defaultOpen` only sets the first state.
 */
export function Disclosure({ summary, defaultOpen, onToggle, variant = 'card', className, children, ...rest }: Omit<DetailsHTMLAttributes<HTMLDetailsElement>, 'onToggle' | 'open' | 'summary'> & { summary: ReactNode; defaultOpen?: boolean; onToggle?: (open: boolean) => void; variant?: 'card' | 'plain' }) {
  const [initial] = useState(!!defaultOpen);
  return (
    <details className={cx('ds-disclosure', variant === 'plain' && 'plain', className)} open={initial} onToggle={(e) => onToggle?.(e.currentTarget.open)} {...rest}>
      <summary>
        <Icon name="chevron-right" size={12} className="ds-disclosure-chevron" />
        <span className="ds-disclosure-summary">{summary}</span>
      </summary>
      <div className="ds-disclosure-body">{children}</div>
    </details>
  );
}

/** Panel header: a title on the left, actions on the right. */
export function PanelHead({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cx('panel-head', className)}>
      <h2>{title}</h2>
      {children && <span className="panel-head-actions">{children}</span>}
    </header>
  );
}

// ------------------------------------------------------------------ overlays
/** Modal dialog with a scrim. Focus is trapped inside; Escape and the close button call onClose. */
export function Modal({ title, onClose, children, className, closeLabel = 'Close' }: { title: string; onClose: () => void; children: ReactNode; className?: string; closeLabel?: string }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', className)} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <PanelHead title={title}>
          <IconButton label={closeLabel} onClick={onClose}>
            ✕
          </IconButton>
        </PanelHead>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export type Placement = 'auto' | 'right' | 'left' | 'top' | 'bottom';

/** Where a floating panel of size w × h goes next to `r`, kept on screen. `auto` tries right, left, above, below. */
export function placePopover(r: DOMRect | null, h: number, w: number, placement: Placement = 'auto'): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = Math.min(w, vw - 16);
  const M = 12;
  if (!r) return { left: Math.max(8, vw / 2 - W / 2), top: 120, width: W };
  const clampTop = (t: number) => Math.min(vh - h - M, Math.max(M, t));
  const clampLeft = (l: number) => Math.min(vw - W - 8, Math.max(8, l));
  const fits = { right: r.right + W + 24 < vw, left: r.left - W - 24 > 0, top: r.top - h - 14 > M, bottom: r.bottom + h + 14 < vh - M };
  const at = {
    right: { left: r.right + 16, top: clampTop(r.top + 20), width: W },
    left: { left: r.left - W - 16, top: clampTop(r.top + 20), width: W },
    top: { left: clampLeft(r.left + 20), top: r.top - h - 14, width: W },
    bottom: { left: clampLeft(r.left), top: r.bottom + 14, width: W },
  };
  if (placement !== 'auto' && fits[placement]) return at[placement];
  for (const p of ['right', 'left', 'top', 'bottom'] as const) if (fits[p]) return at[p];
  // The anchor fills the screen: sit at the bottom so its top stays visible.
  return { left: clampLeft(r.left + 20), top: vh - h - M, width: W };
}

export interface PopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  /** Accessible name. Or pass `aria-labelledby` pointing at a visible title. */
  label?: string;
  /** Escape calls it; focus goes back to the opener when the popover unmounts. */
  onClose: () => void;
  /** Keep Tab inside the panel (and mark it aria-modal). Off by default: a popover is non-modal. */
  trapFocus?: boolean;
  /** The element's box it points at (from getBoundingClientRect). Without it the panel sits centred near the top. */
  anchorRect?: DOMRect | null;
  placement?: Placement;
  /** Width in px (capped to the screen). */
  width?: number;
  /** When this changes, focus moves back to the panel's [data-autofocus] element (e.g. the next step). */
  focusKey?: unknown;
}

/** A non-modal floating panel next to an element: hints, coachmarks, quick details. Fixed-positioned, kept on screen. */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover({ label, onClose, trapFocus = false, anchorRect = null, placement = 'auto', width = 340, focusKey, className, style, children, ...rest }, ref) {
  const own = useDialog<HTMLDivElement>(onClose, { trap: trapFocus });
  const [h, setH] = useState(200);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = own.current;
    if (el && Math.abs(el.offsetHeight - h) > 2) setH(el.offsetHeight);
  });
  useLayoutEffect(() => {
    if (first.current) return void (first.current = false);
    const el = own.current;
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el)?.focus({ preventScroll: true });
  }, [focusKey]);
  return (
    <div ref={mergeRefs(own, ref)} role="dialog" aria-modal={trapFocus || undefined} aria-label={label} tabIndex={-1} className={cx('ds-popover', className)} style={{ ...placePopover(anchorRect, h, width, placement), ...style }} {...rest}>
      {children}
    </div>
  );
});

/** A Popover that teaches one thing: "Step 2 of 6", a title, a sentence or two and its buttons (tours, first-run hints). */
export const Coachmark = forwardRef<HTMLDivElement, Omit<PopoverProps, 'label' | 'title'> & { title: ReactNode; step?: ReactNode; actions?: ReactNode }>(function Coachmark({ title, step, actions, children, className, ...rest }, ref) {
  const id = useId();
  return (
    <Popover ref={ref} aria-labelledby={id} className={cx('ds-coachmark', className)} {...rest}>
      {step && <div className="ds-coachmark-step">{step}</div>}
      <h3 id={id} className="ds-coachmark-title">{title}</h3>
      <div className="ds-coachmark-body">{children}</div>
      {actions && <div className="ds-coachmark-actions">{actions}</div>}
    </Popover>
  );
});

/** Drop-down menu panel; position it inside a MenuAnchor. `align="start"` lines it up with the trigger's left edge. */
export const Menu = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }>(function Menu({ className, align = 'end', ...rest }, ref) {
  return <div ref={ref} role="menu" className={cx('menu', align === 'start' && 'start', className)} {...rest} />;
});

export const MenuAnchor = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function MenuAnchor({ className, ...rest }, ref) {
  return <div ref={ref} className={cx('menu-anchor', className)} {...rest} />;
});

/** A menu row with a main item and a trailing action (e.g. a recent project and its delete button). */
export function MenuRow({ children }: { children: ReactNode }) {
  return <div className="menu-row">{children}</div>;
}

export function MenuItem(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" role="menuitem" {...props} />;
}

/** A section heading inside a menu, with a divider above it. */
export function MenuSection({ children }: { children: ReactNode }) {
  return <div className="menu-sep">{children}</div>;
}

export function MenuNote({ children }: { children: ReactNode }) {
  return <div className="menu-note">{children}</div>;
}

/** Move focus between the menu's items with the arrow keys, Home and End. */
function menuKeys(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')];
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[n].focus();
}

/**
 * A button that opens a Menu of MenuItems below it ("Files for engineering tools ▾"). Escape, a click
 * outside or picking an item closes it; arrow keys move between items.
 */
export function DisclosureMenu({ label, children, align = 'start', variant = 'default', size = 'md', className, menuClassName, title }: { label: ReactNode; children: ReactNode; align?: 'start' | 'end'; variant?: ButtonVariant; size?: ButtonProps['size']; className?: string; menuClassName?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const anchor = useMenu<HTMLDivElement>(open, () => setOpen(false));
  const focusFirst = useRef(false);
  useLayoutEffect(() => {
    if (!open) return;
    fitMenu(menu.current);
    if (focusFirst.current) menu.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
    focusFirst.current = false;
  }, [open]);
  return (
    <MenuAnchor ref={anchor} className={cx('ds-disclosure-menu', className)}>
      <Button
        variant={variant}
        size={size}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown') return;
          e.preventDefault();
          if (open) return menu.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
          focusFirst.current = true;
          setOpen(true);
        }}
      >
        {label}
        <Icon name="chevron-down" size={12} className="ds-disclosure-menu-chevron" />
      </Button>
      {open && (
        <Menu
          ref={menu}
          align={align}
          className={menuClassName}
          onKeyDown={menuKeys}
          onClick={(e) => {
            if ((e.target as Element).closest('[role=menuitem]')) {
              setOpen(false);
              (anchor.current?.querySelector('[aria-haspopup]') as HTMLElement | null)?.focus();
            }
          }}
        >
          {children}
        </Menu>
      )}
    </MenuAnchor>
  );
}

// ------------------------------------------------------------------ navigation
export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Shown after the label: a count, a ✓, a running "…". */
  badge?: ReactNode;
  /** data-testid on the tab button. */
  testId?: string;
  title?: string;
}

export type TabsVariant = 'underline' | 'segmented' | 'file';

/**
 * Horizontal tabs. `underline`: the main view switcher, selected tab underlined in ink. `segmented`: a
 * compact pill group for switching a picture or mode (`tone="dark"` on a dark picture). `file`: file
 * names in monospace, as on the Code tab. `children` are trailing content at the end of the bar
 * (actions, a timer), outside the tablist itself. Arrow keys, Home and End move between tabs; only the
 * selected tab is in the Tab order.
 */
export function Tabs<T extends string>({ items, value, onChange, variant = 'underline', tone, label, children, className, ...rest }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; variant?: TabsVariant; tone?: 'dark'; label?: string; children?: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>) {
  const selected = items.some((t) => t.id === value) ? value : items[0]?.id;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[n].focus();
    onChange(items[n].id);
  };
  return (
    <div className={cx(variant === 'underline' ? 'tabs' : `ds-tabs ds-tabs-${variant}`, tone === 'dark' && 'dark', className)} {...rest}>
      <div role="tablist" aria-label={label} className="ds-tablist" onKeyDown={onKeyDown}>
        {items.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={selected === t.id} tabIndex={selected === t.id ? 0 : -1} className={selected === t.id ? 'active' : undefined} title={t.title} data-testid={t.testId} onClick={() => onChange(t.id)}>
            {t.label}
            {t.badge != null && t.badge !== false && <span className="ds-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      {children && <div className="ds-tabs-trail">{children}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ choices and pickers
type BoxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; className?: string };

/** Checkbox with its label to the right; the whole row is clickable. */
export function Checkbox({ label, className, ...rest }: BoxProps) {
  return (
    <label className={cx('ds-check', className)}>
      <input type="checkbox" {...rest} /> <span>{label}</span>
    </label>
  );
}

/** One option of a radio group: give every option the same name. */
export function Radio({ label, className, ...rest }: BoxProps) {
  return (
    <label className={cx('ds-check', className)}>
      <input type="radio" {...rest} /> <span>{label}</span>
    </label>
  );
}

/** Slider for a number in a range. */
export const Slider = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function Slider(props, ref) {
  return <input ref={ref} type="range" {...props} />;
});

export const ColorInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function ColorInput(props, ref) {
  return <input ref={ref} type="color" {...props} />;
});

/**
 * Opens the system file picker. Looks like a Button (or a menu row with `asMenuItem`).
 * The input is hidden; the visible part is the children.
 */
export const FilePicker = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & { children: ReactNode; variant?: ButtonVariant; asMenuItem?: boolean; className?: string }>(function FilePicker({ children, variant = 'default', asMenuItem, className, disabled, ...rest }, ref) {
  return (
    <label className={cx(asMenuItem ? 'menu-file' : 'ds-file', !asMenuItem && variant !== 'default' && variant, disabled && 'disabled', className)} aria-disabled={disabled || undefined}>
      {children}
      <input ref={ref} type="file" hidden disabled={disabled} {...rest} />
    </label>
  );
});

// ------------------------------------------------------------------ AI and chat (./ai.tsx)
export * from './ai';
