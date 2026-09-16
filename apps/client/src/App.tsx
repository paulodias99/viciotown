import clsx from 'clsx';
import { useEffect } from 'react';
import { useHotkeys } from './lib/useHotkeys';
import { connection, pushProfile } from './net/client';
import { useGame } from './store/game';
import { useProfile } from './store/profile';
import { AvatarEditor } from './ui/AvatarEditor';
import { ChatPanel } from './ui/ChatPanel';
import { EmoteWheel } from './ui/EmoteWheel';
import { GameCanvas } from './ui/GameCanvas';
import { Joystick } from './ui/Joystick';
import { MapPanel } from './ui/MapPanel';
import { MeetingModal } from './ui/MeetingModal';
import { MobileBar } from './ui/MobileBar';
import { Onboarding } from './ui/Onboarding';
import {
  AnnouncementBanner,
  ConnectionBanner,
  StationButton,
  Toasts,
} from './ui/Overlays';
import { Roster } from './ui/Roster';
import { SettingsPanel } from './ui/SettingsPanel';
import { TopBar } from './ui/TopBar';
import { Button, Sheet } from './ui/primitives';

const PANEL_TITLES = {
  roster: 'Quem está aqui',
  map: 'Salas do VicioTown',
  settings: 'Ajustes',
  chat: 'Chat',
  none: '',
} as const;

export function App(): React.ReactNode {
  const onboarded = useProfile((s) => s.onboarded);
  const joystickEnabled = useProfile((s) => s.settings.joystick);
  const panel = useGame((s) => s.panel);
  const modal = useGame((s) => s.modal);
  const setPanel = useGame((s) => s.setPanel);
  const setModal = useGame((s) => s.setModal);

  useHotkeys();

  useEffect(() => {
    if (!onboarded) return;
    void connection.connect();
    return () => connection.dispose();
  }, [onboarded]);

  if (!onboarded) return <Onboarding />;

  // No desktop a coluna lateral está sempre visível; `panel` escolhe a aba.
  const railTab = panel === 'none' || panel === 'chat' ? 'roster' : panel;

  return (
    <div className="flex h-[100svh] flex-col overflow-hidden bg-ink-950">
      <TopBar />

      <main className="relative flex min-h-0 flex-1">
        {/* ---- mundo ---- */}
        <div className="relative min-h-0 flex-1">
          <GameCanvas />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-3">
            <StationButton />
          </div>

          {joystickEnabled ? (
            <div className="pointer-events-none absolute bottom-4 left-4 lg:hidden">
              <Joystick />
            </div>
          ) : null}
        </div>

        {/* ---- coluna lateral (desktop) ---- */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-ink-800 bg-ink-900/70 lg:flex">
          <nav className="flex shrink-0 gap-1 border-b border-ink-800 p-2">
            {(['roster', 'map', 'settings'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPanel(tab === railTab ? 'none' : tab)}
                aria-pressed={railTab === tab}
                className={clsx(
                  'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                  railTab === tab
                    ? 'bg-grape-600/40 text-white'
                    : 'text-ink-400 hover:bg-ink-800',
                )}
              >
                {PANEL_TITLES[tab]}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {railTab === 'roster' ? <Roster /> : null}
            {railTab === 'map' ? <MapPanel /> : null}
            {railTab === 'settings' ? <SettingsPanel /> : null}
          </div>

          {/* O chat fica sempre à vista no desktop — é o coração do lugar. */}
          <div className="flex h-80 shrink-0 flex-col border-t border-ink-800">
            <ChatPanel />
          </div>
        </aside>
      </main>

      <MobileBar />

      {/* ---- folhas (celular) ---- */}
      <Sheet
        open={panel !== 'none'}
        onClose={() => setPanel(panel)}
        title={PANEL_TITLES[panel]}
      >
        {panel === 'roster' ? <Roster /> : null}
        {panel === 'map' ? <MapPanel /> : null}
        {panel === 'settings' ? <SettingsPanel /> : null}
        {panel === 'chat' ? <ChatPanel /> : null}
      </Sheet>

      {/* ---- modais ---- */}
      {modal === 'avatar' ? <AvatarModal /> : null}
      {modal === 'meeting' ? <MeetingModal /> : null}
      {modal === 'emotes' ? <EmoteWheel /> : null}

      <Toasts />
      <AnnouncementBanner />
      <ConnectionBanner />
    </div>
  );
}

function AvatarModal(): React.ReactNode {
  const profile = useProfile();
  const setModal = useGame((s) => s.setModal);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <div className="panel flex h-[92svh] w-full max-w-3xl flex-col gap-4 p-4 animate-rise sm:h-auto sm:max-h-[90svh] sm:animate-pop">
        <header className="flex shrink-0 items-center justify-between">
          <h2 className="text-base font-bold text-ink-200">Seu avatar</h2>
          <Button size="sm" variant="subtle" onClick={() => setModal('none')} aria-label="Fechar">
            ✕
          </Button>
        </header>

        <AvatarEditor
          look={profile.look}
          name={profile.name}
          onLookChange={profile.setLook}
          onNameChange={profile.setName}
          onCancel={() => setModal('none')}
          confirmLabel="Salvar"
          onConfirm={() => {
            pushProfile();
            setModal('none');
          }}
        />
      </div>
    </div>
  );
}
