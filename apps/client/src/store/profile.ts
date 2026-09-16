import type { AvatarLook, PresenceStatus } from '@viciotown/shared';
import { sanitizeLook } from '@viciotown/shared';
import { create } from 'zustand';

const STORAGE_KEY = 'viciotown:profile';

export interface Settings {
  /** Chat só para quem está perto, em vez de a sala toda. */
  proximityChat: boolean;
  /** Reduz efeitos e trava o zoom — pensado para aparelhos fracos. */
  reducedMotion: boolean;
  /** Câmera segue o avatar automaticamente. */
  followCamera: boolean;
  /** Mostra o joystick virtual (em telas de toque vem ligado). */
  joystick: boolean;
}

export interface Profile {
  id: string;
  name: string;
  look: AvatarLook;
  status: PresenceStatus;
  statusMessage: string;
  settings: Settings;
  /** false até a pessoa confirmar o avatar pela primeira vez. */
  onboarded: boolean;
}

interface ProfileStore extends Profile {
  setName(name: string): void;
  setLook(look: AvatarLook): void;
  setStatus(status: PresenceStatus, message?: string): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  complete(): void;
}

const isTouch = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

function defaultSettings(): Settings {
  return {
    proximityChat: false,
    reducedMotion:
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    followCamera: true,
    joystick: isTouch(),
  };
}

/**
 * Identidade estável do jogador.
 *
 * O id é gerado no cliente e guardado localmente; o servidor o usa como
 * chave do perfil persistido. Isso dá "seu avatar volta como você deixou"
 * sem exigir login — e, ao contrário da versão anterior (que guardava só
 * nome e cores no `localStorage`), a fonte da verdade passa a ser o servidor,
 * então o mesmo id abre o mesmo avatar de outro dispositivo.
 */
function load(): Profile {
  const fallback: Profile = {
    id: crypto.randomUUID(),
    name: '',
    look: sanitizeLook(null),
    status: 'online',
    statusMessage: '',
    settings: defaultSettings(),
    onboarded: false,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      id: typeof parsed.id === 'string' && parsed.id.length >= 8 ? parsed.id : fallback.id,
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 18) : '',
      look: sanitizeLook(parsed.look),
      status: parsed.status ?? 'online',
      statusMessage: parsed.statusMessage ?? '',
      settings: { ...fallback.settings, ...parsed.settings },
      onboarded: Boolean(parsed.onboarded) && Boolean(parsed.name),
    };
  } catch {
    return fallback;
  }
}

function persist(profile: Profile): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: profile.id,
        name: profile.name,
        look: profile.look,
        status: profile.status,
        statusMessage: profile.statusMessage,
        settings: profile.settings,
        onboarded: profile.onboarded,
      }),
    );
  } catch {
    // Modo anônimo / storage cheio: o jogo continua, só não lembra o avatar.
  }
}

export const useProfile = create<ProfileStore>((set, get) => ({
  ...load(),

  setName(name) {
    set({ name: name.slice(0, 18) });
    persist(get());
  },
  setLook(look) {
    set({ look: sanitizeLook(look) });
    persist(get());
  },
  setStatus(status, message) {
    set({ status, statusMessage: message ?? get().statusMessage });
    persist(get());
  },
  setSetting(key, value) {
    set({ settings: { ...get().settings, [key]: value } });
    persist(get());
  },
  complete() {
    set({ onboarded: true });
    persist(get());
  },
}));

export const profileSnapshot = (): Profile => useProfile.getState();
