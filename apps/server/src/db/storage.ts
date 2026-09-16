import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AvatarLook, ChatLine, MapKey, PresenceStatus } from '@viciotown/shared';
import { CHAT_HISTORY_SIZE, sanitizeLook } from '@viciotown/shared';
import { env } from '../env.js';
import { createLogger } from '../logger.js';

const log = createLogger('storage');

export interface StoredProfile {
  id: string;
  name: string;
  look: AvatarLook;
  status: PresenceStatus;
  statusMessage: string;
  lastMapKey: MapKey | null;
  createdAt: number;
  lastSeenAt: number;
  visits: number;
}

export interface OfficeStats {
  totalProfiles: number;
  seenToday: number;
  seenThisWeek: number;
  chatMessagesToday: number;
  coffeeBrewedToday: number;
  topRooms: Array<{ mapKey: string; visits: number }>;
}

/**
 * Persistência do mundo. A versão anterior não tinha nenhuma: nome e avatar
 * viviam só no `localStorage`, o histórico de chat morria com a aba e o bot
 * não tinha como responder "quem passou por aqui hoje".
 *
 * A interface existe separada da implementação porque o alvo natural de
 * crescimento é Postgres — e trocar significa escrever outra classe, não
 * caçar `db.prepare(...)` espalhado pelos handlers.
 */
export interface Storage {
  getProfile(id: string): StoredProfile | null;
  upsertProfile(profile: {
    id: string;
    name: string;
    look: AvatarLook;
    status?: PresenceStatus;
    statusMessage?: string;
    mapKey?: MapKey;
  }): StoredProfile;
  touchProfile(id: string, mapKey: MapKey): void;
  appendChat(mapKey: MapKey, line: ChatLine): void;
  recentChat(mapKey: MapKey, limit?: number): ChatLine[];
  logEvent(type: string, mapKey: MapKey | null, actor: string | null, payload?: unknown): void;
  stats(): OfficeStats;
  close(): void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fallback sem disco: mantém o servidor de pé se o SQLite não abrir. */
class MemoryStorage implements Storage {
  private readonly profiles = new Map<string, StoredProfile>();
  private readonly chats = new Map<MapKey, ChatLine[]>();
  private readonly events: Array<{ type: string; mapKey: MapKey | null; at: number }> = [];

  getProfile(id: string): StoredProfile | null {
    return this.profiles.get(id) ?? null;
  }

  upsertProfile(p: {
    id: string;
    name: string;
    look: AvatarLook;
    status?: PresenceStatus;
    statusMessage?: string;
    mapKey?: MapKey;
  }): StoredProfile {
    const now = Date.now();
    const existing = this.profiles.get(p.id);
    const profile: StoredProfile = {
      id: p.id,
      name: p.name,
      look: p.look,
      status: p.status ?? existing?.status ?? 'online',
      statusMessage: p.statusMessage ?? existing?.statusMessage ?? '',
      lastMapKey: p.mapKey ?? existing?.lastMapKey ?? null,
      createdAt: existing?.createdAt ?? now,
      lastSeenAt: now,
      visits: (existing?.visits ?? 0) + (existing ? 0 : 1),
    };
    this.profiles.set(p.id, profile);
    return profile;
  }

  touchProfile(id: string, mapKey: MapKey): void {
    const p = this.profiles.get(id);
    if (!p) return;
    p.lastSeenAt = Date.now();
    p.lastMapKey = mapKey;
    p.visits += 1;
  }

  appendChat(mapKey: MapKey, line: ChatLine): void {
    const list = this.chats.get(mapKey) ?? [];
    list.push(line);
    if (list.length > CHAT_HISTORY_SIZE) list.splice(0, list.length - CHAT_HISTORY_SIZE);
    this.chats.set(mapKey, list);
  }

  recentChat(mapKey: MapKey, limit = CHAT_HISTORY_SIZE): ChatLine[] {
    return (this.chats.get(mapKey) ?? []).slice(-limit);
  }

