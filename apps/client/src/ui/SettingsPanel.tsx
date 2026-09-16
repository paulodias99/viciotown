import { worldScene } from '../game/handle';
import { useGame } from '../store/game';
import { useProfile, type Settings } from '../store/profile';
import { Button } from './primitives';

const OPTIONS: Array<{ key: keyof Settings; label: string; hint: string }> = [
  {
    key: 'followCamera',
    label: 'Câmera segue o avatar',
    hint: 'Desligue para explorar a sala arrastando livremente.',
  },
  {
    key: 'joystick',
    label: 'Joystick virtual',
    hint: 'Alternativa ao toque no chão. Ligado por padrão no celular.',
  },
  {
    key: 'proximityChat',
    label: 'Chat por proximidade',
    hint: 'Sua fala só chega a quem está a até 6 tiles de distância.',
  },
  {
    key: 'reducedMotion',
    label: 'Menos movimento',
    hint: 'Reduz animações da interface. Ajuda em aparelhos mais fracos.',
  },
];

export function SettingsPanel(): React.ReactNode {
  const settings = useProfile((s) => s.settings);
  const setSetting = useProfile((s) => s.setSetting);
  const setModal = useGame((s) => s.setModal);

  return (
    <div className="space-y-4 p-3">
      <ul className="space-y-1">
        {OPTIONS.map((option) => (
          <li key={option.key}>
            <button
              type="button"
              role="switch"
              aria-checked={settings[option.key]}
              onClick={() => {
                setSetting(option.key, !settings[option.key]);
                if (option.key === 'followCamera') worldScene()?.recenter();
              }}
              className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-ink-800"
            >
              <span
                className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  settings[option.key] ? 'bg-grape-400' : 'bg-ink-600'
                }`}
              >
                <span
                  className={`size-5 rounded-full bg-white transition-transform ${
                    settings[option.key] ? 'translate-x-5' : ''
                  }`}
                />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-200">{option.label}</span>
                <span className="block text-xs text-ink-400">{option.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-ink-700 pt-3">
        <Button size="md" className="w-full" onClick={() => setModal('avatar')}>
          🎨 Editar avatar
        </Button>
        <Button size="md" className="w-full" onClick={() => worldScene()?.recenter()}>
          🎯 Centralizar câmera
        </Button>
      </div>

      <p className="text-center text-[11px] text-ink-500">
        VicioTown · Phaser + Colyseus · feito para a equipe
      </p>
    </div>
  );
}
