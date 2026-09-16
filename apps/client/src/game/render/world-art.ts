import type { WorldMap } from '@viciotown/shared';
import {
  HALF_H,
  HALF_W,
  TILE_HEIGHT,
  TILE_WIDTH,
  WALL_HEIGHT,
  shade,
  tileSpec,
  toScreen,
  worldBounds,
} from '@viciotown/shared';
import {
  bake,
  context2d,
  createCanvas,
  fillCircle,
  fillPolygon,
  fillRect,
  strokePolygon,
  type BakedTexture,
} from './canvas';
import { getTheme, type Theme } from './theme';

/**
 * Arte do cenário: móveis, paredes e piso.
 *
 * Móveis são iguais em qualquer sala (uma mesa é uma mesa), então cada tipo
 * vira UMA textura reaproveitada por todas as instâncias. Piso e parede
 * dependem do tema, então são assados por tema.
 */

const C = {
  wood: '#b5793f',
  deskTop: '#f2f0ea',
  deskLeg: '#3a3d42',
  chairGrey: '#8b8f96',
  chairOrange: '#e0842f',
  chairRose: '#b3707c',
  chairLilac: '#b7a0d6',
  sofaDark: '#2b2e35',
  sofaAccent: '#565c66',
  shelfWood: '#8a5a34',
  stone: '#e6e2d8',
};

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- primitivas

function diamondPoints(cx: number, cy: number, hw = HALF_W, hh = HALF_H) {
  return [
    [cx, cy - hh],
    [cx + hw, cy],
    [cx, cy + hh],
    [cx - hw, cy],
  ] as const;
}

const diamond = (ctx: Ctx, cx: number, cy: number, color: string, hw = HALF_W, hh = HALF_H): void =>
  fillPolygon(ctx, diamondPoints(cx, cy, hw, hh), color);

/** Prisma isométrico: face esquerda (normal +y), face direita (normal +x), topo. */
function prism(
  ctx: Ctx,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  h: number,
  top: string,
  left: string,
  right: string,
): void {
  const ty = cy - h;
  fillPolygon(
    ctx,
    [
      [cx - hw, ty],
      [cx, ty + hh],
      [cx, cy + hh],
      [cx - hw, cy],
    ],
    left,
  );
  fillPolygon(
    ctx,
    [
      [cx, ty + hh],
      [cx + hw, ty],
      [cx + hw, cy],
      [cx, cy + hh],
    ],
    right,
  );
  diamond(ctx, cx, ty, top, hw, hh);
}

const box = (ctx: Ctx, cx: number, cy: number, hw: number, hh: number, h: number, color: string): void =>
  prism(ctx, cx, cy, hw, hh, h, shade(color, 0.16), shade(color, -0.1), shade(color, -0.28));

// ---------------------------------------------------------------- móveis

function drawDesk(ctx: Ctx): void {
  box(ctx, 0, 0, 30, 15, 24, C.deskTop);
  box(ctx, -24, 8, 3, 3, 22, C.deskLeg);
  box(ctx, 24, 8, 3, 3, 22, C.deskLeg);
  const ty = -24;
  box(ctx, 2, ty + 2, 9, 5, 4, '#3a3f4a');
  fillRect(ctx, -8, ty - 16, 20, 13, '#2a2e36');
  fillRect(ctx, -7, ty - 15, 18, 11, '#5fd0e6');
  ctx.globalAlpha = 0.35;
  fillRect(ctx, -7, ty - 15, 18, 4, '#ffffff');
  ctx.globalAlpha = 1;
  fillRect(ctx, -9, ty + 5, 16, 5, '#d8d4c8');
  box(ctx, 18, ty + 2, 3, 2, 11, '#dce7e6');
}

function drawTable(ctx: Ctx): void {
  box(ctx, 0, 0, 30, 15, 20, '#9a6b45');
  ctx.globalAlpha = 0.25;
  fillRect(ctx, -10, -23, 20, 4, '#ffffff');
  ctx.globalAlpha = 1;
  box(ctx, -12, -16, 5, 2, 6, '#f2f2f2');
}

