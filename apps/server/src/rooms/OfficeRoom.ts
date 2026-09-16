import { randomUUID } from 'node:crypto';
import { Room } from 'colyseus';
import type { Client } from 'colyseus';
import type {
  ChatLine,
  MapKey,
  Point,
  PresenceStatus,
  ServerMessages,
  StationType,
  SystemLevel,
} from '@viciotown/shared';
import {
  AFK_AFTER_MS,
  BREW_MS,
  BUBBLE_MS,
  CHAT_HISTORY_SIZE,
  CLIMB_MS,
  EMOTE_MS,
  MAPS,
  MAP_DIRECTORY,
  MAX_CLIENTS_PER_ROOM,
  PROXIMITY_RADIUS,
  RECONNECTION_SECONDS,
  clientMessages,
  createWorldMap,
  decodeRoute,
  defaultLook,
  directionFromDelta,
  encodeRoute,
  isMapKey,
  routeProgress,
  sanitizeLook,
  type ClientMessageType,
  type WorldMap,
} from '@viciotown/shared';
import type { z } from 'zod';
import { env } from '../env.js';
import { createLogger } from '../logger.js';
import type { ServerServices } from '../services/container.js';
import { validateBooking } from '../services/meetings.js';
import { VicioNpc } from '../npc/vicio.js';
import { RateLimiter } from './rate-limit.js';
import { OfficeState, PlayerState, seatKey } from './state.js';

const log = createLogger('room');

const RESOLVE_INTERVAL_MS = 120;
const PRESENCE_INTERVAL_MS = 12_000;
const MEETING_REFRESH_MS = 30_000;

export interface OfficeRoomOptions {
  mapKey: MapKey;
  services: ServerServices;
}

interface JoinOptions {
  profileId?: string;
  spawnAt?: Point;
  name?: string;
}

interface SessionContext {
  profileId: string;
  lastInputAt: number;
  /** Travado durante animações (subir escada, passar café) — ignora `move`. */
  lockedUntil: number;
}

export class OfficeRoom extends Room<OfficeState> {
  mapKey!: MapKey;
  map!: WorldMap;
  services!: ServerServices;

  private readonly limiter = new RateLimiter();
  private readonly sessions = new Map<string, SessionContext>();
  private readonly cleanups: Array<() => void> = [];
  private npc: VicioNpc | null = null;
  private history: ChatLine[] = [];
  private directoryDirty = true;

  // ------------------------------------------------------------ ciclo de vida

  override onCreate(options: OfficeRoomOptions): void {
    const definition = isMapKey(options?.mapKey) ? MAPS[options.mapKey] : null;
    if (!definition || !options?.services) {
      throw new Error(`OfficeRoom criada sem mapa/serviços válidos: ${String(options?.mapKey)}`);
    }

    this.mapKey = definition.key;
    this.map = createWorldMap(definition);
    this.services = options.services;
    this.maxClients = MAX_CLIENTS_PER_ROOM;
    this.autoDispose = false; // as salas do escritório existem sempre, mesmo vazias

    const state = new OfficeState();
    state.mapKey = this.mapKey;
    this.setState(state);

    this.history = this.services.storage.recentChat(this.mapKey);

    this.registerHandlers();
    void this.subscribeWorld();

    this.clock.setInterval(() => this.tick(), RESOLVE_INTERVAL_MS);
    this.clock.setInterval(() => void this.reportPresence(), PRESENCE_INTERVAL_MS);

    if (this.hasMeetingDoor()) {
      void this.refreshMeeting();
      this.clock.setInterval(() => void this.refreshMeeting(), MEETING_REFRESH_MS);
    }

    if (env.BOT_NPC_ENABLED && this.mapKey === 'salaPrincipal') {
      this.npc = new VicioNpc(this);
      this.npc.spawn();
    }

    log.info({ mapKey: this.mapKey, roomId: this.roomId }, 'sala criada');
  }

