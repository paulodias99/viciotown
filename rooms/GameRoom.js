'use strict';

const { Room } = require('colyseus');
const { Schema, MapSchema, defineTypes } = require('@colyseus/schema');
const { createMapApi } = require('../shared/mapEngine');
const MAPS = require('../shared/maps');
const calendarService = require('../services/calendar');
const coffeeState = require('../services/coffeeState');

const WALK_MS_PER_TILE = 260; // precisa bater com o cliente
const CLIMB_MS = 1400; // duracao da animacao de subir a escada — precisa bater com o cliente

// ---------------------------------------------------------------- schema

class Player extends Schema {}
defineTypes(Player, {
  name: 'string',
  skin: 'string',
  hair: 'string',
  hairColor: 'string',
  top: 'string',
  topColor: 'string',
  pantsColor: 'string',
  shoesColor: 'string',
  accessory: 'string',
  fantasia: 'string',
  x: 'number',
  y: 'number',
  dancing: 'boolean',
  holdingCoffee: 'boolean',
});

class GameState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}
defineTypes(GameState, {
  players: { map: Player },
});

// ---------------------------------------------------------------- sanitizacao

const HAIR_STYLES = ['curto', 'longo', 'coque', 'black', 'moicano', 'bone', 'careca'];
const TOP_STYLES = ['camiseta', 'moletom', 'blazer'];
const ACCESSORIES = ['nenhum', 'oculos', 'escuros', 'fone'];
const FANTASIAS = ['nenhuma', 'saojoao', 'natal'];
const HEX = /^#[0-9a-fA-F]{6}$/;

function sanitizeLook(look) {
  const l = look && typeof look === 'object' ? look : {};
  const color = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);
  const pick = (v, list) => (list.includes(v) ? v : list[0]);
  return {
    skin: color(l.skin, '#f0c8a0'),
    hair: pick(l.hair, HAIR_STYLES),
    hairColor: color(l.hairColor, '#3a2419'),
    top: pick(l.top, TOP_STYLES),
    topColor: color(l.topColor, '#2f7de1'),
    pantsColor: color(l.pantsColor, '#38414f'),
    shoesColor: color(l.shoesColor, '#22262e'),
    accessory: pick(l.accessory, ACCESSORIES),
    fantasia: pick(l.fantasia, FANTASIAS),
  };
}

function sanitizeName(name) {
  const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return n || 'Convidado';
}