/** Mesa redonda: tampo bem maior que a coluna, então "flutua" sobre o pedestal. */
function drawRoundTable(ctx: Ctx): void {
  box(ctx, 0, 0, 10, 5, 8, shade(C.wood, -0.35));
  box(ctx, 0, -8, 6, 3, 12, C.wood);
  box(ctx, 0, -20, 27, 13.5, 4, C.wood);
  ctx.globalAlpha = 0.2;
  diamond(ctx, 0, -21.5, '#ffffff', 23, 11.5);
  ctx.globalAlpha = 1;
}

function chairBase(ctx: Ctx, seat: string, back: string): void {
  box(ctx, 0, 0, 8, 4, 13, '#333944');
  box(ctx, 0, -13, 17, 8.5, 5, seat);
  box(ctx, 0, -26, 15, 3.5, 22, back);
}

function drawAuditoriumSeat(ctx: Ctx): void {
  box(ctx, 0, 0, 9, 5, 8, '#2b2e35');
  box(ctx, 0, -8, 16, 8, 5, '#7a2f3a');
  box(ctx, 0, -20, 15, 3.5, 20, '#8f3a46');
  fillRect(ctx, -13, -30, 3, 10, '#2b2e35');
  fillRect(ctx, 10, -30, 3, 10, '#2b2e35');
}

function drawSofa(ctx: Ctx): void {
  box(ctx, 0, 0, 30, 15, 12, C.sofaDark);
  box(ctx, 0, -24, 27, 4, 20, shade(C.sofaDark, 0.06));
  box(ctx, -22, -12, 7, 4, 8, shade(C.sofaDark, 0.06));
  box(ctx, 22, -12, 7, 4, 8, shade(C.sofaDark, 0.06));
  ctx.globalAlpha = 0.6;
  diamond(ctx, 0, -12, C.sofaAccent, 24, 12);
  ctx.globalAlpha = 1;
}

function drawPouf(ctx: Ctx): void {
  box(ctx, 0, 0, 16, 8, 12, '#b7a0d6');
  ctx.globalAlpha = 0.25;
  diamond(ctx, 0, -12, '#ffffff', 13, 6.5);
  ctx.globalAlpha = 1;
}

function drawBench(ctx: Ctx): void {
  box(ctx, 0, 0, 5, 3, 9, '#5e4a33');
  box(ctx, 0, -9, 26, 10, 4, '#c9a86a');
  box(ctx, 0, -22, 24, 3, 14, '#b8975c');
}

function drawShelf(ctx: Ctx): void {
  box(ctx, 0, 0, 14, 7, 40, C.shelfWood);
  const ty = -40;
  fillRect(ctx, -11, ty + 10, 22, 2, shade(C.shelfWood, -0.3));
  fillRect(ctx, -11, ty + 22, 22, 2, shade(C.shelfWood, -0.3));
  ['#e14b4b', '#3fae63', '#f0a92b', '#20b6c9'].forEach((c, i) => {
    fillRect(ctx, -9 + i * 5, ty + 3, 3, 7, c);
  });
  fillCircle(ctx, 6, ty + 18, 5, '#2f7d4f');
}

function drawPlant(ctx: Ctx): void {
  box(ctx, 0, 0, 12, 6, 14, '#b5652f');
  const ty = -14;
  for (const [dx, dy, r] of [
    [0, -18, 13],
    [-9, -10, 9],
    [9, -11, 9],
    [0, -30, 9],
  ] as const) {
    fillCircle(ctx, dx, ty + dy, r, '#2f7d4f');
  }
  fillCircle(ctx, -4, ty - 22, 7, '#3f9d64');
}

function drawBush(ctx: Ctx): void {
  fillCircle(ctx, 0, -10, 14, '#2f6d42');
  fillCircle(ctx, -10, -4, 10, '#357a4a');
  fillCircle(ctx, 10, -5, 10, '#357a4a');
  fillCircle(ctx, -3, -20, 9, '#3f8f55');
  fillCircle(ctx, 5, -17, 7, '#2f6d42');
}

