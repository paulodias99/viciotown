import { MAPS } from '@viciotown/shared';
import { useGame } from '../store/game';
import { Button, Pill } from './primitives';

const CONNECTION_LABEL = {
  idle: 'iniciando',
  connecting: 'conectando…',
  online: 'conectado',
  reconnecting: 'reconectando…',
  offline: 'sem conexão',
} as const;

export function TopBar(): React.ReactNode {
  const connection = useGame((s) => s.connection);
  const mapKey = useGame((s) => s.mapKey);
  const roster = useGame((s) => s.roster);
  const totalOnline = useGame((s) => s.totalOnline);
  const latency = useGame((s) => s.latencyMs);
  const coffee = useGame((s) => s.coffee);
  const setPanel = useGame((s) => s.setPanel);
  const setModal = useGame((s) => s.setModal);

  const map = MAPS[mapKey];
  const here = roster.filter((p) => !p.isBot).length;

  return (
    <header className="z-20 flex shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-900/95 px-3 py-2 safe-top backdrop-blur">
      <button
        type="button"
        onClick={() => setPanel('map')}
        className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-ink-800"
        title="Trocar de sala"
      >
        <span className="text-lg leading-none">🏙️</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-ink-200">{map.name}</span>
          <span className="hidden truncate text-[11px] text-ink-400 sm:block">{map.tagline}</span>
        </span>
      </button>

      <div className="flex-1" />

      {coffee.ready ? (
        <Pill tone="good">
          ☕ <span className="hidden sm:inline">{coffee.maxCups - coffee.takenCount} xícaras</span>
        </Pill>
      ) : null}

      <Pill tone={connection === 'online' ? 'good' : connection === 'offline' ? 'bad' : 'warn'}>
        <span className="hidden sm:inline">{CONNECTION_LABEL[connection]}</span>
        {connection === 'online' && latency > 0 ? <span>{latency}ms</span> : null}
        <span className="sm:hidden">●</span>
      </Pill>

      <button
        type="button"
        onClick={() => setPanel('roster')}
        className="flex h-8 items-center gap-1 rounded-full border border-ink-700 bg-ink-800 px-2.5 text-xs font-semibold text-ink-200"
        title="Quem está online"
      >
        👥 {here}
        {totalOnline > here ? <span className="text-ink-400">/{totalOnline}</span> : null}
      </button>

      <Button
        size="sm"
        variant="primary"
        className="hidden lg:inline-flex"
        onClick={() => setModal('avatar')}
      >
        Avatar
      </Button>
      <Button
        size="sm"
        variant="subtle"
        className="hidden lg:inline-flex"
        onClick={() => setPanel('settings')}
        aria-label="Ajustes"
      >
        ⚙️
      </Button>
    </header>
  );
}
