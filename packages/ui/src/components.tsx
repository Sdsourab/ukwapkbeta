import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon, type IconName } from './icons';

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ----------------------------------------------------------------- buttons */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: IconName;
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx('ukw-btn', `ukw-btn--${variant}`, `ukw-btn--${size}`, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Required accessible name (also used as tooltip). */
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

export function IconButton({ icon, label, size = 'md', active, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} className={cx('ukw-iconbtn', `ukw-iconbtn--${size}`, active && 'is-active', className)} aria-label={label} title={label} aria-pressed={active} {...rest}>
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  );
}

export function Chip({ label, colour, selected, onClick, onRemove, className }: { label: string; colour?: string; selected?: boolean; onClick?: () => void; onRemove?: () => void; className?: string }) {
  const body = (
    <>
      {colour ? <span className="ukw-chip__dot" style={{ background: colour }} aria-hidden /> : null}
      <span>{label}</span>
    </>
  );
  return (
    <span className={cx('ukw-chip', selected && 'is-selected', className)}>
      {onClick ? (
        <button type="button" className="ukw-chip__main" onClick={onClick} aria-pressed={selected}>{body}</button>
      ) : (
        <span className="ukw-chip__main">{body}</span>
      )}
      {onRemove ? (
        <button type="button" className="ukw-chip__x" onClick={onRemove} aria-label={`Remove ${label}`}>
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------- feedback */

export function Spinner({ size = 20, label = 'Loading' }: { size?: number; label?: string }) {
  return <span className="ukw-spinner" style={{ width: size, height: size }} role="status" aria-label={label} />;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ukw-skeleton" aria-hidden>
      {Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${90 - i * 14}%` }} />)}
    </div>
  );
}

export function EmptyState({ icon = 'book', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ukw-empty">
      <div className="ukw-empty__icon"><Icon name={icon} size={28} /></div>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action ? <div className="ukw-empty__action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="ukw-empty ukw-empty--error" role="alert">
      <div className="ukw-empty__icon"><Icon name="alert" size={28} /></div>
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
      {onRetry ? <div className="ukw-empty__action"><Button onClick={onRetry} icon="sync">Try again</Button></div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- toasts */

export interface ToastOptions {
  message: string;
  kind?: 'info' | 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds; 0 keeps it until dismissed. Errors default to 8s, others 5s. */
  duration?: number;
}
interface ToastItem extends ToastOptions { id: number }

const ToastContext = createContext<{ push: (t: ToastOptions) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((t: ToastOptions) => {
    const id = nextId.current++;
    setItems((l) => [...l.slice(-3), { ...t, id }]);
    const ms = t.duration ?? (t.kind === 'error' ? 8000 : 5000);
    if (ms > 0) setTimeout(() => dismiss(id), ms);
  }, [dismiss]);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ukw-toasts" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('ukw-toast', `ukw-toast--${t.kind ?? 'info'}`)} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            {t.actionLabel ? <button type="button" className="ukw-toast__action" onClick={() => { t.onAction?.(); dismiss(t.id); }}>{t.actionLabel}</button> : null}
            <button type="button" className="ukw-toast__close" aria-label="Dismiss" onClick={() => dismiss(t.id)}><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx.push;
}

/* ----------------------------------------------------------------- dialog */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0]!, last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ukw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={cx('ukw-dialog', wide && 'ukw-dialog--wide')} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ukw-dialog__head">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
        </div>
        <div className="ukw-dialog__body">{children}</div>
        {footer ? <div className="ukw-dialog__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- form controls */

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string; icon?: IconName }>; onChange: (v: T) => void }) {
  return (
    <div className="ukw-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={cx('ukw-segmented__opt', o.value === value && 'is-selected')} onClick={() => onChange(o.value)}>
          {o.icon ? <Icon name={o.icon} size={16} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId();
  const descId = hint || error ? `${id}-d` : undefined;
  return (
    <div className="ukw-field">
      <label htmlFor={id}>{label}</label>
      {children(id, descId)}
      {error ? <p id={descId} className="ukw-field__error" role="alert">{error}</p> : hint ? <p id={descId} className="ukw-field__hint">{hint}</p> : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('ukw-input', className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('ukw-input ukw-textarea', className)} {...rest} />;
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="ukw-switchrow">
      <div>
        <label htmlFor={id}>{label}</label>
        {hint ? <p className="ukw-field__hint">{hint}</p> : null}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} className={cx('ukw-switch', checked && 'is-on')} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ukw-kbd">{children}</kbd>;
}

/* ----------------------------------------------------------------- hooks */

/** Debounced callback that always calls the latest function and can be flushed (autosave). */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<A | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) {
      const a = pending.current;
      pending.current = null;
      fnRef.current(...a);
    }
  }, []);
  const call = useCallback((...args: A) => {
    pending.current = args;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [delay, flush]);
  useEffect(() => flush, [flush]); // flush on unmount so edits are never lost
  return { call, flush };
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof matchMedia === 'function' ? matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