function drawUmbrella(ctx: Ctx): void {
  box(ctx, 0, 0, 7, 4, 4, '#8a8f99');
  fillRect(ctx, -1, -56, 3, 54, '#a9844f');
  const top = -56;
  fillPolygon(
    ctx,
    [
      [0, top - 6],
      [34, top + 10],
      [0, top + 20],
      [-34, top + 10],
    ],
    '#e14b4b',
  );
  fillPolygon(
    ctx,
    [
      [0, top - 6],
      [34, top + 10],
      [0, top + 20],
    ],
    '#c93c3c',
  );
  ctx.globalAlpha = 0.5;
  fillPolygon(
    ctx,
    [
      [0, top - 6],
      [12, top + 14],
      [0, top + 20],
      [-12, top + 14],
    ],
    '#f4f4f4',
  );
  ctx.globalAlpha = 1;
}

function drawCoffeeMachine(ctx: Ctx): void {
  box(ctx, 0, 0, 16, 8, 34, '#5a616e');
  const ty = -34;
  fillRect(ctx, -9, ty - 4, 18, 10, '#22262e');
  fillRect(ctx, -7, ty - 2, 3, 3, '#e14b4b');
  fillRect(ctx, -1, ty - 2, 8, 2, '#f0a92b');
  box(ctx, 5, ty + 3, 4, 2, 6, '#f2f2f2');
}

function drawFridge(ctx: Ctx): void {
  box(ctx, 0, 0, 13, 8, 46, '#d8dadd');
  fillRect(ctx, -2, -44, 3, 32, '#aeb2b8');
  fillRect(ctx, -10, -30, 2, 7, '#6b6f76');
  fillRect(ctx, 4, -30, 2, 7, '#6b6f76');
}

function drawCabinetMicrowave(ctx: Ctx): void {
  box(ctx, 0, 0, 16, 8, 30, '#c9c2b4');
  fillRect(ctx, -8, -24, 16, 11, '#2a2e36');
  fillRect(ctx, -6, -22, 11, 7, '#1c1f25');
  ctx.globalAlpha = 0.7;
  fillRect(ctx, 6, -21, 2, 5, '#f0a92b');
  ctx.globalAlpha = 1;
}

/** Bancada de terrazzo: os salpicos vêm de um PRNG com semente fixa, então a
 * textura é idêntica a cada bake (e portanto cacheável). */
function drawKitchenIsland(ctx: Ctx): void {
  box(ctx, 0, 0, 32, 16, 22, C.stone);
  const speck = ['#a9b6b2', '#c9a8a0', '#8a8f96'];
  let seed = 1337;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 1000) / 1000;
  };
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 12; i++) {
    fillRect(ctx, (rand() - 0.5) * 56, -22 + (rand() - 0.5) * 24, 2, 2, speck[i % speck.length]!);
  }
  ctx.globalAlpha = 1;
}

function drawLockers(ctx: Ctx): void {
  const wood = '#caa46a';
  box(ctx, 0, 0, 15, 7, 34, wood);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      fillRect(ctx, -11 + col * 8, -30 + row * 9, 6, 6, shade(wood, -0.35));
    }
  }
}

function drawSink(ctx: Ctx): void {
  box(ctx, 0, 0, 16, 8, 20, '#c9c5bb');
  const ty = -20;
  diamond(ctx, 0, ty, '#aeb2b8', 9, 4.5);
  fillRect(ctx, -1, ty - 12, 2, 9, '#7a7e85');
  fillRect(ctx, -1, ty - 12, 6, 2, '#7a7e85');
}

