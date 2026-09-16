/**
 * Números que servidor e cliente PRECISAM concordar. Estavam duplicados em
 * dois arquivos com um comentário "precisa bater com o cliente" — que é
 * exatamente o tipo de acordo que um dia deixa de bater.
 */

/** Duração de um passo. O cliente interpola com isso; o servidor avança o path com isso. */
export const WALK_MS_PER_TILE = 240;

/** Passo na diagonal é mais longo — sem isso o avatar "acelera" nas diagonais. */
export const WALK_MS_PER_DIAGONAL = Math.round(WALK_MS_PER_TILE * Math.SQRT2);

/** Animação de subir/descer escada, durante a qual o jogador fica travado. */
export const CLIMB_MS = 1200;

/** Tempo de fervura do café. */
export const BREW_MS = 2600;

/** Duração de uma emote (aceno, palmas, ...) antes de voltar para idle. */
export const EMOTE_MS = 2200;

/** Balão de fala no mundo. */
export const BUBBLE_MS = 6000;

/** Sem input por este tempo, o jogador passa para `away` automaticamente. */
export const AFK_AFTER_MS = 5 * 60 * 1000;

/** Raio (em tiles) do chat por proximidade, quando ligado. */
export const PROXIMITY_RADIUS = 6;

export const MAX_CLIENTS_PER_ROOM = 60;
export const MAX_NAME_LENGTH = 18;
export const MAX_CHAT_LENGTH = 240;
export const MAX_STATUS_LENGTH = 60;
export const MAX_CUPS = 20;

/** Histórico de chat guardado por sala e reenviado para quem entra. */
export const CHAT_HISTORY_SIZE = 60;

/** Janela de reconexão: recarregar a página não deve derrubar você da sala. */
export const RECONNECTION_SECONDS = 25;

/** Orçamento de mensagens por cliente (token bucket), por tipo. */
export const RATE_LIMITS = {
  move: { capacity: 12, refillPerSecond: 6 },
  chat: { capacity: 6, refillPerSecond: 1 },
  emote: { capacity: 6, refillPerSecond: 1.5 },
  interact: { capacity: 8, refillPerSecond: 2 },
  profile: { capacity: 4, refillPerSecond: 0.5 },
  ai: { capacity: 3, refillPerSecond: 0.1 },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

/** Métrica isométrica (mesma do Habbo). */
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const WALL_HEIGHT = 72;
export const AVATAR_HEIGHT = 54;
