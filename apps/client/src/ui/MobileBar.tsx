import clsx from 'clsx';
import { worldScene } from '../game/handle';
import { useGame } from '../store/game';

/**
 * Barra de ações do celular.
 *
 * Tudo que no desktop mora em painéis laterais precisa caber aqui, ao alcance
 * do polegar — a interface anterior simplesmente não existia no celular: o
 * chat ficava numa faixa de 100px e o roster sumia fora da tela.
 */
export function MobileBar(): React.ReactNode {
  const panel = useGame((s) => s.panel);
  const setPanel = useGame((s) => s.setPanel);
  const setModal = useGame((s) => s.setModal);
  const chatCount = useGame((s) => s.chat.length);
  const online = useGame((s) => s.roster.length);

  const items = [
    { key: 'chat' as const, icon: '💬', label: 'Chat', badge: chatCount > 0 ? undefined : undefined, onClick: () => setPanel('chat') },
    { key: 'emotes' as const, icon: '😀', label: 'Emotes', onClick: () => setModal('emotes') },
    { key: 'center' as const, icon: '🎯', label: 'Centro', onClick: () => worldScene()?.recenter() },
    { key: 'roster' as const, icon: '👥', label: String(online), onClick: () => setPanel('roster') },
    { key: 'map' as const, icon: '🗺️', label: 'Salas', onClick: () => setPanel('map') },
    { key: 'settings' as const, icon: '⚙️', label: 'Ajustes', onClick: () => setPanel('settings') },
  ];

  return (
    <nav className="z-30 flex shrink-0 items-stretch gap-1 border-t border-ink-800 bg-ink-900/95 px-1.5 pt-1.5 safe-bottom backdrop-blur lg:hidden">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          aria-label={item.label}
          className={clsx(
            'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors',
            panel === item.key ? 'bg-grape-600/40 text-white' : 'text-ink-400 active:bg-ink-800',
          )}
        >
          <span className="text-lg leading-none">{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