  logEvent(type: string, mapKey: MapKey | null): void {
    this.events.push({ type, mapKey, at: Date.now() });
    if (this.events.length > 5000) this.events.splice(0, 1000);
  }

  stats(): OfficeStats {
    const now = Date.now();
    const profiles = [...this.profiles.values()];
    const since = (ms: number) => profiles.filter((p) => now - p.lastSeenAt < ms).length;
    const roomCounts = new Map<string, number>();
    for (const p of profiles) {
      if (p.lastMapKey) roomCounts.set(p.lastMapKey, (roomCounts.get(p.lastMapKey) ?? 0) + 1);
    }
    return {
      totalProfiles: profiles.length,
      seenToday: since(DAY_MS),
      seenThisWeek: since(7 * DAY_MS),
      chatMessagesToday: this.events.filter((e) => e.type === 'chat' && now - e.at < DAY_MS).length,
      coffeeBrewedToday: this.events.filter((e) => e.type === 'coffee' && now - e.at < DAY_MS)
        .length,
      topRooms: [...roomCounts.entries()]
        .map(([mapKey, visits]) => ({ mapKey, visits }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 5),
    };
  }

  close(): void {
    /* nada a fechar */
  }
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
}

class SqliteStorage implements Storage {
  constructor(private readonly db: SqliteDatabase) {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS profiles (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        look           TEXT NOT NULL,
        status         TEXT NOT NULL DEFAULT 'online',
        status_message TEXT NOT NULL DEFAULT '',
        last_map_key   TEXT,
        created_at     INTEGER NOT NULL,
        last_seen_at   INTEGER NOT NULL,
        visits         INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS chat_lines (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        map_key  TEXT NOT NULL,
        author   TEXT NOT NULL,
        name     TEXT NOT NULL,
        text     TEXT NOT NULL,
        channel  TEXT NOT NULL,
        at       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_lines_map_at ON chat_lines (map_key, at DESC);

      CREATE TABLE IF NOT EXISTS events (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        type    TEXT NOT NULL,
        map_key TEXT,
        actor   TEXT,
        payload TEXT,
        at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_type_at ON events (type, at DESC);
    `);
  }

  getProfile(id: string): StoredProfile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToProfile(row) : null;
  }

  upsertProfile(p: {
    id: string;
    name: string;
    look: AvatarLook;
    status?: PresenceStatus;
    statusMessage?: string;
    mapKey?: MapKey;
  }): StoredProfile {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO profiles (id, name, look, status, status_message, last_map_key, created_at, last_seen_at, visits)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           look = excluded.look,
           status = excluded.status,
           status_message = excluded.status_message,
           last_map_key = COALESCE(excluded.last_map_key, profiles.last_map_key),
           last_seen_at = excluded.last_seen_at`,
      )
      .run(
        p.id,
        p.name,
        JSON.stringify(p.look),
        p.status ?? 'online',
        p.statusMessage ?? '',
        p.mapKey ?? null,
        now,
        now,
      );
    return this.getProfile(p.id)!;
  }

  touchProfile(id: string, mapKey: MapKey): void {
    this.db
      .prepare(
        'UPDATE profiles SET last_seen_at = ?, last_map_key = ?, visits = visits + 1 WHERE id = ?',
      )
      .run(Date.now(), mapKey, id);
  }

  appendChat(mapKey: MapKey, line: ChatLine): void {
    this.db
      .prepare(
        'INSERT INTO chat_lines (map_key, author, name, text, channel, at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(mapKey, line.id, line.name, line.text, line.channel, line.at);
    // Poda oportunista: sem isso a tabela cresce para sempre e o `recentChat`
    // fica lendo um índice cada vez maior para devolver sempre 60 linhas.
    if (Math.random() < 0.05) {
      this.db
        .prepare(
          `DELETE FROM chat_lines WHERE map_key = ? AND id NOT IN (
             SELECT id FROM chat_lines WHERE map_key = ? ORDER BY at DESC LIMIT ?
           )`,
        )
        .run(mapKey, mapKey, CHAT_HISTORY_SIZE * 4);
    }
  }

  recentChat(mapKey: MapKey, limit = CHAT_HISTORY_SIZE): ChatLine[] {
    const rows = this.db
      .prepare('SELECT * FROM chat_lines WHERE map_key = ? ORDER BY at DESC LIMIT ?')
      .all(mapKey, limit) as Array<Record<string, unknown>>;
    return rows
      .map((r) => ({
        id: String(r.author),
        name: String(r.name),
        text: String(r.text),
        at: Number(r.at),
        channel: String(r.channel) as ChatLine['channel'],
      }))
      .reverse();
  }

  logEvent(type: string, mapKey: MapKey | null, actor: string | null, payload?: unknown): void {
    this.db
      .prepare('INSERT INTO events (type, map_key, actor, payload, at) VALUES (?, ?, ?, ?, ?)')
      .run(type, mapKey, actor, payload === undefined ? null : JSON.stringify(payload), Date.now());
  }

  stats(): OfficeStats {
    const now = Date.now();
    const scalar = (sql: string, ...params: unknown[]): number => {
      const row = this.db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
      return row ? Number(Object.values(row)[0] ?? 0) : 0;
    };
    const topRooms = (
      this.db
        .prepare(
          `SELECT map_key AS mapKey, COUNT(*) AS visits FROM events
           WHERE map_key IS NOT NULL AND at > ? GROUP BY map_key ORDER BY visits DESC LIMIT 5`,
        )
        .all(now - 7 * DAY_MS) as Array<Record<string, unknown>>
    ).map((r) => ({ mapKey: String(r.mapKey), visits: Number(r.visits) }));

    return {
      totalProfiles: scalar('SELECT COUNT(*) FROM profiles'),
      seenToday: scalar('SELECT COUNT(*) FROM profiles WHERE last_seen_at > ?', now - DAY_MS),
      seenThisWeek: scalar(
        'SELECT COUNT(*) FROM profiles WHERE last_seen_at > ?',
        now - 7 * DAY_MS,
      ),
      chatMessagesToday: scalar(
        "SELECT COUNT(*) FROM events WHERE type = 'chat' AND at > ?",
        now - DAY_MS,
      ),
      coffeeBrewedToday: scalar(
        "SELECT COUNT(*) FROM events WHERE type = 'coffee' AND at > ?",
        now - DAY_MS,
      ),
      topRooms,
    };
  }

  close(): void {
    this.db.close();
  }

  private rowToProfile(row: Record<string, unknown>): StoredProfile {
    let look: AvatarLook;
    try {
      look = sanitizeLook(JSON.parse(String(row.look)));
    } catch {
      look = sanitizeLook(null);
    }
    return {
      id: String(row.id),
      name: String(row.name),
      look,
      status: String(row.status) as PresenceStatus,
      statusMessage: String(row.status_message ?? ''),
      lastMapKey: row.last_map_key ? (String(row.last_map_key) as MapKey) : null,
      createdAt: Number(row.created_at),
      lastSeenAt: Number(row.last_seen_at),
      visits: Number(row.visits ?? 1),
    };
  }
}

export async function createStorage(): Promise<Storage> {
  const path = env.DATABASE_PATH;
  try {
    // `node:sqlite` é builtin desde o Node 22 — zero dependência nativa para
    // compilar, que é o que torna viável ter persistência sem complicar o deploy.
    const { DatabaseSync } = (await import('node:sqlite')) as unknown as {
      DatabaseSync: new (path: string) => SqliteDatabase;
    };
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const storage = new SqliteStorage(new DatabaseSync(path));
    log.info({ path }, 'persistência SQLite pronta');
    return storage;
  } catch (error) {
    log.warn(
      { err: error, path },
      'SQLite indisponível — seguindo só em memória (perfis não persistem)',
    );
    return new MemoryStorage();
  }
}