  override onJoin(client: Client, options: JoinOptions = {}): void {
    const profileId = normalizeProfileId(options.profileId);
    const stored = this.services.storage.getProfile(profileId);

    const hint = options.spawnAt;
    const spawn =
      hint && Number.isFinite(hint.x) && Number.isFinite(hint.y)
        ? this.map.nearestWalkable({ x: Math.floor(hint.x), y: Math.floor(hint.y) })
        : this.map.randomSpawn();

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.profileId = profileId;
    player.name = stored?.name ?? sanitizeName(options.name);
    player.look.apply(stored?.look ?? defaultLook());
    player.status = stored?.status === 'away' ? 'online' : (stored?.status ?? 'online');
    player.statusMessage = stored?.statusMessage ?? '';
    player.x = spawn.x;
    player.y = spawn.y;
    player.dir = 1;
    player.joinedAt = Date.now();
    player.zone = this.map.zoneAt(spawn.x, spawn.y)?.name ?? '';

    this.state.players.set(client.sessionId, player);
    this.sessions.set(client.sessionId, {
      profileId,
      lastInputAt: Date.now(),
      lockedUntil: 0,
    });

    this.services.storage.touchProfile(profileId, this.mapKey);
    this.services.storage.logEvent('join', this.mapKey, profileId);

    this.sendTo(client, 'welcome', {
      sessionId: client.sessionId,
      profileId,
      mapKey: this.mapKey,
      serverTime: Date.now(),
      history: this.history.slice(-CHAT_HISTORY_SIZE),
      coffee: this.services.hub.peekCoffee(),
      meeting: this.services.meetings ? this.lastMeeting : this.lastMeeting,
      reconnectionToken: client.reconnectionToken ?? null,
    });

    this.systemToRoom(`${player.name} entrou`, 'info', client);
    this.directoryDirty = true;
    void this.reportPresence();
    void this.sendDirectory(client);

    this.npc?.onPlayerJoined(player);
  }

  override async onLeave(client: Client, consented?: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!consented) {
      // Recarregar a página, perder o wifi um segundo ou trocar de rede não
      // deveria te expulsar da sala: a sessão fica reservada por um tempo e o
      // avatar só some se a pessoa realmente não voltar.
      player.status = 'away';
      try {
        await this.allowReconnection(client, RECONNECTION_SECONDS);
        const context = this.sessions.get(client.sessionId);
        if (context) context.lastInputAt = Date.now();
        player.status = 'online';
        log.debug({ sessionId: client.sessionId }, 'reconectou');
        return;
      } catch {
        /* não voltou a tempo — segue para a remoção */
      }
    }

    this.releaseSeat(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.limiter.forget(client.sessionId);
    void this.services.hub.removePlayer(this.roomId, client.sessionId);

    this.systemToRoom(`${player.name} saiu`, 'info');
    this.directoryDirty = true;
    void this.reportPresence();
  }

  override onDispose(): void {
    this.npc?.dispose();
    for (const cleanup of this.cleanups) cleanup();
    this.limiter.clear();
    void this.services.hub.forgetRoom(this.roomId);
    log.info({ mapKey: this.mapKey, roomId: this.roomId }, 'sala encerrada');
  }

  // ------------------------------------------------------------ mensagens

