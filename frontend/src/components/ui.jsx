// Shared building blocks so every page has the same header, cards, badges, buttons and modals.
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';

export function PageShell({ children, wide = false, className = '' }) {
  return (
    <div className={`min-h-[calc(100svh-64px)] px-4 sm:px-6 lg:px-8 py-8 sm:py-10 ${className}`}>
      <div className={`${wide ? 'max-w-7xl' : 'max-w-6xl'} mx-auto space-y-6`}>{children}</div>
    </div>
  );
}

export function PageHeader({ icon: Icon, eyebrow, title, subtitle, actions }) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div className="flex items-start gap-4">
        {Icon && (
          <span className="hidden sm:flex shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-400 to-sky-500 text-ink-950 items-center justify-center shadow-glow">
            <Icon className="w-6 h-6" aria-hidden="true" />
          </span>
        )}
        <div>
          {eyebrow && <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</div>}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm sm:text-[15px] text-slate-600 max-w-2xl">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = '', as: Tag = 'div', ...props }) {
  return (
    <Tag className={`bg-white rounded-2xl border border-slate-200/80 shadow-card ${className}`} {...props}>
      {children}
    </Tag>
  );
}

const TONES = {
  brand: 'text-brand-700 bg-brand-50',
  sky: 'text-sky-700 bg-sky-50',
  amber: 'text-amber-700 bg-amber-50',
  rose: 'text-rose-700 bg-rose-50',
  violet: 'text-violet-700 bg-violet-50',
  slate: 'text-slate-700 bg-slate-100',
};

export function Stat({ icon: Icon, label, value, hint, tone = 'brand' }) {
  return (
    <Card className="p-4 sm:p-5 flex items-start gap-3.5">
      {Icon && (
        <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-slate-500">{label}</div>
        <div className="text-xl sm:text-2xl font-extrabold text-slate-900 font-display tabular-nums truncate">{value}</div>
        {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
      </div>
    </Card>
  );
}

const BADGE = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  brand: 'bg-brand-50 text-brand-800 ring-brand-600/20',
};

export function Badge({ tone = 'slate', children, dot = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${BADGE[tone]}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

const STATUS = {
  CONFIRMED: ['green', 'Confirmed'],
  COMPLETED: ['slate', 'Completed'],
  OCCUPIED: ['sky', 'Charging now'],
  HELD: ['amber', 'Awaiting payment'],
  PENDING: ['amber', 'Pending'],
  CANCELLED: ['rose', 'Cancelled'],
};

export function StatusBadge({ status }) {
  const [tone, label] = STATUS[status] || ['slate', status || 'Unknown'];
  return <Badge tone={tone} dot>{label}</Badge>;
}

const BTN = {
  primary: 'text-ink-950 bg-gradient-to-r from-brand-300 to-sky-400 shadow-glow hover:brightness-105',
  solid: 'text-white bg-brand-600 hover:bg-brand-700 shadow-sm',
  dark: 'text-white bg-brand-700 hover:bg-brand-800',
  secondary: 'text-slate-700 bg-white ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'text-rose-700 bg-white ring-1 ring-inset ring-rose-200 hover:bg-rose-50',
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, children, className = '', as: Tag = 'button', ...props }) {
  const sizes = { sm: 'px-3 py-1.5 text-[13px] gap-1.5', md: 'px-4 py-2.5 text-sm gap-2', lg: 'px-5 py-3 text-[15px] gap-2' };
  return (
    <Tag
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition disabled:opacity-60 disabled:pointer-events-none ${sizes[size]} ${BTN[variant]} ${className}`}
      disabled={Tag === 'button' ? loading || props.disabled : undefined}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
      {children}
    </Tag>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <Card className="p-10 sm:p-14 text-center">
      {Icon && (
        <span className="mx-auto w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
          <Icon className="w-7 h-7" aria-hidden="true" />
        </span>
      )}
      <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
      {text && <p className="mt-1.5 text-sm text-slate-600 max-w-sm mx-auto">{text}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </Card>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />;
}

// Accessible modal: Escape and backdrop click close it, focus moves inside and returns afterwards.
// Rendered into <body> so it always sits above the navbar (the page stage is its own stacking context).
export function Modal({ open, onClose, title, children, size = 'md' }) {
  const panel = useRef(null);
  // Callers often pass an inline onClose; keep it in a ref so re-renders (e.g. typing in a field)
  // don't re-run the open effect, which would pull focus out of the input.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`popover relative w-full ${widths[size]} max-h-[92svh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl outline-none`}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur flex items-center justify-between gap-4 px-6 pt-5 pb-3 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
