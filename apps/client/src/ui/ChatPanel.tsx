import type { ChatLine } from '@viciotown/shared';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { connection } from '../net/client';
import { useGame } from '../store/game';
import { useProfile } from '../store/profile';
import { Button, inputClass } from './primitives';

const QUICK = ['/ajuda', '/dance', '/oi', '/vicio tem café?'];

export function ChatPanel({ compact = false }: { compact?: boolean }): React.ReactNode {
  const chat = useGame((s) => s.chat);
  const sessionId = useGame((s) => s.sessionId);
  const botTyping = useGame((s) => s.botTyping);
  const proximity = useProfile((s) => s.settings.proximityChat);
  const setSetting = useProfile((s) => s.setSetting);

  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    const log = logRef.current;
    // Só rola sozinho se a pessoa já estava no fim: puxar o histórico para
    // cima e ser jogado de volta a cada mensagem é insuportável numa sala cheia.
    if (log && pinnedToBottom.current) log.scrollTop = log.scrollHeight;
  }, [chat.length, botTyping]);

  const send = (): void => {
    const text = draft.trim();
    if (!text) return;
    connection.send('chat', { text, channel: proximity ? 'proximity' : 'room' });
    setDraft('');
  };

  const lines = useMemo(() => chat.slice(-80), [chat]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className={clsx(
          'min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm',
          compact && 'max-h-40',
        )}
      >
        {lines.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-500">
            Ninguém falou ainda. Diga um oi 👋
          </p>
        ) : null}
        {lines.map((line, i) => (
          <Line key={`${line.at}-${i}`} line={line} isSelf={line.id === sessionId} />
        ))}
        {botTyping ? <p className="text-xs text-grape-300 italic">Vício está digitando…</p> : null}
      </div>

      <div className="shrink-0 border-t border-ink-700 p-2 safe-bottom">
        {!compact ? (
          <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setDraft(q);
                  inputRef.current?.focus();
                }}
                className="shrink-0 rounded-full border border-ink-600 bg-ink-800 px-2.5 py-1 text-[11px] text-ink-300"
              >
                {q}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSetting('proximityChat', !proximity)}
              aria-pressed={proximity}
              title="Falar só para quem está por perto"
              className={clsx(
                'ml-auto shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                proximity
                  ? 'border-grape-400 bg-grape-400 text-white'
                  : 'border-ink-600 bg-ink-800 text-ink-400',
              )}
            >
              {proximity ? '🔈 perto' : '📢 sala'}
            </button>
          </div>
        ) : null}

        <div className="flex gap-2">
          <input
            ref={inputRef}
            data-chat-input
            className={inputClass}
            value={draft}
            maxLength={240}
            placeholder={proximity ? 'Falar com quem está perto…' : 'Falar com a sala…'}
            autoComplete="off"
            enterKeyHint="send"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                send();
              }
              e.stopPropagation(); // WASD no chat não deve andar com o avatar
            }}
          />
          <Button variant="primary" onClick={send} disabled={!draft.trim()} aria-label="Enviar">
            ➤
          </Button>
        </div>
      </div>
    </div>
  );
}

function Line({ line, isSelf }: { line: ChatLine; isSelf: boolean }): React.ReactNode {
  if (line.channel === 'system') {
    const tone =
      line.name === 'error'
        ? 'text-flame'
        : line.name === 'warn'
          ? 'text-amber-brand'
          : line.name === 'success'
            ? 'text-mint'
            : 'text-ink-500';
    return <p className={clsx('text-xs italic', tone)}>{line.text}</p>;
  }

  if (line.channel === 'announce') {
    return (
      <p className="rounded-lg border border-amber-brand/30 bg-amber-brand/10 px-2 py-1 text-xs text-amber-brand">
        📣 <b>{line.name}</b>: {line.text}
      </p>
    );
  }

  return (
    <p className="leading-snug break-words">
      <span
        className={clsx(
          'font-bold',
          isSelf ? 'text-grape-300' : line.channel === 'proximity' ? 'text-mint' : 'text-ink-200',
        )}
      >
        {line.name}
      </span>
      <span className="text-ink-500">: </span>
      <span className="text-ink-300">{line.text}</span>
    </p>
  );
}