function sanitizeChat(text) {
  return String(text ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
}

function sanitizeCoord(v, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(max - 1, n));
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- room

class GameRoom extends Room {
  onCreate(options) {
    const mapKey = options && options.mapKey;
    const mapData = MAPS[mapKey];
    if (!mapData) throw new Error(`Mapa desconhecido: ${mapKey}`);

    this.mapKey = mapKey;
    this.mapApi = createMapApi(mapData);
    this.setState(new GameState());
    this.maxClients = 50;

    // dados de movimento em transito: nao faz parte do state sincronizado,
    // pois e substituido por inteiro a cada passo e reproduzido via broadcast.
    this.transient = new Map(); // sessionId -> { path, pathStart }

    // sessoes conectadas que ainda nao confirmaram nome/avatar (nao aparecem
    // no state para os outros ate mandarem 'hello').
    this.pending = new Map(); // sessionId -> { x, y }

    // sessoes no meio da animacao de subir a escada — travadas ate a troca de sala.
    this.climbing = new Set();

    this.onMessage('hello', (client, msg) => {
      const pend = this.pending.get(client.sessionId);
      if (!pend) return;
      this.pending.delete(client.sessionId);

      const p = new Player();
      p.name = sanitizeName(msg?.name);
      Object.assign(p, sanitizeLook(msg?.look));
      p.x = pend.x;
      p.y = pend.y;
      p.dancing = false;
      p.holdingCoffee = false;
      this.state.players.set(client.sessionId, p);
      this.broadcast('system', { text: `${p.name} entrou na sala` }, { except: client });
      client.send('coffee:state', coffeeState.getState());
    });

    this.onMessage('look', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.name = sanitizeName(msg?.name ?? p.name);
      Object.assign(p, sanitizeLook(msg?.look));
    });

    this.onMessage('move', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.climbing.has(client.sessionId)) return;

      const tx = sanitizeCoord(msg?.x, this.mapApi.MAP_W);
      const ty = sanitizeCoord(msg?.y, this.mapApi.MAP_H);
      if (tx === null || ty === null) return;

      const from = this.currentTile(client.sessionId, p);
      const path = this.mapApi.findPath(from, { x: tx, y: ty });
      if (!path.length) return;

      p.x = from.x;
      p.y = from.y;
      this.transient.set(client.sessionId, { path, pathStart: Date.now() });
      p.dancing = false;
      this.broadcast('path', { id: client.sessionId, from, path });
    });

    this.onMessage('chat', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const text = sanitizeChat(msg?.text);
      if (!text) return;
      if (text.startsWith('/')) {
        this.runCommand(client, p, text);
        return;
      }
      this.broadcast('chat', { id: client.sessionId, name: p.name, text });
    });

    // resolve movimentos concluidos periodicamente (posicao de repouso fica
    // correta mesmo se o jogador nao andar de novo) e verifica chegada em portas.
    this.clock.setInterval(() => this.resolveMovements(), 120);

    // Cafe da Copa: TODA sala (nao so a Copa) precisa saber quando fica pronto,
    // pra mostrar o alerta gigante e o aviso fixo pra quem esta em outro quarto.
    this._onCoffeeUpdate = (s) => this.broadcast('coffee:state', s);
    this._onCoffeeReady = (info) => this.broadcast('coffee:alert', info);
    coffeeState.bus.on('update', this._onCoffeeUpdate);
    coffeeState.bus.on('ready', this._onCoffeeReady);

    // So a Copa tem a cafeteira/pia de verdade — as interacoes so fazem
    // sentido pra quem esta fisicamente la.
    if (mapKey === 'salaCopa') {
      const BREW_MS = 2600;
      this.brewing = new Set();

      this.onMessage('coffee:fazer', (client) => {
        const p = this.state.players.get(client.sessionId);
        if (!p || this.brewing.has(client.sessionId) || this.climbing.has(client.sessionId)) return;
        if (coffeeState.getState().ready) return; // ja tem cafe pronto

        const tile = this.currentTile(client.sessionId, p);
        if (!this.mapApi.stationAt(tile.x, tile.y, 'coffee')) return;

        this.brewing.add(client.sessionId);
        this.broadcast('coffee:brewing', { id: client.sessionId, ms: BREW_MS });
        this.clock.setTimeout(() => {
          this.brewing.delete(client.sessionId);
          const stillThere = this.state.players.get(client.sessionId);
          if (stillThere) coffeeState.markReady(stillThere.name);
        }, BREW_MS);
      });

      this.onMessage('coffee:pegar', (client) => {
        const p = this.state.players.get(client.sessionId);
        if (!p || p.holdingCoffee) return;
        const tile = this.currentTile(client.sessionId, p);
        if (!this.mapApi.stationAt(tile.x, tile.y, 'coffee')) return;
        if (coffeeState.takeCup()) p.holdingCoffee = true;
      });

      this.onMessage('coffee:descartar', (client) => {
        const p = this.state.players.get(client.sessionId);
        if (!p || !p.holdingCoffee) return;
        const tile = this.currentTile(client.sessionId, p);
        if (!this.mapApi.stationAt(tile.x, tile.y, 'sink')) return;
        p.holdingCoffee = false;
      });
    }

    // Sala Roxa: status (livre/ocupada + fila) vem do Google Calendar. So a
    // Sala Central precisa dele — e quem mostra a porta de reserva.
    if (mapKey === 'salaCentral') {
      this.salaRoxaState = { occupied: false, current: null, queue: [] };
      this.refreshSalaRoxa();
      this.clock.setInterval(() => this.refreshSalaRoxa(), 20000);

      this.onMessage('salaRoxa:status', (client) => {
        client.send('salaRoxa:update', this.salaRoxaState);
      });

      this.onMessage('salaRoxa:reservar', async (client, msg) => {
        const p = this.state.players.get(client.sessionId);
        if (!p) return;

        const title = sanitizeChat(msg?.title).slice(0, 60) || 'Reunião';
        const start = new Date(msg?.startISO);
        const end = new Date(msg?.endISO);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
          client.send('salaRoxa:reservarResult', { ok: false, error: 'Horário inválido.' });
          return;
        }
        if (end.getTime() <= start.getTime()) {
          client.send('salaRoxa:reservarResult', { ok: false, error: 'O horário de término precisa ser depois do início.' });
          return;
        }
        if (start.getTime() < Date.now() - 60000) {
          client.send('salaRoxa:reservarResult', { ok: false, error: 'Não dá para reservar em um horário que já passou.' });
          return;
        }
        if (end.getTime() - start.getTime() > 4 * 60 * 60 * 1000) {
          client.send('salaRoxa:reservarResult', { ok: false, error: 'Duração máxima de 4 horas.' });
          return;
        }

        try {
          const result = await calendarService.createReservation({
            title,
            organizer: p.name,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
          });
          client.send('salaRoxa:reservarResult', result);
          if (result.ok) await this.refreshSalaRoxa();
        } catch (err) {
          console.error('Erro ao reservar Sala Roxa:', err.message);
          client.send('salaRoxa:reservarResult', { ok: false, error: 'Erro ao conectar com o Google Calendar.' });
        }
      });
    }
  }

  /** Busca o status atual da Sala Roxa no Google Calendar e avisa a sala. */
  async refreshSalaRoxa() {
    try {
      this.salaRoxaState = await calendarService.getStatus();
    } catch (err) {
      console.error('Erro ao buscar status da Sala Roxa:', err.message);
      this.salaRoxaState = this.salaRoxaState || { occupied: false, current: null, queue: [] };
    }
    this.broadcast('salaRoxa:update', this.salaRoxaState);
  }

  /** Posicao atual (tile) do jogador, avancando o path se ja concluido. Muta p.x/p.y. */
  currentTile(sessionId, p) {
    const t = this.transient.get(sessionId);
    if (!t) return { x: p.x, y: p.y };

    const idx = Math.floor((Date.now() - t.pathStart) / WALK_MS_PER_TILE);
    if (idx >= t.path.length) {
      const last = t.path[t.path.length - 1];
      p.x = last.x;
      p.y = last.y;
      this.transient.delete(sessionId);
      this.checkDoor(sessionId, p);
      return { x: p.x, y: p.y };
    }
    return t.path[idx];
  }

  resolveMovements() {
    for (const [sessionId, p] of this.state.players.entries()) {
      this.currentTile(sessionId, p);
    }
  }

  /** Se o jogador acabou de parar em cima de uma porta, dispara a troca de sala. */
  checkDoor(sessionId, p) {
    const door = this.mapApi.doorAt(p.x, p.y);
    if (!door) return;
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!client) return;

    if (door.special === 'salaRoxa') {
      client.send('salaRoxa:open', this.salaRoxaState || { occupied: false, current: null, queue: [] });
      return;
    }

    if (!door.to) {
      client.send('system', { text: `🚧 ${door.label} ainda está em construção!` });
      return;
    }

    if (door.climb) {
      // porta "escada": toca a animacao de subir no cliente antes de trocar
      // de sala de verdade — o jogador fica travado (sem novos 'move') ate la.
      this.climbing.add(sessionId);
      client.send('climb', { label: door.label, ms: CLIMB_MS });
      this.clock.setTimeout(() => {
        this.climbing.delete(sessionId);
        const stillThere = this.state.players.get(sessionId);
        const stillClient = this.clients.find((c) => c.sessionId === sessionId);
        if (!stillThere || !stillClient) return;
        stillClient.send('changeRoom', { to: door.to, spawnAt: door.spawnAt || null });
      }, CLIMB_MS);
      return;
    }

    client.send('changeRoom', { to: door.to, spawnAt: door.spawnAt || null });
  }

  runCommand(client, p, text) {
    const cmd = text.slice(1).toLowerCase().split(/\s+/)[0];
    switch (cmd) {
      case 'dance':
      case 'dancar':
      case 'dançar': {
        const pos = { x: p.x, y: p.y };
        if (!this.transient.has(client.sessionId) && this.mapApi.isSeat(pos.x, pos.y)) {
          client.send('system', { text: 'Não dá para dançar sentado — levante primeiro.' });
          return;
        }
        p.dancing = !p.dancing;
        this.broadcast('system', { text: `${p.name} ${p.dancing ? 'começou a dançar 💃' : 'parou de dançar'}` });
        break;
      }
      case 'parar':
      case 'stop':
        p.dancing = false;
        break;
      default:
        client.send('system', { text: `Comando desconhecido: /${cmd}. Disponíveis: /dance, /parar` });
    }
  }

  onJoin(client, options) {
    const hint = options && options.spawnAt;
    const spawn = hint && this.mapApi.isWalkable(hint.x, hint.y)
      ? { x: clamp(Math.floor(hint.x), 0, this.mapApi.MAP_W - 1), y: clamp(Math.floor(hint.y), 0, this.mapApi.MAP_H - 1) }
      : this.mapApi.randomSpawn();
    this.pending.set(client.sessionId, spawn);
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) this.broadcast('system', { text: `${p.name} saiu da sala` }, { except: client });
    this.pending.delete(client.sessionId);
    this.transient.delete(client.sessionId);
    this.climbing.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    coffeeState.bus.off('update', this._onCoffeeUpdate);
    coffeeState.bus.off('ready', this._onCoffeeReady);
  }
}

module.exports = { GameRoom, GameState, Player };
