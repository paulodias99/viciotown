import type { MapKey, Point, WorldMap } from '@viciotown/shared';
import {
  BUBBLE_MS,
  CLIMB_MS,
  MAPS,
  createWorldMap,
  decodeRoute,
  depthOf,
  lookKey,
  sampleRoute,
  tileSpec,
  toScreen,
  toTile,
  worldBounds,
} from '@viciotown/shared';
import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { connection } from '../../net/client';
import type { OfficeView, PlayerView } from '../../net/schema';
import { useGame, type StationPrompt } from '../../store/game';
import { useProfile } from '../../store/profile';
import {
  CELL_H,
  CELL_W,
  COLUMNS_PER_DIR,
  FRAME_MS,
  ORIGIN_X,
  ORIGIN_Y,
  TOTAL_FRAMES,
  bakeAvatarSheet,
  bakeCup,
  bakeShadow,
  columnForPose,
  frameIndex,
  handOffset,
} from '../render/avatar';
import {
  bakeDoor,
  bakeFloor,
  bakeFurniture,
  bakeHighlight,
  bakeWall,
  getTheme,
  stairClimbOffset,
} from '../render/world-art';

interface AvatarView {
  shadow: Phaser.GameObjects.Image;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
  cup: Phaser.GameObjects.Image;
  lookKey: string;
  routeKey: string;
  routePath: Point[];
}

interface Bubble {
  text: string;
  until: number;
}

const TAP_SLOP = 12;
const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Inter, Verdana, Geneva, sans-serif',
  fontSize: '11px',
  fontStyle: 'bold',
  color: '#ffffff',
  padding: { x: 6, y: 2 },
};

/**
 * A cena do mundo.
 *
 * Diferença estrutural para a versão anterior: nada aqui desenha formas por
 * frame. Piso, paredes e móveis são texturas assadas uma vez; avatares são
 * sprites de uma folha gerada por aparência. O `update` só move objetos e
 * escolhe frames — que é o que permite isso rodar liso em celular.
 */
export class WorldScene extends Phaser.Scene {
  private map!: WorldMap;
  private mapKey: MapKey = 'salaPrincipal';
  private room: Room<OfficeView> | null = null;

  private staticLayer: Phaser.GameObjects.GameObject[] = [];
  private readonly avatars = new Map<string, AvatarView>();
  private readonly bubbles = new Map<string, Bubble>();

  private hoverMarker!: Phaser.GameObjects.Image;
  private targetMarker!: Phaser.GameObjects.Image;
  private targetUntil = 0;

  private baseZoom = 1;
  private zoomFactor = 1;
  private center: Point = { x: 0, y: 0 };
  private following = true;

  private pointerDownAt: { x: number; y: number; time: number } | null = null;
  private dragging = false;
  private pinchDistance = 0;

  private lastPromptCheck = 0;
  private unsubscribeRoom: (() => void) | null = null;
  /** Tile da escada desta sala, se houver — a animação de subir mira nela. */
  private stairTile: Point | null = null;

  constructor() {
    super('world');
  }

  create(): void {
    this.cameras.main.setRoundPixels(true);
    this.hoverMarker = this.add.image(0, 0, this.ensureHighlight('#ffffff')).setDepth(500).setVisible(false);
    this.targetMarker = this.add.image(0, 0, this.ensureHighlight('#5fd0e6')).setDepth(501).setVisible(false);

    this.input.addPointer(2); // habilita o segundo dedo (pinça)
    this.bindInput();

    this.unsubscribeRoom = connection.onRoom((room, mapKey) => this.enterRoom(room, mapKey));
    this.scale.on('resize', () => this.fitCamera());
    this.events.once('shutdown', () => this.unsubscribeRoom?.());
  }

  // ------------------------------------------------------------ construção

  private enterRoom(room: Room<OfficeView>, mapKey: MapKey): void {
    this.room = room;
    this.mapKey = mapKey;
    this.map = createWorldMap(MAPS[mapKey]);

    this.clearWorld();
    this.buildStatic();
    this.fitCamera();
    this.following = useProfile.getState().settings.followCamera;

    this.cameras.main.setBackgroundColor(getTheme(this.map.theme).backdrop);

    room.onMessage('chat', (line: { id: string; text: string; channel: string }) => {
      if (line.channel === 'system' || line.channel === 'announce') return;
      this.bubbles.set(line.id, { text: line.text, until: performance.now() + BUBBLE_MS });
    });
  }

