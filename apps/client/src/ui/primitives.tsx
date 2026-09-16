import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Alvo de toque confortável — usado nas barras de ação do celular. */
  size?: 'sm' | 'md' | 'lg';
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-grape-400 text-white hover:bg-grape-300 active:bg-grape-500',
  ghost: 'bg-ink-800/80 text-ink-200 hover:bg-ink-700 active:bg-ink-600 border border-ink-700',
  subtle: 'bg-transparent text-ink-300 hover:bg-ink-800 active:bg-ink-700',
  danger: 'bg-flame text-white hover:brightness-110',
};

const SIZES = {
  sm: 'h-8 px-2.5 text-xs rounded-lg',
  md: 'h-10 px-3.5 text-sm rounded-xl',
  // 48px é o mínimo confortável para o polegar; a barra do celular usa isto.
  lg: 'h-12 px-4 text-sm rounded-xl',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  ...props
}: ButtonProps): ReactNode {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 font-semibold transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grape-300',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return <div className={clsx('panel', className)}>{children}</div>;
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
}): ReactNode {
  const tones = {
    neutral: 'bg-ink-800 text-ink-300 border-ink-700',
    good: 'bg-mint/15 text-mint border-mint/30',
    bad: 'bg-flame/15 text-flame border-flame/30',
    warn: 'bg-amber-brand/15 text-amber-brand border-amber-brand/30',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * Folha que sobe de baixo — a forma de painel do celular.
 *
 * No desktop existe uma coluna lateral permanente; aqui o mesmo conteúdo é
 * alcançável com o polegar, ancorado na borda inferior e limitado a 72% da
 * altura para nunca cobrir o mundo por inteiro.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}): ReactNode {
  if (!open) return null;
  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/50"
      />
      <section className="panel fixed inset-x-2 bottom-2 z-40 flex max-h-[72svh] flex-col overflow-hidden animate-rise">
        <header className="flex shrink-0 items-center justify-between border-b border-ink-700 px-4 py-2.5">
          <h2 className="text-sm font-bold text-ink-200">{title}</h2>
          <Button size="sm" variant="subtle" onClick={onClose} aria-label="Fechar painel">
            ✕
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}): ReactNode {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-ink-400 uppercase">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-ink-200 ' +
  'placeholder:text-ink-500 focus:border-grape-400 focus:outline-none';
