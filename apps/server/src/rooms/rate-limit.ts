import type { RateLimitKey } from '@viciotown/shared';
import { RATE_LIMITS } from '@viciotown/shared';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Token bucket por cliente e por tipo de mensagem.
 *
 * Sem isto, um cliente modificado podia mandar `move` num laço fechado: cada
 * um dispara um A* e um patch de estado para a sala inteira, então um único
 * socket derruba a experiência de todo mundo. O limite é por tipo porque os
 * custos são diferentes — andar rápido é normal, mandar 40 mensagens de chat
 * por segundo não é.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  /** Consome um token. `false` = estourou o limite (descarte a mensagem). */
  consume(sessionId: string, kind: RateLimitKey, now = Date.now()): boolean {
    const config = RATE_LIMITS[kind];
    const key = `${sessionId}:${kind}`;
    const bucket = this.buckets.get(key);

    if (!bucket) {
      this.buckets.set(key, { tokens: config.capacity - 1, updatedAt: now });
      return true;
    }

    const refill = ((now - bucket.updatedAt) / 1000) * config.refillPerSecond;
    bucket.tokens = Math.min(config.capacity, bucket.tokens + refill);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  forget(sessionId: string): void {
    for (const key of this.buckets.keys()) {
      if (key.startsWith(`${sessionId}:`)) this.buckets.delete(key);
    }
  }

  clear(): void {
    this.buckets.clear();
  }
}
