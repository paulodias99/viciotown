import type { Presence } from '@colyseus/core';
import type { CoffeeSnapshot, MapKey, RosterEntry } from '@viciotown/shared';
import { MAPS, MAX_CUPS } from '@viciotown/shared';
import { createLogger } from '../logger.js';

const log = createLogger('world');

const KEY_COFFEE = 'world:coffee';
const KEY_ROOMS = 'world:rooms';
const KEY_PLAYERS = 'world:players';

const TOPIC_COFFEE = 'world:coffee';
const TOPIC_ANNOUNCE = 'world:announce';
const TOPIC_DIRECTORY = 'world:directory';

/** Entradas mais velhas que isto vieram de um processo que morreu sem limpar. */
const STALE_MS = 60_000;

export interface Announcement {
  from: string;
  text: string;
  at: number;
}

export interface RoomPresenceRecord {
  roomId: string;
  mapKey: MapKey;
  count: number;
  updatedAt: number;
}

interface PlayerRecord extends RosterEntry {
  roomId: string;
  updatedAt: number;
}

/**
 * Estado que atravessa salas — e processos.
 *
 * Antes isto era um `EventEmitter` de módulo: funcionava porque tudo rodava
 * num processo só, e é exatamente o que impede rodar dois. Aqui tudo passa
 * pelo `Presence` do Colyseus, que é um `Map` em memória sozinho e Redis
 * (pub/sub + hashes) quando `REDIS_URL` está configurado. O código das salas
 * não muda entre os dois modos — só a variável de ambiente.
 */
export class WorldHub {
  private coffeeCache: CoffeeSnapshot = {
    ready: false,
    takenCount: 0,
    maxCups: MAX_CUPS,
    brewedBy: null,
    brewedAt: null,
    brewingUntil: null,
  };

  constructor(private readonly presence: Presence) {}

  // -------------------------------------------------------------- pub/sub

  async onCoffeeChange(handler: (snapshot: CoffeeSnapshot) => void): Promise<() => void> {
    const wrapped = (data: CoffeeSnapshot): void => {
      this.coffeeCache = data;
      handler(data);
    };
    await this.presence.subscribe(TOPIC_COFFEE, wrapped);
    return () => void this.presence.unsubscribe(TOPIC_COFFEE, wrapped);
  }

  async onAnnouncement(handler: (a: Announcement) => void): Promise<() => void> {
    await this.presence.subscribe(TOPIC_ANNOUNCE, handler);
    return () => void this.presence.unsubscribe(TOPIC_ANNOUNCE, handler);
  }

  async onDirectoryChange(handler: () => void): Promise<() => void> {
    await this.presence.subscribe(TOPIC_DIRECTORY, handler);
    return () => void this.presence.unsubscribe(TOPIC_DIRECTORY, handler);
  }

  announce(from: string, text: string): void {
    void this.presence.publish(TOPIC_ANNOUNCE, { from, text, at: Date.now() } satisfies Announcement);
  }

  // -------------------------------------------------------------- café

  async getCoffee(): Promise<CoffeeSnapshot> {
    const raw = (await this.presence.hgetall(KEY_COFFEE)) as Record<string, string> | null;
    if (!raw || Object.keys(raw).length === 0) return this.coffeeCache;
    const brewingUntil = Number(raw.brewingUntil ?? 0) || null;
    const snapshot: CoffeeSnapshot = {
      ready: raw.ready === '1',
      takenCount: Number(raw.taken ?? 0),
      maxCups: MAX_CUPS,
      brewedBy: raw.brewedBy || null,
      brewedAt: Number(raw.brewedAt ?? 0) || null,
      // uma fervura cujo prazo já passou não é mais "em andamento": sem isso,
      // um processo que caiu no meio deixaria a cafeteira travada para sempre.
      brewingUntil: brewingUntil && brewingUntil > Date.now() ? brewingUntil : null,
    };
    this.coffeeCache = snapshot;
    return snapshot;
  }

  /** Cache sem ida ao Redis — para leituras no caminho quente do tick. */
  peekCoffee(): CoffeeSnapshot {
    return this.coffeeCache;
  }

  /** Marca que alguém começou a passar café. Falso se já tem café ou já tem alguém passando. */
  async startBrewing(by: string, durationMs: number): Promise<boolean> {
    const current = await this.getCoffee();
    if (current.ready || current.brewingUntil) return false;
    await this.presence.hset(KEY_COFFEE, 'brewingUntil', String(Date.now() + durationMs));
    await this.presence.hset(KEY_COFFEE, 'brewingBy', by);
    await this.publishCoffee();
    return true;
  }

  async cancelBrewing(): Promise<void> {
    await this.presence.hdel(KEY_COFFEE, 'brewingUntil');
    await this.presence.hdel(KEY_COFFEE, 'brewingBy');
    await this.publishCoffee();
  }

