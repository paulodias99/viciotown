import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { connection } from '../net/client';
import { useGame } from '../store/game';
import { Button, inputClass } from './primitives';

/** Botão contextual da "estação" em que o avatar parou (cafeteira, pia, palco…). */
export function StationButton(): React.ReactNode {
  const prompt = useGame((s) => s.stationPrompt);
  const locked = useGame((s) => s.locked);
  const [text, setText] = useState('');
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    setComposing(false);
    setText('');
  }, [prompt?.station]);

  if (!prompt || locked) return null;

  const act = (): void => {
    if (prompt.needsText && !composing) {
      setComposing(true);
      return;
    }
    if (prompt.needsText && !text.trim()) return;
    connection.send('interact', {
      station: prompt.station,
      ...(prompt.needsText ? { payload: text.trim() } : {}),
    });
    setComposing(false);
    setText('');
  };

  if (composing && prompt.needsText) {
    return (
      <div className="panel pointer-events-auto w-full max-w-sm space-y-2 p-3 animate-rise">
        <p className="text-xs font-semibold text-ink-300">{prompt.needsText}</p>
        <input
          autoFocus
          className={inputClass}
          value={text}
          maxLength={180}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') act();
            if (e.key === 'Escape') setComposing(false);
          }}
        />
        <div className="flex gap-2">
          <Button size="md" className="flex-1" onClick={() => setComposing(false)}>
            Cancelar
          </Button>
          <Button size="md" variant="primary" className="flex-1" onClick={act} disabled={!text.trim()}>
            Enviar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button size="lg" variant="primary" className="pointer-events-auto shadow-xl animate-pop" onClick={act}>
      {prompt.label}
    </Button>
  );
}

export function Toasts(): React.ReactNode {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-40 flex flex-col items-center gap-2 px-3">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={clsx(
            'panel pointer-events-auto flex w-full max-w-sm items-center gap-3 px-4 py-3 text-left animate-rise',
            toast.kind === 'success' && 'border-mint/40',
            toast.kind === 'error' && 'border-flame/40',
            toast.kind === 'warn' && 'border-amber-brand/40',
          )}
        >
          {toast.icon ? <span className="text-2xl">{toast.icon}</span> : null}
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink-200">{toast.title}</span>
            {toast.body ? <span className="block text-xs text-ink-400">{toast.body}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Anúncio do palco do Auditório — aparece em todas as salas. */
export function AnnouncementBanner(): React.ReactNode {
  const announcement = useGame((s) => s.announcement);
  if (!announcement) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/4 z-40 flex justify-center px-4">
      <div className="max-w-lg rounded-2xl border-2 border-amber-brand bg-ink-900/95 px-6 py-4 text-center shadow-2xl animate-pop">
        <p className="text-xs font-bold tracking-widest text-amber-brand uppercase">
          📣 {announcement.from}
        </p>
        <p className="mt-1 text-lg font-bold text-ink-200">{announcement.text}</p>
      </div>
    </div>
  );
}

/** Aviso de conexão: só aparece quando algo está errado. */
export function ConnectionBanner(): React.ReactNode {
  const connectionStatus = useGame((s) => s.connection);
  if (connectionStatus === 'online' || connectionStatus === 'idle') return null;

  const isFatal = connectionStatus === 'offline';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:bottom-6">
      <p
        className={clsx(
          'rounded-full border px-4 py-2 text-xs font-semibold',
          isFatal
            ? 'border-flame/40 bg-flame/15 text-flame'
            : 'border-amber-brand/40 bg-amber-brand/15 text-amber-brand',
        )}
      >
        {isFatal ? 'Sem conexão com o servidor — tentando de novo…' : 'Reconectando…'}
      </p>
    </div>
  );
}