  private clearWorld(): void {
    for (const object of this.staticLayer) object.destroy();
    this.staticLayer = [];
    for (const view of this.avatars.values()) destroyAvatar(view);
    this.avatars.clear();
    this.bubbles.clear();
    this.targetMarker.setVisible(false);
    this.hoverMarker.setVisible(false);
  }

  private buildStatic(): void {
    const themeName = this.map.theme;
    this.stairTile = null;

    // ---- piso: uma textura para a sala inteira
    const floorKey = `floor:${this.mapKey}:${themeName}`;
    if (!this.textures.exists(floorKey)) {
      const floor = bakeFloor(this.map, themeName);
      this.textures.addCanvas(floorKey, floor.canvas);
      this.textures.get(floorKey).setDataSource(floor.canvas);
      this.registry.set(`${floorKey}:origin`, { x: floor.originX, y: floor.originY });
    }
    const origin = this.registry.get(`${floorKey}:origin`) as Point;
    this.staticLayer.push(
      this.add.image(origin.x, origin.y, floorKey).setOrigin(0, 0).setDepth(-10_000),
    );

    // ---- portas (tapete no chão, sob os móveis e avatares)
    for (const door of this.map.doors) {
      const accent = door.opens === 'meetingRoom' ? '#8e5cd9' : door.to ? '#2f7de1' : '#5a5f68';
      const key = `door:${accent}:${door.to ? 1 : 0}`;
      this.ensureTexture(key, () => bakeDoor(accent, Boolean(door.to)));
      const { x, y } = toScreen(door.x, door.y);
      const anchor = this.anchorOf(key);
      this.staticLayer.push(
        this.add.image(x - anchor.x, y - anchor.y, key).setOrigin(0, 0).setDepth(-9000),
      );

      const label = this.add
        .text(x, y - 30, door.to || door.opens ? `${door.label} →` : `🚧 ${door.label}`, {
          ...LABEL_STYLE,
          backgroundColor: door.to || door.opens ? 'rgba(47,125,225,0.88)' : 'rgba(30,34,42,0.75)',
        })
        .setOrigin(0.5, 1)
        .setDepth(depthOf(door.x, door.y, 4));
      this.staticLayer.push(label);
    }

    // ---- paredes e móveis, ordenados por profundidade isométrica
    for (let gy = 0; gy < this.map.height; gy++) {
      for (let gx = 0; gx < this.map.width; gx++) {
        const tile = this.map.tileAt(gx, gy);
        const spec = tileSpec(tile);

        if (spec.wall) {
          // Só as paredes norte e oeste são desenhadas: as do sul e do leste
          // ficam sólidas mas invisíveis, senão a câmera não enxerga a sala.
          if (gy !== 0 && gx !== 0) continue;
          const key = `wall:${tile}:${themeName}`;
          this.ensureTexture(key, () => bakeWall(tile, getTheme(themeName)));
          this.placeAt(key, gx, gy, 0);
          continue;
        }

        if (spec.floor !== null) continue;

        if (tile === 'A') this.stairTile = { x: gx, y: gy };

        const key = `furn:${tile}`;
        if (!this.textures.exists(key)) {
          const baked = bakeFurniture(tile);
          if (!baked) continue;
          this.textures.addCanvas(key, baked.canvas);
          this.registry.set(`${key}:anchor`, { x: baked.anchorX, y: baked.anchorY });
        }
        this.placeAt(key, gx, gy, 0);
      }
    }
  }

  private placeAt(key: string, gx: number, gy: number, bias: number): void {
    const { x, y } = toScreen(gx, gy);
    const anchor = this.anchorOf(key);
    const image = this.add
      .image(x - anchor.x, y - anchor.y, key)
      .setOrigin(0, 0)
      .setDepth(depthOf(gx, gy, bias));
    this.staticLayer.push(image);
  }