function drawWhiteboard(ctx: Ctx): void {
  box(ctx, 0, 0, 4, 3, 8, '#6b6f76');
  fillRect(ctx, -26, -54, 52, 46, '#f7f6f2');
  strokePolygon(
    ctx,
    [
      [-26, -54],
      [26, -54],
      [26, -8],
      [-26, -8],
    ],
    '#b9b2a4',
    2,
  );
  fillRect(ctx, -20, -46, 26, 3, '#2f7de1');
  fillRect(ctx, -20, -38, 34, 3, '#e14b4b');
  fillRect(ctx, -20, -30, 18, 3, '#3fae63');
  fillRect(ctx, -6, -14, 12, 3, '#d8d4c8');
}

function drawScreen(ctx: Ctx): void {
  fillRect(ctx, -46, -64, 92, 56, '#14161c');
  fillRect(ctx, -43, -61, 86, 50, '#1d2740');
  ctx.globalAlpha = 0.5;
  fillRect(ctx, -43, -61, 86, 16, '#2f7de1');
  ctx.globalAlpha = 1;
  fillCircle(ctx, 0, -36, 12, '#f0b93a', 0.9);
  fillRect(ctx, -6, -10, 12, 4, '#2a2e36');
}

function drawSpeaker(ctx: Ctx): void {
  box(ctx, 0, 0, 12, 6, 44, '#1c1f25');
  fillCircle(ctx, 0, -32, 8, '#3a3f4a');
  fillCircle(ctx, 0, -32, 4, '#14161c');
  fillCircle(ctx, 0, -14, 5, '#3a3f4a');
  fillRect(ctx, -7, -44, 14, 2, '#f0a92b');
}

function drawReceptionDesk(ctx: Ctx): void {
  const purple = '#4a2f7a';
  box(ctx, 0, 0, 22, 22, 30, purple);
  ctx.globalAlpha = 0.45;
  diamond(ctx, 0, -30, shade(purple, 0.22), 22, 22);
  ctx.globalAlpha = 0.35;
  diamond(ctx, 6, -14, shade(purple, -0.2), 14, 14);
  ctx.globalAlpha = 1;
  box(ctx, 0, -30, 20, 20, 4, shade(purple, 0.1));
}

/**
 * Escada maciça subindo na direção -y da grade (para o fundo da sala).
 *
 * O avanço por degrau tem que seguir o EIXO ISOMÉTRICO, não uma diagonal
 * qualquer de tela: um tile em -y vale (+TILE_WIDTH/2, -TILE_HEIGHT/2) na
 * tela, ou seja, 2 de x para cada 1 de y. Com uma proporção diferente (era
 * 10/-8) a escada lê como se estivesse deitada de lado, fora da perspectiva
 * do resto da sala. Mesma regra vale para o tampo de cada degrau, que é um
 * losango de proporção 2:1 como qualquer tile.
 */
const STAIR_STEPS = 6;
const STAIR_RISER = 9;
/** 8 e -4 mantêm a razão 2:1 do eixo isométrico; 6 degraus avançam 1,5 tile. */
const STAIR_STEP_DX = 8;
const STAIR_STEP_DY = -4;
const STAIR_HW = 30;
const STAIR_HH = 15;

function drawStaircase(ctx: Ctx): void {
  const tread = '#c9a86a';
  const side = '#3d2566';

  for (let i = 0; i < STAIR_STEPS; i++) {
    const sx = i * STAIR_STEP_DX;
    const sy = i * STAIR_STEP_DY;
    const h = STAIR_RISER * (i + 1);
    box(ctx, sx, sy, STAIR_HW, STAIR_HH, h, side);
    // Faixa de madeira no topo: é o "onde se pisa" de cada degrau.
    diamond(ctx, sx, sy - h, tread, STAIR_HW, STAIR_HH);
    strokePolygon(ctx, diamondPoints(sx, sy - h, STAIR_HW, STAIR_HH), shade(tread, -0.18), 1, 0.7);
  }

  // Corrimão do lado aberto, acompanhando a mesma inclinação dos degraus.
  const railBase = shade(side, 0.25);
  for (let i = 0; i < STAIR_STEPS; i += 1) {
    const sx = i * STAIR_STEP_DX + STAIR_HW * 0.55;
    const sy = i * STAIR_STEP_DY + STAIR_HH * 0.55;
    const h = STAIR_RISER * (i + 1);
    fillRect(ctx, sx - 1.5, sy - h - 16, 3, 16, railBase);
  }
}

