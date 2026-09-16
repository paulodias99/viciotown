import { useMemo, useState } from 'react';
import { connection } from '../net/client';
import { useGame } from '../store/game';
import { Button, Field, inputClass, Pill } from './primitives';

const DURATIONS = [30, 60, 90, 120] as const;

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Valor inicial do `datetime-local`: próxima marca de 30 min a partir de agora. */
function nextSlot(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 30 - (date.getMinutes() % 30), 0, 0);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MeetingModal(): React.ReactNode {
  const meeting = useGame((s) => s.meeting);
  const setModal = useGame((s) => s.setModal);

  const [title, setTitle] = useState('');
  const [start, setStart] = useState(nextSlot);
  const [duration, setDuration] = useState<number>(60);
  const [error, setError] = useState('');

  const close = (): void => setModal('none');

  const submit = (): void => {
    if (!start) {
      setError('Escolha um horário de início.');
      return;
    }
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) {
      setError('Horário inválido.');
      return;
    }
    setError('');
    connection.send('meeting:book', {
      title: title.trim() || 'Reunião',
      // `datetime-local` não carrega fuso; toISOString normaliza para UTC a
      // partir do fuso do navegador, que é o que o servidor espera.
      startISO: startDate.toISOString(),
      durationMinutes: duration,
    });
    setTitle('');
  };

  const queue = useMemo(() => meeting?.queue ?? [], [meeting]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="panel flex max-h-[92svh] w-full max-w-lg flex-col animate-rise sm:animate-pop">
        <header className="flex shrink-0 items-center justify-between border-b border-ink-700 px-4 py-3">
          <h2 className="text-base font-bold text-ink-200">🟣 Sala Roxa</h2>
          <Button size="sm" variant="subtle" onClick={close} aria-label="Fechar">
            ✕
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-2">
            {meeting?.occupied ? (
              <Pill tone="bad">🔴 ocupada</Pill>
            ) : (
              <Pill tone="good">🟢 livre agora</Pill>
            )}
            {meeting && !meeting.live ? (
              <Pill tone="warn">agenda local (Google Calendar não configurado)</Pill>
            ) : null}
          </div>

          {meeting?.occupied && meeting.current ? (
            <p className="rounded-xl border border-flame/30 bg-flame/10 p-3 text-sm text-ink-300">
              <b className="text-ink-200">{meeting.current.title}</b>
              {meeting.current.organizer ? ` — ${meeting.current.organizer}` : ''}
              <br />
              até {formatDateTime(meeting.current.endISO)}
            </p>
          ) : null}

          <section>
            <h3 className="mb-1.5 text-xs font-bold tracking-wide text-ink-400 uppercase">
              Próximas reservas
            </h3>
            {queue.length === 0 ? (
              <p className="text-sm text-ink-500">Nenhuma reserva agendada.</p>
            ) : (
              <ul className="space-y-1">
                {queue.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center gap-2 rounded-lg bg-ink-800/70 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink-200">{event.title}</span>
                      <span className="block text-xs text-ink-400">
                        {formatDateTime(event.startISO)}
                        {event.organizer ? ` · ${event.organizer}` : ''}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="subtle"
                      title="Cancelar (só quem reservou pode)"
                      onClick={() => connection.send('meeting:cancel', { eventId: event.id })}
                    >
                      🗑
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 border-t border-ink-700 pt-4">
            <h3 className="text-xs font-bold tracking-wide text-ink-400 uppercase">Reservar</h3>
            <Field label="Título">
              <input
                className={inputClass}
                value={title}
                maxLength={80}
                placeholder="Ex: Alinhamento do time"
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Início">
              <input
                type="datetime-local"
                className={inputClass}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Duração">
              <div className="grid grid-cols-4 gap-1.5">
                {DURATIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDuration(value)}
                    aria-pressed={duration === value}
                    className={`h-10 rounded-lg border text-xs font-semibold ${
                      duration === value
                        ? 'border-grape-400 bg-grape-400 text-white'
                        : 'border-ink-600 bg-ink-800 text-ink-300'
                    }`}
                  >
                    {value >= 60 ? `${value / 60}h${value % 60 ? '30' : ''}` : `${value}min`}
                  </button>
                ))}
              </div>
            </Field>
            {error ? <p className="text-sm text-flame">{error}</p> : null}
          </section>
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-ink-700 p-3 safe-bottom">
          <Button size="lg" className="flex-1" onClick={close}>
            Fechar
          </Button>
          <Button size="lg" variant="primary" className="flex-[2]" onClick={submit}>
            Reservar
          </Button>
        </footer>
      </div>
    </div>
  );
}