  private ensureTexture(key: string, make: () => { canvas: HTMLCanvasElement; anchorX: number; anchorY: number }): void {
    if (this.textures.exists(key)) return;
    const baked = make();
    this.textures.addCanvas(key, baked.canvas);
    this.registry.set(`${key}:anchor`, { x: baked.anchorX, y: baked.anchorY });
  }

  private anchorOf(key: string): Point {
    return (this.registry.get(`${key}:anchor`) as Point | undefined) ?? { x: 0, y: 0 };
  }

  private ensureHighlight(color: string): string {
    const key = `hl:${color}`;
    this.ensureTexture(key, () => bakeHighlight(color));
    return key;
  }

  // ------------------------------------------------------------ avatares

  /**
   * Folha de sprites por aparência. Duas pessoas com o mesmo visual
   * compartilham a mesma textura — e trocar de roupa só custa uma geração.
   */
  private ensureAvatarSheet(look: PlayerView['look']): string {
    const key = `avatar:${lookKey(look)}`;
    if (this.textures.exists(key)) return key;

    const canvas = bakeAvatarSheet(look);
    const texture = this.textures.addCanvas(key, canvas);
    if (texture) {
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        const col = i % COLUMNS_PER_DIR;
        const row = Math.floor(i / COLUMNS_PER_DIR);
        texture.add(i, 0, col * CELL_W, row * CELL_H, CELL_W, CELL_H);
      }
    }
    return key;
  }

  private ensureShadow(): string {
    const key = 'avatar:shadow';
    if (!this.textures.exists(key)) this.textures.addCanvas(key, bakeShadow());
    return key;
  }

  private ensureCup(): string {
    const key = 'avatar:cup';
    if (!this.textures.exists(key)) this.textures.addCanvas(key, bakeCup());
    return key;
  }

  private createAvatar(sessionId: string, player: PlayerView): AvatarView {
    const sheet = this.ensureAvatarSheet(player.look);
    const isSelf = sessionId === this.room?.sessionId;

    const view: AvatarView = {
      shadow: this.add.image(0, 0, this.ensureShadow()).setOrigin(0.5, 0.5).setAlpha(0.8),
      sprite: this.add.sprite(0, 0, sheet, 0).setOrigin(ORIGIN_X, ORIGIN_Y),
      label: this.add
        .text(0, 0, player.name, {
          ...LABEL_STYLE,
          backgroundColor: isSelf ? '#2f7de1' : player.isBot ? '#8e5cd9' : '#14161c',
        })
        .setOrigin(0.5, 0)
        .setDepth(100_000),
      bubble: this.add
        .text(0, 0, '', {
          ...LABEL_STYLE,
          color: '#1b1f27',
          backgroundColor: '#ffffff',
          align: 'center',
          wordWrap: { width: 170 },
        })
        .setOrigin(0.5, 1)
        .setDepth(100_001)
        .setVisible(false),
      cup: this.add.image(0, 0, this.ensureCup()).setOrigin(0.5, 0.5).setVisible(false),
      lookKey: lookKey(player.look),
      routeKey: '',
      routePath: [],
    };

    this.avatars.set(sessionId, view);
    return view;
  }

  // ------------------------------------------------------------ loop

  override update(): void {
    const room = this.room;
    if (!room?.state?.players) return;

    const now = connection.now();
    const localNow = performance.now();
    const selfId = room.sessionId;
    const seen = new Set<string>();
    let selfScreenX = 0;
    let selfScreenY = 0;
    let hasSelf = false;

    room.state.players.forEach((player, sessionId) => {
      seen.add(sessionId);
      let view = this.avatars.get(sessionId);
      if (!view) view = this.createAvatar(sessionId, player);

      // ---- aparência
      const currentLook = lookKey(player.look);
      if (view.lookKey !== currentLook) {
        view.lookKey = currentLook;
        view.sprite.setTexture(this.ensureAvatarSheet(player.look));
      }

      // ---- posição: decodifica a rota só quando ela muda
      if (view.routeKey !== player.route) {
        view.routeKey = player.route;
        view.routePath = decodeRoute(player.route);
      }
      const sample = sampleRoute(
        { x: player.x, y: player.y },
        view.routePath,
        now - player.routeStartedAt,
        player.dir,
      );

      let screen = toScreen(sample.x, sample.y);
      let scale = 1;

      // ---- animações que deslocam o avatar do tile
      if (player.pose === 'climb' && player.poseUntil > now) {
        // Interpola da posição atual até o TOPO real do último degrau, em vez
        // de aplicar um deslocamento fixo: o avatar sai do tile da porta, que
        // fica um tile antes da escada, e um offset cego o deixava subindo ao
        // lado dos degraus em vez de sobre eles.
        const t = Phaser.Math.Clamp(1 - (player.poseUntil - now) / CLIMB_MS, 0, 1);
        const offset = stairClimbOffset();
        const base = this.stairTile ? toScreen(this.stairTile.x, this.stairTile.y) : screen;
        const topX = base.x + offset.dx;
        const topY = base.y + offset.dy;
        screen = {
          x: screen.x + (topX - screen.x) * t,
          y: screen.y + (topY - screen.y) * t,
        };
        scale = 1 - t * 0.15;
      } else if (player.pose === 'brew' && player.poseUntil > now) {
        screen = { x: screen.x, y: screen.y + Math.sin(localNow / 140) * 3 };
      }

      // ---- frame da animação
      const moving = sample.moving;
      const column = columnForPose(player.pose, moving);
      const step = Math.floor(localNow / FRAME_MS[column]);
      const dir = player.pose === 'climb' ? 2 : sample.dir;
      view.sprite.setFrame(frameIndex(dir, column, step));

      const depth = depthOf(sample.x, sample.y, 8);
      view.sprite.setPosition(screen.x, screen.y).setDepth(depth).setScale(scale);
      view.sprite.setAlpha(player.status === 'away' ? 0.55 : 1);
      view.shadow
        .setPosition(screen.x, screen.y)
        .setDepth(depth - 1)
        .setScale(scale * (column === 'sit' ? 0.7 : 1))
        .setAlpha(column === 'sit' ? 0.4 : 0.8);

      // ---- nome e recado
      const suffix =
        player.status === 'busy' ? ' 🔴' : player.status === 'meeting' ? ' 📅' : player.status === 'away' ? ' 💤' : '';
      const labelText = player.name + suffix;
      if (view.label.text !== labelText) view.label.setText(labelText);
      view.label.setPosition(screen.x, screen.y + 6);

      // ---- balão de fala
      const bubble = this.bubbles.get(sessionId);
      if (bubble && localNow < bubble.until) {
        if (view.bubble.text !== bubble.text) view.bubble.setText(bubble.text);
        view.bubble.setPosition(screen.x, screen.y - CELL_H + 6).setVisible(true);
      } else {
        view.bubble.setVisible(false);
      }

      // ---- xícara na mão (segue a mão de verdade, não um ponto fixo)
      view.cup.setVisible(player.holdingCoffee);
      if (player.holdingCoffee) {
        const hand = handOffset(dir, column, step);
        view.cup
          .setPosition(screen.x + hand.x * scale, screen.y + hand.y * scale)
          .setScale(scale)
          // De costas (direções 2 e 3) a mão fica do outro lado do corpo:
          // a xícara passa para trás do avatar em vez de flutuar na frente.
          .setDepth(dir >= 2 ? depth - 0.5 : depth + 0.5);
      }

      if (sessionId === selfId) {
        selfScreenX = screen.x;
        selfScreenY = screen.y;
        hasSelf = true;
      }
    });

    // ---- remove quem saiu
    for (const [sessionId, view] of this.avatars) {
      if (seen.has(sessionId)) continue;
      destroyAvatar(view);
      this.avatars.delete(sessionId);
      this.bubbles.delete(sessionId);
    }

    if (this.targetUntil && localNow > this.targetUntil) {
      this.targetMarker.setVisible(false);
      this.targetUntil = 0;
    }

    if (this.following && hasSelf) {
      const cam = this.cameras.main;
      // Lerp em vez de `startFollow`: o follow do Phaser briga com o pan
      // manual e com o pinch, e o usuário perde o controle da câmera.
      cam.scrollX += (selfScreenX - cam.width / 2 / cam.zoom - cam.scrollX) * 0.12;
      cam.scrollY += (selfScreenY - cam.height / 2 / cam.zoom - cam.scrollY) * 0.12;
    }

    if (localNow - this.lastPromptCheck > 200) {
      this.lastPromptCheck = localNow;
      this.updateStationPrompt();
    }
  }

  /** Detecta em que "estação" o jogador parou e oferece a ação correspondente. */
  private updateStationPrompt(): void {
    const room = this.room;
    const game = useGame.getState();
    const me = room?.state.players.get(room.sessionId);
    if (!room || !me) {
      if (game.stationPrompt) game.setStationPrompt(null);
      return;
    }

    const now = connection.now();
    const sample = sampleRoute(
      { x: me.x, y: me.y },
      decodeRoute(me.route),
      now - me.routeStartedAt,
      me.dir,
    );
    if (sample.moving) {
      if (game.stationPrompt) game.setStationPrompt(null);
      return;
    }

    const station = this.map.stationAt(Math.round(sample.x), Math.round(sample.y));
    let prompt: StationPrompt | null = null;

    if (station) {
      const coffee = game.coffee;
      switch (station.type) {
        case 'coffee':
          if (coffee.brewingUntil && coffee.brewingUntil > Date.now()) prompt = null;
          else if (coffee.ready && !me.holdingCoffee)
            prompt = { station: 'coffee', label: '☕ Pegar café' };
          else if (!coffee.ready) prompt = { station: 'coffee', label: '☕ Fazer café' };
          break;
        case 'sink':
          if (me.holdingCoffee) prompt = { station: 'sink', label: '🚰 Lavar xícara' };
          break;
        case 'fridge':
          prompt = { station: 'fridge', label: '🧊 Abrir geladeira' };
          break;
        case 'whiteboard':
          prompt = {
            station: 'whiteboard',
            label: '📝 Escrever no quadro',
            needsText: 'O que escrever no quadro?',
          };
          break;
        case 'screen':
          prompt = {
            station: 'screen',
            label: '🎤 Falar no microfone',
            needsText: 'Seu anúncio vai aparecer em todas as salas:',
          };
          break;
        case 'speaker':
          prompt = { station: 'speaker', label: '🔊 Ligar o som' };
          break;
      }
    }

    const current = game.stationPrompt;
    if (current?.station !== prompt?.station || current?.label !== prompt?.label) {
      game.setStationPrompt(prompt);
    }
  }

  // ------------------------------------------------------------ câmera

  fitCamera(): void {
    if (!this.map) return;
    const bounds = worldBounds(this.map.width, this.map.height);
    const { width, height } = this.scale;
    const fit = Math.min((width - 24) / bounds.width, (height - 40) / bounds.height);

    // Em telas pequenas, encaixar a sala inteira deixa o avatar com 20px de
    // altura. Melhor usar um zoom legível e seguir o jogador.
    const small = width < 720;
    this.baseZoom = small ? Math.max(fit, 1.1) : fit >= 2 ? 2 : fit >= 0.9 ? 1 : Math.max(0.45, fit);
    this.zoomFactor = 1;
    this.center = {
      x: bounds.minX + bounds.width / 2,
      y: bounds.minY + bounds.height / 2,
    };
    this.following = small ? true : useProfile.getState().settings.followCamera;
    this.applyZoom(true);
  }

  private applyZoom(recenter = false): void {
    const cam = this.cameras.main;
    cam.setZoom(this.baseZoom * this.zoomFactor);
    if (recenter) cam.centerOn(this.center.x, this.center.y);
  }

  recenter(): void {
    this.following = true;
    const room = this.room;
    const me = room?.state.players.get(room.sessionId);
    if (!me) {
      this.applyZoom(true);
      return;
    }
    const { x, y } = toScreen(me.x, me.y);
    this.cameras.main.centerOn(x, y);
  }

  setZoomFactor(factor: number): void {
    this.zoomFactor = Phaser.Math.Clamp(factor, 0.55, 2.6);
    this.applyZoom();
  }

  get zoom(): number {
    return this.zoomFactor;
  }

  // ------------------------------------------------------------ input

  private bindInput(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // Pinça: dois dedos controlam zoom, e nesse caso nada de hover/pan.
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        this.handlePinch();
        return;
      }

      if (pointer.isDown && this.pointerDownAt) {
        const moved = Math.hypot(
          pointer.x - this.pointerDownAt.x,
          pointer.y - this.pointerDownAt.y,
        );
        if (moved > TAP_SLOP) {
          this.dragging = true;
          this.following = false;
          const cam = this.cameras.main;
          cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
          cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
        }
        return;
      }

      if (pointer.wasTouch) return;
      const tile = toTile(pointer.worldX, pointer.worldY);
      if (this.map.isWalkable(tile.x, tile.y)) {
        const { x, y } = toScreen(tile.x, tile.y);
        const anchor = this.anchorOf(this.hoverMarker.texture.key);
        this.hoverMarker.setPosition(x - anchor.x, y - anchor.y).setOrigin(0, 0).setVisible(true);
      } else {
        this.hoverMarker.setVisible(false);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerDownAt = { x: pointer.x, y: pointer.y, time: performance.now() };
      this.dragging = false;
      this.pinchDistance = 0;
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const down = this.pointerDownAt;
      this.pointerDownAt = null;
      if (!down || this.dragging) return;
      if (useGame.getState().locked) return;
      if (this.input.pointer2.isDown) return;

      const tile = toTile(pointer.worldX, pointer.worldY);
      this.moveTo(tile);
    });

    this.input.on('gameout', () => this.hoverMarker.setVisible(false));

    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
        const cam = this.cameras.main;
        const before = cam.getWorldPoint(pointer.x, pointer.y);
        this.setZoomFactor(this.zoomFactor - dy * 0.0016);
        // `getWorldPoint` lê uma matriz recalculada só no preRender. Sem
        // forçar aqui, a leitura "depois" ainda usaria a matriz de ANTES do
        // zoom, e a câmera "pula" para o centro a cada scroll.
        cam.preRender();
        const after = cam.getWorldPoint(pointer.x, pointer.y);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
        this.following = false;
      },
    );
  }

  private handlePinch(): void {
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
    if (this.pinchDistance === 0) {
      this.pinchDistance = distance;
      return;
    }
    const ratio = distance / this.pinchDistance;
    this.pinchDistance = distance;
    this.setZoomFactor(this.zoomFactor * ratio);
    this.dragging = true;
  }

  /** Move para um tile — usado pelo clique, pelo teclado e pelo joystick. */
  moveTo(tile: Point): boolean {
    if (!this.map.isWalkable(tile.x, tile.y)) return false;
    const occupant = this.room?.state.seats.get(`${tile.x},${tile.y}`);
    if (occupant && occupant !== this.room?.sessionId) {
      useGame.getState().pushSystem('Esse assento já está ocupado.', 'warn');
      return false;
    }

    connection.send('move', { x: tile.x, y: tile.y });
    const { x, y } = toScreen(tile.x, tile.y);
    const anchor = this.anchorOf(this.targetMarker.texture.key);
    this.targetMarker.setPosition(x - anchor.x, y - anchor.y).setOrigin(0, 0).setVisible(true);
    this.targetUntil = performance.now() + 900;
    return true;
  }

  /** Passo cardeal a partir de onde o avatar está agora. */
  step(dx: number, dy: number): void {
    const room = this.room;
    const me = room?.state.players.get(room.sessionId);
    if (!me || useGame.getState().locked) return;
    const now = connection.now();
    const sample = sampleRoute(
      { x: me.x, y: me.y },
      decodeRoute(me.route),
      now - me.routeStartedAt,
      me.dir,
    );
    this.moveTo({ x: Math.round(sample.x) + dx, y: Math.round(sample.y) + dy });
  }
}

function destroyAvatar(view: AvatarView): void {
  view.shadow.destroy();
  view.sprite.destroy();
  view.label.destroy();
  view.bubble.destroy();
  view.cup.destroy();
}
