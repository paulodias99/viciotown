import type {
  ClientMessage,
  ClientMessageType,
  MapKey,
  Point,
  ServerMessages,
} from '@viciotown/shared';
import { DEFAULT_MAP, MAPS } from '@viciotown/shared';
import { Client, Room, getStateCallbacks } from 'colyseus.js';
import { useGame, type RosterPlayer } from '../store/game';
import { profileSnapshot, useProfile } from '../store/profile';
import type { OfficeView, PlayerView } from './schema';

const PING_INTERVAL_MS = 5000;
const ROSTER_THROTTLE_MS = 250;
const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 15_000;

type RoomListener = (room: Room<OfficeView>, mapKey: MapKey) => void;

function serverUrl(): string {
  const configured = import.meta.env.VITE_GAME_SERVER;
  if (configured) return configured;
  // Em dev o Vite serve na 5173 e o jogo na 3000; em produção é a mesma origem.
  return import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin;
}

/**
 * Conexão com o mundo.
 *
 * Concentra o que antes estava espalhado pelo `main.js`: escolher sala,
 * trocar de sala, reconectar, sincronizar relógio e traduzir o estado do
 * Colyseus para a store da UI. O Phaser não fala com a rede em lugar nenhum —
 * ele só lê o estado que esta classe expõe.
 */
export class GameConnection {
  private readonly client = new Client(serverUrl());
  private room: Room<OfficeView> | null = null;
  private mapKey: MapKey = DEFAULT_MAP;

  private readonly roomListeners = new Set<RoomListener>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private rosterTimer: ReturnType<typeof setTimeout> | null = null;

  /** Diferença entre o relógio do servidor e o nosso, para interpolar rotas. */
  private clockOffset = 0;
  /** true durante uma troca deliberada de sala (não deve tentar reconectar). */
  private switching = false;
  private disposed = false;

  // ------------------------------------------------------------ ciclo de vida

  async connect(mapKey: MapKey = DEFAULT_MAP, spawnAt?: Point): Promise<void> {
    if (this.disposed) return;
    this.mapKey = mapKey;
    useGame.getState().setConnection(this.room ? 'reconnecting' : 'connecting');

    const profile = profileSnapshot();
    try {
      const room = await this.client.joinOrCreate<OfficeView>(mapKey, {
        profileId: profile.id,
        name: profile.name,
        ...(spawnAt ? { spawnAt } : {}),
      });
      this.attach(room, mapKey);
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('[net] falha ao entrar na sala', error);
      useGame.getState().setConnection('offline');
      this.scheduleReconnect();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    void this.room?.leave(true);
    this.room = null;
  }

  onRoom(listener: RoomListener): () => void {
    this.roomListeners.add(listener);
    if (this.room) listener(this.room, this.mapKey);
    return () => this.roomListeners.delete(listener);
  }

  get currentRoom(): Room<OfficeView> | null {
    return this.room;
  }

  get currentMapKey(): MapKey {
    return this.mapKey;
  }

  /** Agora, no relógio do servidor — é o que `sampleRoute` espera. */
  now(): number {
    return Date.now() + this.clockOffset;
  }

  send<T extends ClientMessageType>(type: T, payload: ClientMessage<T>): void {
    this.room?.send(type, payload);
  }

  // ------------------------------------------------------------ interno

  private attach(room: Room<OfficeView>, mapKey: MapKey): void {
    this.room = room;
    this.mapKey = mapKey;

    const game = useGame.getState();
    game.setMap(mapKey);
    game.setSession(room.sessionId);
    game.setConnection('online');
    game.setStationPrompt(null);
    game.setLocked(false);

    // Os handlers de mensagem são registrados PRIMEIRO e de forma síncrona: o
    // servidor manda `welcome` durante o `onJoin`, e qualquer `await` aqui no
    // meio deixa essa mensagem chegar antes de existir quem a escute.
    this.bindMessages(room);
    this.startPing();
    void this.bindStateWhenReady(room);

    room.onLeave((code) => {
      if (this.switching || this.disposed) return;
      useGame.getState().setConnection('reconnecting');
      this.stopPing();
      // 4000+ são códigos de aplicação (sala cheia, expulso): tentar de novo
      // no mesmo instante só repete o erro.
      this.scheduleReconnect(code >= 4000 ? 3000 : undefined);
    });

    room.onError((code, message) => {
      console.error('[net] erro da sala', code, message);
      useGame.getState().pushSystem(message ?? 'Erro de conexão', 'error');
    });

    // O servidor carrega o perfil salvo, mas o que a pessoa acabou de editar
    // localmente é mais recente — empurra logo depois de entrar.
    const profile = profileSnapshot();
    if (profile.name) {
      this.send('profile', {
        name: profile.name,
        look: profile.look,
        status: profile.status,
        statusMessage: profile.statusMessage,
      });
    }

    for (const listener of this.roomListeners) listener(room, mapKey);
  }

  /**
   * O estado só pode receber callbacks depois do primeiro patch: logo após o
   * join, `room.state` ainda não foi decodificado e `state.players` é
   * `undefined` — registrar ali estoura e derruba a conexão inteira.
   */
  private async bindStateWhenReady(room: Room<OfficeView>): Promise<void> {
    if (!room.state?.players) {
      await Promise.race([
        new Promise<void>((resolve) => room.onStateChange.once(() => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 8000)),
      ]);
    }
    if (this.room !== room || !room.state?.players) {
      if (this.room === room) console.warn('[net] estado não chegou — tentando de novo');
      return;
    }
    this.bindState(room);
  }

  private bindState(room: Room<OfficeView>): void {
    const $ = getStateCallbacks(room) as unknown as (
      target: OfficeView,
    ) => {
      players: {
        onAdd(cb: (player: PlayerView, key: string) => void): void;
        onRemove(cb: (player: PlayerView, key: string) => void): void;
      };
    };

    const scheduleRoster = (): void => {
      // O roster muda a cada passo de cada jogador; redesenhar a lista em
      // React nessa frequência é desperdício — 4Hz é imperceptível e barato.
      if (this.rosterTimer) return;
      this.rosterTimer = setTimeout(() => {
        this.rosterTimer = null;
        this.syncRoster(room);
      }, ROSTER_THROTTLE_MS);
    };

    $(room.state).players.onAdd(() => scheduleRoster());
    $(room.state).players.onRemove(() => scheduleRoster());
    room.onStateChange(() => scheduleRoster());
    this.syncRoster(room);
  }

  private syncRoster(room: Room<OfficeView>): void {
    if (this.room !== room || !room.state?.players) return;
    const roster: RosterPlayer[] = [];
    room.state.players.forEach((player, sessionId) => {
      roster.push({
        sessionId,
        name: player.name,
        status: player.status,
        statusMessage: player.statusMessage,
        topColor: player.look.topColor,
        isBot: player.isBot,
        isSelf: sessionId === room.sessionId,
        zone: player.zone,
        holdingCoffee: player.holdingCoffee,
      });
    });
    roster.sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.name.localeCompare(b.name, 'pt-BR'));
    useGame.getState().setRoster(roster);
  }

