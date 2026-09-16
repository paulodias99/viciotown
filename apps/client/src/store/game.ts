import type {
  ChatLine,
  CoffeeSnapshot,
  MapKey,
  MeetingRoomSnapshot,
  PresenceStatus,
  RoomDirectoryEntry,
  SystemLevel,
} from '@viciotown/shared';
import { DEFAULT_MAP, MAX_CUPS } from '@viciotown/shared';
import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface RosterPlayer {
  sessionId: string;
  name: string;
  status: PresenceStatus;
  statusMessage: string;
  topColor: string;
  isBot: boolean;
  isSelf: boolean;
  zone: string;
  holdingCoffee: boolean;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  kind: SystemLevel;
  icon?: string;
}

export interface StationPrompt {
  station: 'coffee' | 'sink' | 'whiteboard' | 'fridge' | 'speaker' | 'screen';
  label: string;
  /** Interações que precisam de texto abrem um campo em vez de agir direto. */
  needsText?: string;
}

interface GameStore {
  connection: ConnectionStatus;
  mapKey: MapKey;
  sessionId: string | null;
  latencyMs: number;

  roster: RosterPlayer[];
  chat: ChatLine[];
  toasts: Toast[];
  directory: RoomDirectoryEntry[];
  totalOnline: number;

  coffee: CoffeeSnapshot;
  meeting: MeetingRoomSnapshot | null;
  announcement: { from: string; text: string; at: number } | null;
  botTyping: boolean;

  stationPrompt: StationPrompt | null;
  /** Trava de input durante animações (subir escada, passar café). */
  locked: boolean;

  // UI
  panel: 'none' | 'roster' | 'chat' | 'map' | 'settings';
  modal: 'none' | 'avatar' | 'meeting' | 'emotes';

  setConnection(status: ConnectionStatus): void;
  setMap(mapKey: MapKey): void;
  setSession(sessionId: string | null): void;
  setLatency(ms: number): void;
  setRoster(roster: RosterPlayer[]): void;
  pushChat(line: ChatLine): void;
  setChat(lines: ChatLine[]): void;
  pushSystem(text: string, level?: SystemLevel): void;
  pushToast(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
  setDirectory(rooms: RoomDirectoryEntry[], totalOnline: number): void;
  setCoffee(coffee: CoffeeSnapshot): void;
  setMeeting(meeting: MeetingRoomSnapshot): void;
  setAnnouncement(a: { from: string; text: string } | null): void;
  setBotTyping(on: boolean): void;
  setStationPrompt(prompt: StationPrompt | null): void;
  setLocked(locked: boolean): void;
  setPanel(panel: GameStore['panel']): void;
  setModal(modal: GameStore['modal']): void;
}

const MAX_CHAT_LINES = 120;
let toastSeq = 0;

export const useGame = create<GameStore>((set, get) => ({
  connection: 'idle',
  mapKey: DEFAULT_MAP,
  sessionId: null,
  latencyMs: 0,

  roster: [],
  chat: [],
  toasts: [],
  directory: [],
  totalOnline: 0,

  coffee: {
    ready: false,
    takenCount: 0,
    maxCups: MAX_CUPS,
    brewedBy: null,
    brewedAt: null,
    brewingUntil: null,
  },
  meeting: null,
  announcement: null,
  botTyping: false,

  stationPrompt: null,
  locked: false,

  panel: 'none',
  modal: 'none',

  setConnection: (connection) => set({ connection }),
  setMap: (mapKey) => set({ mapKey }),
  setSession: (sessionId) => set({ sessionId }),
  setLatency: (latencyMs) => set({ latencyMs }),
  setRoster: (roster) => set({ roster }),

  pushChat: (line) =>
    set((state) => {
      const chat = [...state.chat, line];
      return { chat: chat.length > MAX_CHAT_LINES ? chat.slice(-MAX_CHAT_LINES) : chat };
    }),

  setChat: (chat) => set({ chat: chat.slice(-MAX_CHAT_LINES) }),

  pushSystem: (text, level = 'info') =>
    get().pushChat({
      id: 'system',
      name: level,
      text,
      at: Date.now(),
      channel: 'system',
    }),

  pushToast: (toast) => {
    const id = ++toastSeq;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    // Some sozinho: um toast que exige clique para sumir é ruído no celular,
    // onde a área útil da tela já é disputada.
    setTimeout(() => get().dismissToast(id), 4500);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  setDirectory: (directory, totalOnline) => set({ directory, totalOnline }),
  setCoffee: (coffee) => set({ coffee }),
  setMeeting: (meeting) => set({ meeting }),

  setAnnouncement: (a) => set({ announcement: a ? { ...a, at: Date.now() } : null }),
  setBotTyping: (botTyping) => set({ botTyping }),
  setStationPrompt: (stationPrompt) => set({ stationPrompt }),
  setLocked: (locked) => set({ locked }),

  setPanel: (panel) => set((state) => ({ panel: state.panel === panel ? 'none' : panel })),
  setModal: (modal) => set({ modal }),
}));

export const gameSnapshot = (): GameStore => useGame.getState();
