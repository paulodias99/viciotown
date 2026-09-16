import { findPath, type GridQuery } from './pathfinding.js';
import { tileSpec } from './tiles.js';
import type { DoorDef, MapDefinition, Point, StationDef, StationType, ZoneDef } from './types.js';

/**
 * API de consulta de uma sala. O mapa em si é só dados (`MapDefinition`);
 * este módulo fabrica as perguntas que servidor e cliente fazem sobre ele.
 *
 * Índices (portas, estações) são pré-calculados em `Map` porque `doorAt` roda
 * a cada tile pisado por cada jogador a 8Hz — varrer um array ali é a
 * diferença entre O(1) e O(portas) no caminho quente do tick.
 */
export interface WorldMap extends GridQuery {
  readonly key: MapDefinition['key'];
  readonly name: string;
  readonly tagline: string;
  readonly theme: MapDefinition['theme'];
  readonly tiles: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly doors: readonly DoorDef[];
  readonly stations: readonly StationDef[];
  readonly zones: readonly ZoneDef[];
  tileAt(x: number, y: number): string;
  isWalkable(x: number, y: number): boolean;
  isSeat(x: number, y: number): boolean;
  doorAt(x: number, y: number): DoorDef | null;
  stationAt(x: number, y: number, type?: StationType): StationDef | null;
  zoneAt(x: number, y: number): ZoneDef | null;
  findPath(start: Point, goal: Point, blocked?: (x: number, y: number) => boolean): Point[];
  randomSpawn(): Point;
  defaultSpawn(): Point;
  /** Tile andável mais próximo de `target` (usado para spawn e para o NPC). */
  nearestWalkable(target: Point, maxRadius?: number): Point;
}

export function createWorldMap(def: MapDefinition): WorldMap {
  const tiles = def.tiles;
  const height = tiles.length;
  const width = Math.max(...tiles.map((row) => row.length));

  const doors = def.doors ?? [];
  const stations = def.stations ?? [];
  const zones = def.zones ?? [];

  const index = (x: number, y: number): number => y * width + x;
  const doorIndex = new Map<number, DoorDef>(doors.map((d) => [index(d.x, d.y), d]));
  const stationIndex = new Map<number, StationDef>(stations.map((s) => [index(s.x, s.y), s]));

  function tileAt(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= width || y >= height) return '#';
    return tiles[y]![x] ?? '#';
  }

  const isWalkable = (x: number, y: number): boolean => !tileSpec(tileAt(x, y)).solid;
  const isSeat = (x: number, y: number): boolean => tileSpec(tileAt(x, y)).seat;

  function zoneAt(x: number, y: number): ZoneDef | null {
    for (const z of zones) {
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z;
    }
    return null;
  }

  const walkableTiles: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isWalkable(x, y) && !isSeat(x, y) && !doorIndex.has(index(x, y))) {
        walkableTiles.push({ x, y });
      }
    }
  }

  function nearestWalkable(target: Point, maxRadius = 8): Point {
    if (isWalkable(target.x, target.y) && !isSeat(target.x, target.y)) {
      return { x: target.x, y: target.y };
    }
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = target.x + dx;
          const y = target.y + dy;
          if (isWalkable(x, y) && !isSeat(x, y)) return { x, y };
        }
      }
    }
    return defaultSpawn();
  }

  function defaultSpawn(): Point {
    if (def.spawn && isWalkable(def.spawn.x, def.spawn.y)) return { ...def.spawn };
    return walkableTiles[0] ?? { x: 1, y: 1 };
  }

  function randomSpawn(): Point {
    if (walkableTiles.length === 0) return defaultSpawn();
    const preferred = def.spawn ? nearestWalkable(def.spawn) : null;
    // spawn espalhado em volta do ponto preferido da sala — evita a pilha de
    // avatares em cima do mesmo tile quando muita gente entra junto.
    if (preferred) {
      for (let tries = 0; tries < 24; tries++) {
        const x = preferred.x + Math.round((Math.random() - 0.5) * 6);
        const y = preferred.y + Math.round((Math.random() - 0.5) * 6);
        if (isWalkable(x, y) && !isSeat(x, y) && !doorIndex.has(index(x, y))) return { x, y };
      }
    }
    return { ...walkableTiles[Math.floor(Math.random() * walkableTiles.length)]! };
  }

  const map: WorldMap = {
    key: def.key,
    name: def.name,
    tagline: def.tagline,
    theme: def.theme,
    tiles,
    width,
    height,
    doors,
    stations,
    zones,
    tileAt,
    isWalkable,
    isSeat,
    doorAt: (x, y) => doorIndex.get(index(x, y)) ?? null,
    stationAt: (x, y, type) => {
      const s = stationIndex.get(index(x, y));
      if (!s) return null;
      return !type || s.type === type ? s : null;
    },
    zoneAt,
    findPath: (start, goal, blocked) =>
      findPath(blocked ? { ...map, isBlocked: blocked } : map, start, goal),
    randomSpawn,
    defaultSpawn,
    nearestWalkable,
  };

  return map;
}
