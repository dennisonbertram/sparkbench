// Sparkbench design system: the only place UI building blocks are defined. Screens compose these;
// they don't style raw <button>, <input>, banners, chips, menus, tabs or dialogs themselves.
// Catalog and rules: docs/design/design-system.md. Styles: ./ds.css (tokens too), loaded first by main.tsx.
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useDialog } from '../useDialog';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ') || undefined;

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

/** A labelled form row: label above the control, optional hint below. */
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('ds-field', className)}>
      <span className="ds-field-label">{label}</span>
      {children}
      {hint && <small className="ds-field-hint">{hint}</small>}
    </label>
  );
}

// ------------------------------------------------------------------ status and labels
export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'error';

/** A message across a panel or the page: what happened and, if needed, one action. */
export function Banner({ tone = 'neutral', variant = 'inset', className, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: Tone; variant?: 'inset' | 'strip' }) {
  const role = rest.role ?? (tone === 'error' ? 'alert' : undefined);
  // inset: a rounded box inside a panel. strip: full width across the page, under the top bar.
  return <div role={role} className={cx('banner', variant === 'strip' && 'strip', tone !== 'neutral' && tone, className)} {...rest} />;
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

/** Drop-down menu panel; position it inside a MenuAnchor. */
export const Menu = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Menu({ className, ...rest }, ref) {
  return <div ref={ref} role="menu" className={cx('menu', className)} {...rest} />;
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

// ------------------------------------------------------------------ navigation
export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

/** Horizontal tabs. The selected tab is underlined in ink. */
export function Tabs<T extends string>({ items, value, onChange, className, ...rest }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; className?: string } & Omit<HTMLAttributes<HTMLElement>, 'onChange'>) {
  return (
    <nav className={cx('tabs', className)} role="tablist" {...rest}>
      {items.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? 'active' : undefined} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </nav>
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