/** Deslocamento de tela do pé ao topo da escada — a animação de subir usa isto. */
export function stairClimbOffset(): { dx: number; dy: number } {
  return {
    dx: STAIR_STEPS * STAIR_STEP_DX,
    dy: STAIR_STEPS * STAIR_STEP_DY - STAIR_RISER * STAIR_STEPS,
  };
}

const FURNITURE_PAINTERS: Record<string, (ctx: Ctx) => void> = {
  D: drawDesk,
  T: drawTable,
  O: drawRoundTable,
  c: (ctx) => chairBase(ctx, C.chairGrey, shade(C.chairGrey, -0.22)),
  o: (ctx) => chairBase(ctx, C.chairOrange, shade(C.chairOrange, -0.22)),
  r: (ctx) => chairBase(ctx, C.chairLilac, C.chairRose),
  a: drawAuditoriumSeat,
  S: drawSofa,
  p: drawPouf,
  b: drawBench,
  P: drawPlant,
  H: drawBush,
  U: drawUmbrella,
  K: drawCoffeeMachine,
  F: drawShelf,
  G: drawFridge,
  M: drawCabinetMicrowave,
  I: drawKitchenIsland,
  N: drawLockers,
  X: drawSink,
  B: drawWhiteboard,
  Q: drawScreen,
  J: drawSpeaker,
  A: drawStaircase,
  Z: drawReceptionDesk,
};

export const FURNITURE_TILES = Object.keys(FURNITURE_PAINTERS);

export function bakeFurniture(tile: string): BakedTexture | null {
  const painter = FURNITURE_PAINTERS[tile];
  if (!painter) return null;
  return bake((ctx) => painter(ctx), 320);
}

// ---------------------------------------------------------------- paredes

function drawWall(ctx: Ctx, kind: string, theme: Theme): void {
  prism(ctx, 0, 0, HALF_W, HALF_H, WALL_HEIGHT, theme.wallTop, theme.wallLeft, theme.wallRight);
  const top = -WALL_HEIGHT;

  if (kind === 'V') {
    // Janela na face voltada para a sala (normal +y = face esquerda).
    fillPolygon(
      ctx,
      [
        [-24, top + 14],
        [-2, top + 25],
        [-2, top + 53],
        [-24, top + 42],
      ],
      '#9a8fe0',
    );
    strokePolygon(
      ctx,
      [
        [-24, top + 14],
        [-2, top + 25],
        [-2, top + 53],
        [-24, top + 42],
      ],
      '#f2efe8',
      2,
    );
    ctx.strokeStyle = '#f2efe8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, top + 19.5);
    ctx.lineTo(-13, top + 47.5);
    ctx.stroke();
  } else if (kind === 'W') {
    const frame = [
      [-26, top + 12],
      [-1, top + 24.5],
      [-1, top + 50.5],
      [-26, top + 38],
    ] as const;
    fillPolygon(ctx, frame, '#f7f6f2');
    strokePolygon(ctx, frame, '#b9b2a4', 1.5);
    ctx.strokeStyle = '#2f7de1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-21, top + 22);
    ctx.lineTo(-7, top + 29);
    ctx.moveTo(-21, top + 29);
    ctx.lineTo(-11, top + 34);
    ctx.stroke();
  } else if (kind === 'Y') {
    const accent = theme.wallAccent;
    fillCircle(ctx, -12, top + 30, 14, accent, 0.85);
    fillCircle(ctx, 6, top + 20, 11, accent, 0.85);
    fillCircle(ctx, 14, top + 38, 10, accent, 0.85);
    fillCircle(ctx, 2, top + 42, 9, accent, 0.5);
  } else if (kind === 'L') {
    const glow = '#f6b93b';
    fillPolygon(
      ctx,
      [
        [-25, top + 8],
        [-2, top + 20.5],
        [-2, top + 56],
        [-25, top + 43.5],
      ],
      shade(glow, -0.25),
    );
    const panel = (a: number, b: number): void =>
      fillPolygon(
        ctx,
        [
          [-23, top + 9 + a],
          [-4, top + 20 + a],
          [-4, top + 20 + b],
          [-23, top + 9 + b],
        ],
        glow,
      );
    panel(0, 15);
    panel(19, 34);
  }
}

