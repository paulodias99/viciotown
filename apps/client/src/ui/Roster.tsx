import clsx from 'clsx';
import { connection } from '../net/client';
import { useGame, type RosterPlayer } from '../store/game';
import { useProfile } from '../store/profile';
import { Button } from './primitives';

const STATUS_META = {
  online: { dot: 'bg-mint', label: 'disponível' },
  busy: { dot: 'bg-flame', label: 'ocupado' },
  meeting: { dot: 'bg-amber-brand', label: 'em reunião' },
  away: { dot: 'bg-ink-500', label: 'ausente' },
} as const;

export function Roster(): React.ReactNode {
  const roster = useGame((s) => s.roster);
  const coffee = useGame((s) => s.coffee);
  const status = useProfile((s) => s.status);
  const setStatus = useProfile((s) => s.setStatus);

  const changeStatus = (next: RosterPlayer['status']): void => {
    setStatus(next);
    connection.send('status', { status: next, message: '' });
  };

  return (
    <div className="flex flex-col">
      {coffee.ready ? (
        <div className="m-3 rounded-xl border border-mint/30 bg-mint/10 p-3 text-sm">
          <b className="text-mint">☕ Tem café pronto!</b>
          <p className="mt-0.5 text-xs text-ink-300">
            {coffee.brewedBy ? `Passado por ${coffee.brewedBy}. ` : ''}
            Restam {coffee.maxCups - coffee.takenCount} de {coffee.maxCups} xícaras.
          </p>
        </div>
      ) : null}

      <div className="px-3 pt-3">
        <p className="mb-1.5 text-xs font-bold tracking-wide text-ink-400 uppercase">Seu status</p>
        <div className="flex gap-1.5">
          {(['online', 'busy', 'meeting'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => changeStatus(value)}
              aria-pressed={status === value}
              className={clsx(
                'flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize',
                status === value
                  ? 'border-grape-400 bg-grape-400 text-white'
                  : 'border-ink-600 bg-ink-800 text-ink-300',
              )}
            >
              {STATUS_META[value].label}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-0.5 p-3">
        {roster.map((player) => (
          <li key={player.sessionId}>
            <div
              className={clsx(
                'flex items-center gap-2 rounded-lg px-2 py-2',
                player.isSelf ? 'bg-grape-600/25' : 'hover:bg-ink-800',
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: player.topColor }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink-200">{player.name}</span>
                  {player.isBot ? (
                    <span className="rounded bg-grape-600 px-1 text-[9px] font-bold text-white">
                      BOT
                    </span>
                  ) : null}
                  {player.holdingCoffee ? <span title="com café">☕</span> : null}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-ink-400">
                  <span
                    className={clsx('size-1.5 rounded-full', STATUS_META[player.status].dot)}
                    aria-hidden
                  />
                  {player.statusMessage || player.zone || STATUS_META[player.status].label}
                </span>
              </span>

              {!player.isSelf ? (
                <Button
                  size="sm"
                  variant="subtle"
                  title={`Ir até ${player.name}`}
                  aria-label={`Ir até ${player.name}`}
                  onClick={() => connection.send('follow', { targetId: player.sessionId })}
                >
                  ↗
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