  /**
   * Cada handler declara o schema Zod da própria mensagem e o custo no
   * rate limiter. Um handler nunca vê dados não validados — a alternativa
   * (checar `msg?.x` dentro de cada um) foi de onde vieram os bugs de
   * coordenada e de texto com caractere de controle.
   */
  private on<T extends ClientMessageType>(
    type: T,
    limit: Parameters<RateLimiter['consume']>[1] | null,
    handler: (client: Client, player: PlayerState, payload: z.infer<(typeof clientMessages)[T]>) => void,
  ): void {
    this.onMessage(type, (client, raw) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      if (limit && !this.limiter.consume(client.sessionId, limit)) {
        log.debug({ sessionId: client.sessionId, type }, 'mensagem descartada por rate limit');
        return;
      }

      const parsed = clientMessages[type].safeParse(raw ?? {});
      if (!parsed.success) {
        this.sendTo(client, 'error', { text: 'Mensagem inválida.' });
        return;
      }

      const context = this.sessions.get(client.sessionId);
      if (context) {
        context.lastInputAt = Date.now();
        if (player.status === 'away') player.status = 'online';
      }

      try {
        handler(client, player, parsed.data as z.infer<(typeof clientMessages)[T]>);
      } catch (error) {
        log.error({ err: error, type, sessionId: client.sessionId }, 'handler falhou');
        this.sendTo(client, 'error', { text: 'Não consegui processar isso.' });
      }
    });
  }

  private registerHandlers(): void {
    this.on('ping', null, (client, _player, { t }) => {
      this.sendTo(client, 'pong', { t, serverTime: Date.now() });
    });

    this.on('profile', 'profile', (client, player, payload) => {
      player.name = payload.name;
      player.look.apply(sanitizeLook(payload.look));
      if (payload.status) player.status = payload.status;
      if (payload.statusMessage !== undefined) player.statusMessage = payload.statusMessage;

      this.services.storage.upsertProfile({
        id: player.profileId,
        name: player.name,
        look: player.look.toLook(),
        status: player.status,
        statusMessage: player.statusMessage,
        mapKey: this.mapKey,
      });
      void this.reportPresence();
    });

    this.on('status', 'profile', (_client, player, { status, message }) => {
      player.status = status;
      player.statusMessage = message;
      this.services.storage.upsertProfile({
        id: player.profileId,
        name: player.name,
        look: player.look.toLook(),
        status,
        statusMessage: message,
        mapKey: this.mapKey,
      });
      void this.reportPresence();
    });

    this.on('move', 'move', (client, player, { x, y }) => {
      this.requestMove(client.sessionId, player, { x, y });
    });

    this.on('emote', 'emote', (_client, player, { emote }) => {
      this.applyEmote(player, emote);
    });

    this.on('chat', 'chat', (client, player, { text, channel }) => {
      if (!text) return;
      if (text.startsWith('/')) {
        this.runCommand(client, player, text);
        return;
      }
      this.say(player, text, channel);
      if (this.npc?.shouldAnswer(text)) {
        void this.npc.answer(player, text);
      }
    });

    this.on('ask', 'ai', (client, player, { text }) => {
      if (!text) return;
      if (!this.npc) {
        this.sendTo(client, 'system', {
          text: 'O Vício não está nesta sala — ele fica no saguão. Ou fale com ele no Slack.',
          level: 'warn',
        });
        return;
      }
      void this.npc.answer(player, text);
    });

    this.on('interact', 'interact', (client, player, { station, payload }) => {
      void this.interact(client, player, station, payload);
    });

    this.on('teleport', 'interact', (client, _player, { to }) => {
      if (to === this.mapKey) return;
      this.sendTo(client, 'changeRoom', { to, spawnAt: null });
    });

    this.on('follow', 'interact', (client, player, { targetId }) => {
      if (!targetId) return;
      const target = this.state.players.get(targetId);
      if (!target) {
        this.sendTo(client, 'system', { text: 'Essa pessoa não está mais nesta sala.', level: 'warn' });
        return;
      }
      const tile = target.currentTile(Date.now());
      const destination = this.map.nearestWalkable(tile, 4);
      this.requestMove(client.sessionId, player, destination);
    });

    this.on('meeting:refresh', 'interact', (client) => {
      void this.refreshMeeting().then(() => this.sendTo(client, 'meeting:state', this.lastMeeting));
    });

    this.on('meeting:book', 'interact', (client, player, payload) => {
      void this.bookMeeting(client, player, payload);
    });

    this.on('meeting:cancel', 'interact', (client, player, { eventId }) => {
      void this.services.meetings.cancel(eventId, player.name).then(async (result) => {
        this.sendTo(client, 'meeting:result', { ok: result.ok, error: result.error });
        if (result.ok) {
          await this.refreshMeeting();
          this.systemToRoom(`${player.name} cancelou uma reserva da Sala Roxa`, 'info');
        }
      });
    });
  }

  // ------------------------------------------------------------ movimento

  /**
   * Calcula a rota e a publica no estado. Usado por jogadores e pelo NPC.
   *
   * Quando o jogador já está andando, o passo em andamento é PRESERVADO: a
   * rota nova começa no tile para onde ele já ia, e o instante de início é
   * recuado pelo tempo já gasto nesse passo. Sem isso, cada clique durante a
   * caminhada arredondava a posição fracionária e o avatar dava um pulo de
   * até meio tile — que é o "andar estranho".
   */
  requestMove(sessionId: string, player: PlayerState, target: Point): boolean {
    const now = Date.now();
    const context = this.sessions.get(sessionId);
    if (context && now < context.lockedUntil) return false;

    const tx = clamp(target.x, 0, this.map.width - 1);
    const ty = clamp(target.y, 0, this.map.height - 1);
    if (!this.map.isWalkable(tx, ty)) return false;

    // Assento ocupado por outra pessoa não é destino válido — antes dava para
    // sentar literalmente em cima de alguém.
    const occupant = this.state.seats.get(seatKey(tx, ty));
    if (occupant && occupant !== sessionId) return false;

    const currentPath = decodeRoute(player.route);
    const progress = routeProgress(
      { x: player.x, y: player.y },
      currentPath,
      now - player.routeStartedAt,
    );

    // Ponto de partida do replanejamento: o tile em que o avatar está firme,
    // ou aquele para onde já está a caminho.
    const anchor = progress ? progress.to : { x: player.x, y: player.y };
    if (anchor.x === tx && anchor.y === ty && !progress) return false;

    const blocked = (x: number, y: number): boolean => {
      const taken = this.state.seats.get(seatKey(x, y));
      return taken !== undefined && taken !== sessionId;
    };

    const tail =
      anchor.x === tx && anchor.y === ty
        ? []
        : this.map.findPath(anchor, { x: tx, y: ty }, blocked);
    if (tail.length === 0 && !(anchor.x === tx && anchor.y === ty)) return false;

    this.releaseSeat(sessionId);
    // Reserva o assento de destino já na saída: sem isso, duas pessoas andam
    // para a mesma cadeira e quem chega depois "perde" sem nunca ter sido avisada.
    if (this.map.isSeat(tx, ty)) this.state.seats.set(seatKey(tx, ty), sessionId);

    if (progress) {
      player.x = progress.from.x;
      player.y = progress.from.y;
      player.route = encodeRoute([progress.to, ...tail]);
      player.routeStartedAt = now - progress.elapsedInStep;
    } else {
      player.x = anchor.x;
      player.y = anchor.y;
      player.route = encodeRoute(tail);
      player.routeStartedAt = now;
      const first = tail[0];
      if (first) player.dir = directionFromDelta(first.x - anchor.x, first.y - anchor.y);
    }

    if (player.pose === 'dance' || player.pose === 'sit') player.pose = 'idle';
    return true;
  }

  private tick(): void {
    const now = Date.now();

    for (const [sessionId, player] of this.state.players.entries()) {
      if (player.route) {
        const sample = player.sampleAt(now);
        if (sample.finished) {
          player.x = sample.tile.x;
          player.y = sample.tile.y;
          player.dir = sample.dir;
          player.clearRoute();
          this.onArrive(sessionId, player);
        }
      }

      if (player.poseUntil > 0 && now > player.poseUntil) {
        player.poseUntil = 0;
        player.pose = this.map.isSeat(player.x, player.y) ? 'sit' : 'idle';
      }

      const context = this.sessions.get(sessionId);
      if (
        context &&
        !player.isBot &&
        player.status === 'online' &&
        now - context.lastInputAt > AFK_AFTER_MS
      ) {
        player.status = 'away';
      }
    }

    if (this.state.announcementUntil > 0 && now > this.state.announcementUntil) {
      this.state.announcement = '';
      this.state.announcementUntil = 0;
    }

    this.npc?.tick(now);

    if (this.directoryDirty) {
      this.directoryDirty = false;
      void this.sendDirectory();
    }
  }

  private onArrive(sessionId: string, player: PlayerState): void {
    player.zone = this.map.zoneAt(player.x, player.y)?.name ?? '';

    if (this.map.isSeat(player.x, player.y)) {
      this.state.seats.set(seatKey(player.x, player.y), sessionId);
      player.pose = 'sit';
      player.dir = this.facingFromSeat(player.x, player.y);
    } else {
      this.releaseSeat(sessionId);
      if (player.pose === 'sit') player.pose = 'idle';
    }

    const door = this.map.doorAt(player.x, player.y);
    if (door) this.enterDoor(sessionId, player, door);
  }

  /** Cadeira encostada numa mesa vira o avatar para a mesa; solta, para a câmera. */
  private facingFromSeat(x: number, y: number): number {
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ] as const) {
      const tile = this.map.tileAt(x + dx, y + dy);
      if (tile === 'D' || tile === 'T' || tile === 'O' || tile === 'I') {
        return directionFromDelta(dx, dy);
      }
    }
    return 1;
  }

  private releaseSeat(sessionId: string): void {
    for (const [key, occupant] of this.state.seats.entries()) {
      if (occupant === sessionId) this.state.seats.delete(key);
    }
  }

  private enterDoor(sessionId: string, player: PlayerState, door: NonNullable<ReturnType<WorldMap['doorAt']>>): void {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!client) return;

    if (door.opens === 'meetingRoom') {
      this.sendTo(client, 'meeting:open', this.lastMeeting);
      return;
    }

    if (!door.to) {
      this.sendTo(client, 'system', { text: `🚧 ${door.label} ainda está em construção.`, level: 'warn' });
      return;
    }

    const target: MapKey = door.to;
    const spawnAt = door.spawnAt ?? null;

    if (door.climb) {
      // Trava o jogador durante a animação de subir/descer; a troca de sala só
      // acontece no fim, senão o avatar some no meio do primeiro degrau.
      const context = this.sessions.get(sessionId);
      if (context) context.lockedUntil = Date.now() + CLIMB_MS;
      this.sendTo(client, 'climb', { ms: CLIMB_MS, label: door.label });
      player.pose = 'climb';
      player.poseUntil = Date.now() + CLIMB_MS;
      this.clock.setTimeout(() => {
        const stillHere = this.clients.find((c) => c.sessionId === sessionId);
        if (stillHere) this.sendTo(stillHere, 'changeRoom', { to: target, spawnAt });
      }, CLIMB_MS);
      return;
    }

    this.sendTo(client, 'changeRoom', { to: target, spawnAt });
  }

  // ------------------------------------------------------------ chat

  /**
   * `persist = false` para falas descartáveis (as saudações do NPC): elas
   * aparecem para quem está na sala, mas não entram no histórico reenviado a
   * cada pessoa que entra — senão o log da sala vira uma pilha de "bem-vindo".
   */
  say(
    player: PlayerState,
    text: string,
    channel: 'room' | 'proximity' | 'bot' = 'room',
    persist = true,
  ): void {
    const line: ChatLine = {
      id: player.sessionId,
      name: player.name,
      text,
      at: Date.now(),
      channel,
    };

    if (channel === 'proximity') {
      // Chat por proximidade: só quem está perto ouve. Fica fora do histórico
      // porque reenviar para quem entra depois quebra justamente a ideia.
      const origin = player.currentTile(Date.now());
      for (const client of this.clients) {
        const other = this.state.players.get(client.sessionId);
        if (!other) continue;
        const tile = other.currentTile(Date.now());
        if (Math.hypot(tile.x - origin.x, tile.y - origin.y) <= PROXIMITY_RADIUS) {
          this.sendTo(client, 'chat', line);
        }
      }
      return;
    }

    if (persist) this.pushHistory(line);
    this.broadcastTyped('chat', line);
    if (!player.isBot) {
      this.services.storage.logEvent('chat', this.mapKey, player.profileId);
    }
  }

  private pushHistory(line: ChatLine): void {
    this.history.push(line);
    if (this.history.length > CHAT_HISTORY_SIZE) this.history.shift();
    this.services.storage.appendChat(this.mapKey, line);
  }

  private systemToRoom(text: string, level: SystemLevel = 'info', except?: Client): void {
    this.broadcast('system', { text, level } satisfies ServerMessages['system'], { except });
  }

  private runCommand(client: Client, player: PlayerState, raw: string): void {
    const [head, ...rest] = raw.slice(1).split(/\s+/);
    const command = (head ?? '').toLowerCase();
    const argument = rest.join(' ').trim();

    switch (command) {
      case 'ajuda':
      case 'help':
        this.sendTo(client, 'system', { text: COMMAND_HELP, level: 'info' });
        return;

      case 'dance':
      case 'dancar':
      case 'dançar':
        this.applyEmote(player, 'dance');
        return;

      case 'parar':
      case 'stop':
        player.pose = this.map.isSeat(player.x, player.y) ? 'sit' : 'idle';
        player.poseUntil = 0;
        return;

      case 'aceno':
      case 'oi':
        this.applyEmote(player, 'wave');
        return;

      case 'ocupado':
        player.status = 'busy';
        player.statusMessage = argument.slice(0, 60);
        return;

      case 'livre':
        player.status = 'online';
        player.statusMessage = '';
        return;

      case 'status':
        player.statusMessage = argument.slice(0, 60);
        return;

      case 'me':
        if (argument) this.systemToRoom(`* ${player.name} ${argument}`, 'info');
        return;

      case 'ir':
      case 'go': {
        const target = MAP_DIRECTORY.find(
          (m) =>
            m.key.toLowerCase() === argument.toLowerCase() ||
            m.name.toLowerCase() === argument.toLowerCase(),
        );
        if (!target) {
          this.sendTo(client, 'system', {
            text: `Salas: ${MAP_DIRECTORY.map((m) => m.name).join(', ')}`,
            level: 'warn',
          });
          return;
        }
        this.sendTo(client, 'changeRoom', { to: target.key, spawnAt: null });
        return;
      }

      case 'w':
      case 'sussurrar': {
        const [targetName, ...words] = rest;
        const message = words.join(' ').trim();
        if (!targetName || !message) {
          this.sendTo(client, 'system', { text: 'Uso: /w <nome> <mensagem>', level: 'warn' });
          return;
        }
        const targetEntry = [...this.state.players.entries()].find(
          ([, p]) => p.name.toLowerCase() === targetName.toLowerCase(),
        );
        if (!targetEntry) {
          this.sendTo(client, 'system', { text: `Ninguém aqui se chama "${targetName}".`, level: 'warn' });
          return;
        }
        const targetClient = this.clients.find((c) => c.sessionId === targetEntry[0]);
        const line: ChatLine = {
          id: player.sessionId,
          name: `${player.name} → ${targetEntry[1].name}`,
          text: message,
          at: Date.now(),
          channel: 'proximity',
        };
        if (targetClient) this.sendTo(targetClient, 'chat', line);
        this.sendTo(client, 'chat', line);
        return;
      }

      case 'vicio':
      case 'vício':
      case 'bot':
        if (!argument) {
          this.sendTo(client, 'system', { text: 'Uso: /vicio <sua pergunta>', level: 'warn' });
          return;
        }
        if (!this.npc) {
          this.sendTo(client, 'system', {
            text: 'O Vício fica no saguão (Sala Principal). Lá ele responde.',
            level: 'warn',
          });
          return;
        }
        void this.npc.answer(player, argument);
        return;

      default:
        this.sendTo(client, 'system', {
          text: `Comando desconhecido: /${command}. Digite /ajuda para ver a lista.`,
          level: 'warn',
        });
    }
  }

  private applyEmote(player: PlayerState, emote: 'wave' | 'dance' | 'clap' | 'sad' | 'sit'): void {
    const seated = this.map.isSeat(player.x, player.y) && !player.route;

    if (emote === 'sit') {
      if (!seated) return;
      // "Levantar": sai da cadeira para o tile andável mais próximo.
      const spot = this.map.nearestWalkable({ x: player.x, y: player.y + 1 }, 3);
      this.requestMove(player.sessionId, player, spot);
      return;
    }

    if (emote === 'dance') {
      if (seated) return;
      player.pose = player.pose === 'dance' ? 'idle' : 'dance';
      player.poseUntil = 0;
      return;
    }

    player.pose = emote;
    player.poseUntil = Date.now() + EMOTE_MS;
  }

  // ------------------------------------------------------------ interações

  private async interact(
    client: Client,
    player: PlayerState,
    type: StationType,
    payload?: string,
  ): Promise<void> {
    const now = Date.now();
    const context = this.sessions.get(client.sessionId);
    if (context && now < context.lockedUntil) return;
    if (player.route) return;

    const station = this.map.stationAt(player.x, player.y, type);
    if (!station) {
      this.sendTo(client, 'system', { text: 'Chegue mais perto para usar isso.', level: 'warn' });
      return;
    }

    switch (type) {
      case 'coffee':
        await this.useCoffeeMachine(client, player);
        return;

      case 'sink':
        if (!player.holdingCoffee) return;
        player.holdingCoffee = false;
        this.sendTo(client, 'toast', { title: 'Xícara lavada', kind: 'success', icon: '🚰' });
        return;

      case 'fridge': {
        const snack = SNACKS[Math.floor(Math.random() * SNACKS.length)]!;
        this.systemToRoom(`${player.name} abriu a geladeira e achou ${snack}`, 'info');
        return;
      }

      case 'whiteboard': {
        const note = (payload ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!note) return;
        this.systemToRoom(`📝 ${player.name} escreveu no quadro: "${note}"`, 'info');
        this.services.storage.logEvent('whiteboard', this.mapKey, player.profileId, { note });
        return;
      }

      case 'screen': {
        const text = (payload ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
        if (!text) return;
        // O microfone do palco fura a sala: o anúncio vai pelo hub e chega em
        // todas as salas (e em todos os processos, quando há Redis).
        this.services.hub.announce(player.name, text);
        this.services.storage.logEvent('announce', this.mapKey, player.profileId, { text });
        void this.services.slack?.notifyAnnouncement(player.name, text);
        return;
      }

      case 'speaker': {
        const track = TRACKS[Math.floor(Math.random() * TRACKS.length)]!;
        this.systemToRoom(`🔊 ${player.name} colocou ${track} para tocar`, 'info');
        return;
      }
    }
  }

  private async useCoffeeMachine(client: Client, player: PlayerState): Promise<void> {
    const coffee = await this.services.hub.getCoffee();

    if (coffee.ready && !player.holdingCoffee) {
      if (await this.services.hub.takeCup()) {
        player.holdingCoffee = true;
        this.sendTo(client, 'toast', { title: 'Café na mão ☕', kind: 'success' });
      } else {
        this.sendTo(client, 'system', { text: 'Acabou o café dessa leva.', level: 'warn' });
      }
      return;
    }

    if (coffee.ready && player.holdingCoffee) {
      this.sendTo(client, 'system', {
        text: 'Você já está com uma xícara — lave na pia antes de pegar outra.',
        level: 'warn',
      });
      return;
    }

    if (coffee.brewingUntil) {
      const seconds = Math.max(1, Math.round((coffee.brewingUntil - Date.now()) / 1000));
      this.sendTo(client, 'system', { text: `Já tem café passando (~${seconds}s).`, level: 'info' });
      return;
    }

    if (!(await this.services.hub.startBrewing(player.name, BREW_MS))) return;

    const context = this.sessions.get(client.sessionId);
    if (context) context.lockedUntil = Date.now() + BREW_MS;
    player.pose = 'brew';
    player.poseUntil = Date.now() + BREW_MS;

    this.clock.setTimeout(() => {
      void (async () => {
        const stillHere = this.state.players.get(client.sessionId);
        if (!stillHere) {
          await this.services.hub.cancelBrewing();
          return;
        }
        await this.services.hub.markReady(stillHere.name);
        this.services.storage.logEvent('coffee', this.mapKey, stillHere.profileId);
        void this.services.slack?.notifyCoffee(stillHere.name);
      })();
    }, BREW_MS);
  }

  // ------------------------------------------------------------ reuniões

  private lastMeeting: ServerMessages['meeting:state'] = {
    occupied: false,
    current: null,
    queue: [],
    fetchedAt: new Date(0).toISOString(),
    live: false,
  };

  private hasMeetingDoor(): boolean {
    return this.map.doors.some((d) => d.opens === 'meetingRoom');
  }

  private async refreshMeeting(): Promise<void> {
    this.lastMeeting = await this.services.meetings.getStatus();
    this.broadcastTyped('meeting:state', this.lastMeeting);
  }

  private async bookMeeting(
    client: Client,
    player: PlayerState,
    payload: { title: string; startISO: string; durationMinutes: number },
  ): Promise<void> {
    const start = new Date(payload.startISO);
    const endISO = new Date(start.getTime() + payload.durationMinutes * 60_000).toISOString();

    const check = validateBooking(start.toISOString(), endISO);
    if (!check.ok) {
      this.sendTo(client, 'meeting:result', { ok: false, error: check.error });
      return;
    }

    const result = await this.services.meetings.book({
      title: payload.title || 'Reunião',
      organizer: player.name,
      startISO: start.toISOString(),
      endISO,
    });

    if (!result.ok) {
      this.sendTo(client, 'meeting:result', { ok: false, error: result.error });
      return;
    }

    this.sendTo(client, 'meeting:result', { ok: true, event: result.event });
    this.services.storage.logEvent('booking', this.mapKey, player.profileId, { id: result.event.id });
    this.systemToRoom(`${player.name} reservou a Sala Roxa: "${result.event.title}"`, 'success');
    await this.refreshMeeting();
  }

  // ------------------------------------------------------------ mundo

  private async subscribeWorld(): Promise<void> {
    this.cleanups.push(
      await this.services.hub.onCoffeeChange((snapshot) => {
        const wasReady = this.state.coffee.ready;
        this.state.coffee.ready = snapshot.ready;
        this.state.coffee.takenCount = snapshot.takenCount;
        this.state.coffee.maxCups = snapshot.maxCups;
        this.state.coffee.brewedBy = snapshot.brewedBy ?? '';
        this.state.coffee.brewedAt = snapshot.brewedAt ?? 0;
        this.state.coffee.brewingUntil = snapshot.brewingUntil ?? 0;
        this.broadcastTyped('coffee:state', snapshot);
        if (!wasReady && snapshot.ready) {
          this.broadcastTyped('coffee:alert', { by: snapshot.brewedBy });
        }
      }),
    );

    this.cleanups.push(
      await this.services.hub.onAnnouncement(({ from, text }) => {
        this.state.announcement = `${from}: ${text}`;
        this.state.announcementUntil = Date.now() + BUBBLE_MS * 2;
        this.broadcastTyped('announce', { from, text });
      }),
    );

    this.cleanups.push(
      await this.services.hub.onDirectoryChange(() => {
        this.directoryDirty = true;
      }),
    );

    const coffee = await this.services.hub.getCoffee();
    this.state.coffee.ready = coffee.ready;
    this.state.coffee.takenCount = coffee.takenCount;
    this.state.coffee.brewedBy = coffee.brewedBy ?? '';
  }

  private async reportPresence(): Promise<void> {
    const humans = [...this.state.players.values()].filter((p) => !p.isBot);
    await this.services.hub.reportRoom(this.roomId, this.mapKey, humans.length);
    await Promise.all(
      [...this.state.players.entries()].map(([sessionId, player]) =>
        this.services.hub.setPlayer(this.roomId, sessionId, {
          id: player.profileId,
          name: player.name,
          mapKey: this.mapKey,
          status: player.status,
          isBot: player.isBot,
        }),
      ),
    );
  }

  private async sendDirectory(target?: Client): Promise<void> {
    const directory = await this.services.hub.directory();
    if (target) this.sendTo(target, 'directory', directory);
    else this.broadcastTyped('directory', directory);
  }

  // ------------------------------------------------------------ utilidades

  /**
   * `send`/`broadcast` tipados pelo protocolo — errar o nome de uma mensagem
   * vira erro de compilação. Chama-se `sendTo` e não `send` porque `Room.send`
   * já existe (depreciado) e sobrescrevê-lo esconderia a diferença.
   */
  sendTo<T extends keyof ServerMessages>(client: Client, type: T, payload: ServerMessages[T]): void {
    client.send(type, payload);
  }

  broadcastTyped<T extends keyof ServerMessages>(type: T, payload: ServerMessages[T]): void {
    this.broadcast(type, payload);
  }

  /** Usado pelo NPC para falar e para se anunciar. */
  get npcHost(): {
    state: OfficeState;
    map: WorldMap;
    services: ServerServices;
    mapKey: MapKey;
  } {
    return { state: this.state, map: this.map, services: this.services, mapKey: this.mapKey };
  }
}

