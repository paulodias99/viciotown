import { EMOTE_LABELS, emoteSchema } from '@viciotown/shared';
import { connection } from '../net/client';
import { useGame } from '../store/game';

const EMOTES = emoteSchema.options;

/** Roda de emotes — alvos grandes, pensada para o polegar. */
export function EmoteWheel(): React.ReactNode {
  const setModal = useGame((s) => s.setModal);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0"
        onClick={() => setModal('none')}
      />
      <div className="panel relative grid w-full max-w-sm grid-cols-3 gap-2 p-3 animate-rise safe-bottom">
        {EMOTES.map((emote) => (
          <button
            key={emote}
            type="button"
            onClick={() => {
              connection.send('emote', { emote });
              setModal('none');
            }}
            className="flex h-20 flex-col items-center justify-center gap-1 rounded-xl border border-ink-600 bg-ink-800 text-xs font-semibold text-ink-200 active:bg-grape-600"
          >
            <span className="text-2xl leading-none">{EMOTE_LABELS[emote].split(' ')[0]}</span>
            <span>{EMOTE_LABELS[emote].split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
