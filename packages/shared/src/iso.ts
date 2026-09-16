import { TILE_HEIGHT, TILE_WIDTH, WALL_HEIGHT } from './constants.js';

const HALF_W = TILE_WIDTH / 2;
const HALF_H = TILE_HEIGHT / 2;

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Grade isométrica → tela. Origem no centro do tile (0,0). */
export function toScreen(gx: number, gy: number): ScreenPoint {
  return { x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H };
}

/**
 * Inverso de `toScreen`. Arredonda (não trunca): o centro do tile é o valor
 * inteiro exato nos eixos isométricos, então a região do tile é
 * [n-0.5, n+0.5) — exatamente o losango desenhado na tela.
 */
export function toTile(sx: number, sy: number): ScreenPoint {
  return {
    x: Math.round(sx / TILE_WIDTH + sy / TILE_HEIGHT),
    y: Math.round(sy / TILE_HEIGHT - sx / TILE_WIDTH),
  };
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export function worldBounds(mapWidth: number, mapHeight: number): WorldBounds {
  const minX = -(mapHeight - 1) * HALF_W - HALF_W;
  const maxX = (mapWidth - 1) * HALF_W + HALF_W;
  const minY = -WALL_HEIGHT - HALF_H;
  const maxY = (mapWidth - 1 + mapHeight - 1) * HALF_H + HALF_H;
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/** Profundidade de pintura: quem tem `gx + gy` maior está na frente. */
export function depthOf(gx: number, gy: number, bias = 0): number {
  return (gx + gy) * 16 + bias;
}

export { HALF_W, HALF_H };