  private bindMessages(room: Room<OfficeView>): void {
    const game = useGame.getState;

    const on = <T extends keyof ServerMessages>(
      type: T,
      handler: (payload: ServerMessages[T]) => void,
    ): void => {
      room.onMessage(type as string, handler as (payload: unknown) => void);
    };

    on('welcome', (payload) => {
      game().setChat(payload.history);
      game().setCoffee(payload.coffee);
      game().setMeeting(payload.meeting);
      // Primeira amostra do relógio do servidor, antes do primeiro ping.
      this.clockOffset = payload.serverTime - Date.now();
    });

    on('chat', (line) => game().pushChat(line));

    on('system', ({ text, level }) => game().pushSystem(text, level));

    on('toast', (toast) => game().pushToast(toast));

    on('announce', ({ from, text }) => {
      game().setAnnouncement({ from, text });
      game().pushChat({ id: 'announce', name: from, text, at: Date.now(), channel: 'announce' });
      setTimeout(() => {
        if (useGame.getState().announcement?.text === text) game().setAnnouncement(null);
      }, 8000);
    });

    on('climb', ({ ms }) => {
      game().setLocked(true);
      setTimeout(() => game().setLocked(false), ms + 200);
    });

    on('changeRoom', ({ to, spawnAt }) => {
      void this.switchRoom(to, spawnAt ?? undefined);
    });

    on('meeting:state', (snapshot) => game().setMeeting(snapshot));
    on('meeting:open', (snapshot) => {
      game().setMeeting(snapshot);
      game().setModal('meeting');
    });
    on('meeting:result', ({ ok, error, event }) => {
      game().pushToast({
        title: ok ? 'Sala Roxa reservada' : 'Não deu para reservar',
        body: ok ? event?.title : error,
        kind: ok ? 'success' : 'error',
        icon: ok ? '🟣' : '⚠️',
      });
    });

    on('coffee:state', (coffee) => game().setCoffee(coffee));
    on('coffee:alert', ({ by }) => {
      game().pushToast({
        title: 'Tem café na Copa!',
        body: by ? `Passado por ${by}` : undefined,
        kind: 'success',
        icon: '☕',
      });
    });

    on('bot:typing', ({ on: typing }) => game().setBotTyping(typing));

    on('directory', ({ rooms, totalOnline }) => game().setDirectory(rooms, totalOnline));

    on('error', ({ text }) => game().pushSystem(text, 'error'));

    on('pong', ({ t, serverTime }) => {
      const rtt = Date.now() - t;
      // Metade do RTT é a melhor estimativa simples do atraso de ida; sem isso
      // o avatar dos outros anda "atrasado" pelo tempo de rede inteiro.
      this.clockOffset = serverTime + rtt / 2 - Date.now();
      game().setLatency(Math.round(rtt));
    });
  }

  async switchRoom(to: MapKey, spawnAt?: Point): Promise<void> {
    if (this.disposed || !MAPS[to]) return;

    this.switching = true;
    this.stopPing();
    try {
      await this.room?.leave(true);
    } catch {
      /* já caiu — seguir em frente */
    }
    this.room = null;
    this.switching = false;

    useGame.getState().setChat([]);
    useGame.getState().setRoster([]);
    await this.connect(to, spawnAt);
  }

  private startPing(): void {
    this.stopPing();
    const ping = (): void => this.send('ping', { t: Date.now() });
    ping();
    this.pingTimer = setInterval(ping, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Backoff exponencial com teto: reconectar em laço apertado só piora o servidor. */
  private scheduleReconnect(forcedDelay?: number): void {
    if (this.disposed || this.reconnectTimer) return;
    const delay =
      forcedDelay ??
      Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempts++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(this.mapKey);
    }, delay);
  }
}

export const connection = new GameConnection();

/** Empurra nome/visual atuais para o servidor (após editar o avatar). */
export function pushProfile(): void {
  const profile = useProfile.getState();
  connection.send('profile', {
    name: profile.name || 'Convidado',
    look: profile.look,
    status: profile.status,
    statusMessage: profile.statusMessage,
  });
}