  async markReady(by: string): Promise<CoffeeSnapshot> {
    await this.presence.hset(KEY_COFFEE, 'ready', '1');
    await this.presence.hset(KEY_COFFEE, 'taken', '0');
    await this.presence.hset(KEY_COFFEE, 'brewedBy', by);
    await this.presence.hset(KEY_COFFEE, 'brewedAt', String(Date.now()));
    await this.presence.hdel(KEY_COFFEE, 'brewingUntil');
    await this.presence.hdel(KEY_COFFEE, 'brewingBy');
    return this.publishCoffee();
  }

  /**
   * Pega uma xícara. `hincrby` é atômico no Redis, então dois jogadores
   * clicando ao mesmo tempo em processos diferentes não conseguem furar o
   * limite — o excedente é devolvido e a tentativa falha.
   */
  async takeCup(): Promise<boolean> {
    const current = await this.getCoffee();
    if (!current.ready) return false;

    const taken = Number(await this.presence.hincrby(KEY_COFFEE, 'taken', 1));
    if (taken > MAX_CUPS) {
      await this.presence.hincrby(KEY_COFFEE, 'taken', -1);
      return false;
    }
    if (taken >= MAX_CUPS) await this.presence.hset(KEY_COFFEE, 'ready', '0');
    await this.publishCoffee();
    return true;
  }

  private async publishCoffee(): Promise<CoffeeSnapshot> {
    const snapshot = await this.getCoffee();
    void this.presence.publish(TOPIC_COFFEE, snapshot);
    return snapshot;
  }

  // -------------------------------------------------------------- diretório

  async reportRoom(roomId: string, mapKey: MapKey, count: number): Promise<void> {
    await this.presence.hset(
      KEY_ROOMS,
      roomId,
      JSON.stringify({ roomId, mapKey, count, updatedAt: Date.now() } satisfies RoomPresenceRecord),
    );
    void this.presence.publish(TOPIC_DIRECTORY, { at: Date.now() });
  }

  async forgetRoom(roomId: string): Promise<void> {
    await this.presence.hdel(KEY_ROOMS, roomId);
    void this.presence.publish(TOPIC_DIRECTORY, { at: Date.now() });
  }

  async setPlayer(roomId: string, sessionId: string, entry: RosterEntry): Promise<void> {
    await this.presence.hset(
      KEY_PLAYERS,
      `${roomId}:${sessionId}`,
      JSON.stringify({ ...entry, roomId, updatedAt: Date.now() } satisfies PlayerRecord),
    );
  }

  async removePlayer(roomId: string, sessionId: string): Promise<void> {
    await this.presence.hdel(KEY_PLAYERS, `${roomId}:${sessionId}`);
  }

  /** Contagem por sala, somando instâncias e descartando registros órfãos. */
  async roomCounts(): Promise<Map<MapKey, number>> {
    const raw = ((await this.presence.hgetall(KEY_ROOMS)) ?? {}) as Record<string, string>;
    const counts = new Map<MapKey, number>();
    const now = Date.now();
    const stale: string[] = [];

    for (const [field, value] of Object.entries(raw)) {
      const record = parse<RoomPresenceRecord>(value);
      if (!record) {
        stale.push(field);
        continue;
      }
      if (now - record.updatedAt > STALE_MS) {
        stale.push(field);
        continue;
      }
      counts.set(record.mapKey, (counts.get(record.mapKey) ?? 0) + record.count);
    }

    for (const field of stale) void this.presence.hdel(KEY_ROOMS, field);
    return counts;
  }

  async roster(): Promise<RosterEntry[]> {
    const raw = ((await this.presence.hgetall(KEY_PLAYERS)) ?? {}) as Record<string, string>;
    const now = Date.now();
    const out: RosterEntry[] = [];
    for (const [field, value] of Object.entries(raw)) {
      const record = parse<PlayerRecord>(value);
      if (!record || now - record.updatedAt > STALE_MS) {
        void this.presence.hdel(KEY_PLAYERS, field);
        continue;
      }
      out.push({
        id: record.id,
        name: record.name,
        mapKey: record.mapKey,
        status: record.status,
        isBot: record.isBot,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async directory(): Promise<{
    rooms: Array<{ key: MapKey; name: string; tagline: string; count: number }>;
    totalOnline: number;
  }> {
    const counts = await this.roomCounts();
    const rooms = Object.values(MAPS)
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        key: m.key,
        name: m.name,
        tagline: m.tagline,
        count: counts.get(m.key) ?? 0,
      }));
    return { rooms, totalOnline: rooms.reduce((sum, r) => sum + r.count, 0) };
  }
}

function parse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    log.debug({ value }, 'registro de presença ilegível — descartado');
    return null;
  }
}
