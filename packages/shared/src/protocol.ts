import { z } from 'zod';
import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, MAX_STATUS_LENGTH } from './constants.js';
import { avatarLookSchema } from './look.js';
import type {
  CoffeeSnapshot,
  MapKey,
  MeetingEvent,
  MeetingRoomSnapshot,
  Point,
  PresenceStatus,
} from './types.js';

/**
 * Protocolo de rede. Cada mensagem que entra tem um schema Zod; o servidor
 * não olha para `msg?.algumaCoisa` em lugar nenhum. A sanitização manual
 * (regex por campo, espalhada pelos handlers) virou schema declarado, então
 * um campo novo não pode chegar ao estado sem passar por validação.
 */

const control = /[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g;

/** Texto de usuário: tira controles/zero-width, colapsa espaços, corta. */
const userText = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(control, '').replace(/\s+/g, ' ').trim().slice(0, max));

export const nameSchema = userText(MAX_NAME_LENGTH).transform((v) => v || 'Convidado');

export const presenceStatusSchema = z.enum([
  'online',
  'busy',
  'meeting',
  'away',
]) satisfies z.ZodType<PresenceStatus>;

export const emoteSchema = z.enum(['wave', 'dance', 'clap', 'sad', 'sit']);
export type EmoteName = z.infer<typeof emoteSchema>;

export const EMOTE_LABELS: Record<EmoteName, string> = {
  wave: '👋 Acenar',
  dance: '💃 Dançar',
  clap: '👏 Aplaudir',
  sad: '😔 Suspirar',
  sit: '🪑 Levantar',
};

export const stationTypeSchema = z.enum([
  'coffee',
  'sink',
  'whiteboard',
  'fridge',
  'speaker',
  'screen',
]);

export const mapKeySchema = z.enum([
  'salaPrincipal',
  'salaSPPN',
  'salaCentral',
  'salaCopa',
  'auditorio',
  'jardim',
]) satisfies z.ZodType<MapKey>;

const tileCoord = z.number().finite().transform((v) => Math.floor(v));

// ---------------------------------------------------------------- entrada

export const clientMessages = {
  /** Anuncia o jogador na sala (ou atualiza nome/visual depois). */
  profile: z.object({
    name: nameSchema,
    look: avatarLookSchema,
    status: presenceStatusSchema.optional(),
    statusMessage: userText(MAX_STATUS_LENGTH).optional(),
  }),

  move: z.object({ x: tileCoord, y: tileCoord }),

  chat: z.object({
    text: userText(MAX_CHAT_LENGTH),
    channel: z.enum(['room', 'proximity']).default('room'),
  }),

  emote: z.object({ emote: emoteSchema }),

  interact: z.object({ station: stationTypeSchema, payload: z.string().max(200).optional() }),

  status: z.object({
    status: presenceStatusSchema,
    message: userText(MAX_STATUS_LENGTH).default(''),
  }),

  /** Viagem rápida pelo menu de salas (sem precisar andar até a porta). */
  teleport: z.object({ to: mapKeySchema }),

  follow: z.object({ targetId: z.string().max(64).nullable() }),

  'meeting:refresh': z.object({}).passthrough(),

  'meeting:book': z.object({
    title: userText(80),
    startISO: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(240),
  }),

  'meeting:cancel': z.object({ eventId: z.string().min(1).max(200) }),

  /** Pergunta direta ao bot do mundo. */
  ask: z.object({ text: userText(MAX_CHAT_LENGTH) }),

  ping: z.object({ t: z.number().finite() }),
} as const;

export type ClientMessageType = keyof typeof clientMessages;
export type ClientMessage<T extends ClientMessageType> = z.infer<(typeof clientMessages)[T]>;

// ---------------------------------------------------------------- saída

export type SystemLevel = 'info' | 'success' | 'warn' | 'error';

export interface RoomDirectoryEntry {
  key: MapKey;
  name: string;
  tagline: string;
  count: number;
}

export interface ChatLine {
  id: string;
  name: string;
  text: string;
  at: number;
  channel: 'room' | 'proximity' | 'system' | 'bot' | 'announce';
}

export interface ServerMessages {
  welcome: {
    sessionId: string;
    profileId: string;
    mapKey: MapKey;
    serverTime: number;
    history: ChatLine[];
    coffee: CoffeeSnapshot;
    meeting: MeetingRoomSnapshot;
    reconnectionToken: string | null;
  };
  chat: ChatLine;
  system: { text: string; level: SystemLevel };
  toast: { title: string; body?: string; kind: SystemLevel; icon?: string };
  /** Anúncio do palco do Auditório: chega em TODAS as salas. */
  announce: { from: string; text: string };
  climb: { ms: number; label: string };
  changeRoom: { to: MapKey; spawnAt: Point | null };
  'meeting:state': MeetingRoomSnapshot;
  'meeting:result': { ok: boolean; error?: string; event?: MeetingEvent };
  'meeting:open': MeetingRoomSnapshot;
  'coffee:state': CoffeeSnapshot;
  'coffee:alert': { by: string | null };
  'bot:typing': { on: boolean };
  directory: { rooms: RoomDirectoryEntry[]; totalOnline: number };
  pong: { t: number; serverTime: number };
  error: { text: string };
}

export type ServerMessageType = keyof ServerMessages;