export function bakeWall(kind: string, theme: Theme): BakedTexture {
  return bake((ctx) => drawWall(ctx, kind, theme), 256);
}

// ---------------------------------------------------------------- piso

export interface BakedFloor {
  canvas: HTMLCanvasElement;
  /** Canto superior esquerdo da textura, em coordenadas de mundo. */
  originX: number;
  originY: number;
}

/**
 * Assa o piso inteiro da sala numa textura só.
 *
 * Um mapa de 21×14 são 294 losangos com contorno — ~600 operações de path.
 * Antes isso rodava a CADA frame; agora roda uma vez por sala e vira uma
 * única imagem que a GPU desenha em um draw call.
 */
export function bakeFloor(map: WorldMap, themeName = map.theme): BakedFloor {
  const theme = getTheme(themeName);
  const bounds = worldBounds(map.width, map.height);
  const canvas = createCanvas(bounds.width + TILE_WIDTH, bounds.height + TILE_HEIGHT);
  const ctx = context2d(canvas);

  const originX = bounds.minX - HALF_W;
  const originY = bounds.minY - HALF_H;
  ctx.translate(-originX, -originY);

  for (let gy = 0; gy < map.height; gy++) {
    for (let gx = 0; gx < map.width; gx++) {
      const spec = tileSpec(map.tileAt(gx, gy));
      if (spec.wall) continue;

      const { x, y } = toScreen(gx, gy);
      const checker = (gx + gy) % 2 === 0;

      let fill: string;
      switch (spec.floor) {
        case 'rug':
          fill = checker ? theme.rug : theme.rugAlt;
          break;
        case 'deck':
          fill = checker ? theme.deck : theme.deckAlt;
          break;
        case 'grass':
          fill = checker ? theme.grass : theme.grassAlt;
          break;
        case 'stage':
          fill = checker ? theme.stage : theme.stageAlt;
          break;
        default:
          fill = checker ? theme.floorA : theme.floorB;
      }

      diamond(ctx, x, y, fill);
      const isPlain = spec.floor === null || spec.floor === 'floor';
      strokePolygon(
        ctx,
        diamondPoints(x, y),
        isPlain ? theme.floorLine : '#000000',
        1,
        isPlain ? 1 : 0.06,
      );
    }
  }

  return { canvas, originX, originY };
}

/** Losango de destaque (hover / destino do clique), como textura reaproveitável. */
export function bakeHighlight(color: string): BakedTexture {
  return bake((ctx) => {
    strokePolygon(ctx, diamondPoints(0, 0, HALF_W - 2, HALF_H - 1), color, 2, 0.95);
  }, 128);
}

/** Tapete de porta com a seta. `built = false` desenha a versão "em construção". */
export function bakeDoor(accent: string, built: boolean): BakedTexture {
  return bake((ctx) => {
    ctx.globalAlpha = 0.8;
    diamond(ctx, 0, 0, accent, HALF_W - 12, HALF_H - 6);
    ctx.globalAlpha = 1;
    strokePolygon(ctx, diamondPoints(0, 0, HALF_W - 12, HALF_H - 6), shade(accent, 0.3), 2, 0.9);
    ctx.globalAlpha = built ? 0.9 : 0.5;
    fillPolygon(
      ctx,
      [
        [-4, -5],
        [5, 0],
        [-4, 5],
      ],
      '#ffffff',
    );
    ctx.globalAlpha = 1;
  }, 128);
}

export { getTheme };
