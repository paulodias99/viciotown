import type { MapDefinition, MapKey } from '../types.js';
import { auditorio } from './auditorio.js';
import { jardim } from './jardim.js';
import { salaCentral } from './sala-central.js';
import { salaCopa } from './sala-copa.js';
import { salaPrincipal } from './sala-principal.js';
import { salaSPPN } from './sala-sppn.js';

export const MAPS = {
  salaPrincipal,
  salaSPPN,
  salaCentral,
  salaCopa,
  auditorio,
  jardim,
} as const satisfies Record<MapKey, MapDefinition>;

export const MAP_KEYS = Object.keys(MAPS) as MapKey[];

/** Sala onde todo jogador novo nasce. */
export const DEFAULT_MAP: MapKey = 'salaPrincipal';

export function isMapKey(value: unknown): value is MapKey {
  return typeof value === 'string' && value in MAPS;
}

export function getMap(key: MapKey): MapDefinition {
  return MAPS[key];
}

/** Salas na ordem em que aparecem no menu de teleporte. */
export const MAP_DIRECTORY = MAP_KEYS.map((key) => MAPS[key]).sort((a, b) => a.order - b.order);
