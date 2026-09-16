import { MAP_DIRECTORY } from '@viciotown/shared';
import clsx from 'clsx';
import { connection } from '../net/client';
import { useGame } from '../store/game';

/**
 * Teleporte rápido entre salas.
 *
 * A única forma de mudar de sala antes era andar até a porta certa — o que
 * exige já saber onde ela fica. Isso continua existindo (e é o jeito bonito),
 * mas quem só quer chegar na reunião não devia precisar atravessar o saguão.
 */
export function MapPanel(): React.ReactNode {
  const directory = useGame((s) => s.directory);
  const current = useGame((s) => s.mapKey);
  const setPanel = useGame((s) => s.setPanel);

  const counts = new Map(directory.map((entry) => [entry.key, entry.count]));

  return (
    <ul className="space-y-1.5 p-3">
      {MAP_DIRECTORY.map((map) => {
        const count = counts.get(map.key) ?? 0;
        const isCurrent = map.key === current;
        return (
          <li key={map.key}>
            <button
              type="button"
              disabled={isCurrent}
              onClick={() => {
                connection.send('teleport', { to: map.key });
                setPanel('none');
              }}
              className={clsx(
                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                isCurrent
                  ? 'border-grape-400 bg-grape-600/25'
                  : 'border-ink-700 bg-ink-800/60 hover:border-ink-500 hover:bg-ink-800',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-ink-200">{map.name}</span>
                  {isCurrent ? (
                    <span className="rounded bg-grape-400 px-1.5 text-[10px] font-bold text-white">
                      você está aqui
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-ink-400">{map.tagline}</span>
              </span>
              <span
                className={clsx(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold',
                  count > 0 ? 'bg-mint/20 text-mint' : 'bg-ink-700 text-ink-500',
                )}
              >
                {count} 👥
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