const SNACKS = ['um pote de iogurte esquecido', 'meia barra de chocolate', 'um pão de queijo', 'uma garrafa de água', 'um tupperware sem dono'];
const TRACKS = ['uma playlist de lo-fi', 'um samba', 'rock nacional', 'MPB', 'um synthwave estranho'];

const COMMAND_HELP = [
  'Comandos:',
  '/ajuda — esta lista',
  '/dance — dançar (de novo para parar)',
  '/oi — acenar',
  '/me <ação> — ação em terceira pessoa',
  '/w <nome> <msg> — sussurrar para alguém',
  '/ocupado [motivo] · /livre — mudar seu status',
  '/status <texto> — recado ao lado do seu nome',
  '/ir <sala> — viajar direto para outra sala',
  '/vicio <pergunta> — falar com o bot',
].join('\n');

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeName(name: unknown): string {
  const text = String(name ?? '')
    .replace(/[ -<>]/g, '')
    .trim()
    .slice(0, 18);
  return text || 'Convidado';
}

/** Ids de perfil vêm do cliente; aceitamos só o formato que nós mesmos geramos. */
function normalizeProfileId(value: unknown): string {
  const text = String(value ?? '');
  return /^[a-zA-Z0-9_-]{8,64}$/.test(text) ? text : randomUUID();
}
