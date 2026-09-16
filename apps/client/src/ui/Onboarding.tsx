import { useState } from 'react';
import { useProfile } from '../store/profile';
import { AvatarEditor } from './AvatarEditor';

/**
 * Primeira visita: cria o avatar ANTES de entrar no mundo.
 *
 * Na versão anterior a pessoa caía na sala como "Convidado" com o visual
 * padrão e só depois abria o editor — então todo mundo via um desconhecido
 * genérico aparecer e mudar de cara. Aqui a conexão só acontece depois que o
 * avatar está pronto.
 */
export function Onboarding(): React.ReactNode {
  const profile = useProfile();
  const [name, setName] = useState(profile.name);

  const confirm = (): void => {
    profile.setName(name.trim() || 'Convidado');
    profile.complete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950 p-3">
      <div className="panel flex h-full max-h-[96svh] w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <header className="shrink-0">
          <h1 className="text-xl font-extrabold text-ink-200 sm:text-2xl">
            🏙️ Bem-vindo ao <span className="text-amber-brand">VicioTown</span>
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Monte seu avatar. Você pode mudar tudo depois, a qualquer momento.
          </p>
        </header>

        <AvatarEditor
          look={profile.look}
          name={name}
          onLookChange={profile.setLook}
          onNameChange={setName}
          onConfirm={confirm}
          confirmLabel="Entrar no escritório →"
        />
      </div>
    </div>
  );
}
