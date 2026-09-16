export interface Point {
  x: number;
  y: number;
}

/** Porta: metadado sobre um tile andável, não um caractere no grid. */
export interface DoorDef {
  x: number;
  y: number;
  label: string;
  /** Sala de destino. `null` = porta decorativa ("em construção"). */
  to: MapKey | null;
  spawnAt?: Point;
  /** Toca a animação de subir escada antes de trocar de sala. */
  climb?: boolean;
  /** Porta que abre uma UI em vez de teleportar (ex: reserva de sala). */
  opens?: 'meetingRoom';
}

export type StationType = 'coffee' | 'sink' | 'whiteboard' | 'fridge' | 'speaker' | 'screen';

/** "Estação": tile andável em frente a um móvel, onde uma interação acontece. */
export interface StationDef {
  x: number;
  y: number;
  type: StationType;
  label?: string;
}

/** Área nomeada — usada para presença ("está no lounge") e chat por proximidade. */
export interface ZoneDef {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ThemeName = 'office' | 'hub' | 'copa' | 'garden' | 'stage';

export interface MapDefinition {
  key: MapKey;
  name: string;
  /** Frase curta mostrada no topo e no roteiro do bot. */
  tagline: string;
  theme: ThemeName;
  tiles: readonly string[];
  doors?: readonly DoorDef[];
  stations?: readonly StationDef[];
  zones?: readonly ZoneDef[];
  spawn?: Point;
  /** Ordem de exibição no mapa-múndi / teleporte rápido. */
  order: number;
}

export type MapKey =
  | 'salaPrincipal'
  | 'salaSPPN'
  | 'salaCentral'
  | 'salaCopa'
  | 'auditorio'
  | 'jardim';

// ---------------------------------------------------------------- avatar

/**
 * `AvatarLook` mora em `look.ts`, derivado do schema Zod do catálogo — assim
 * "cabelo" é a união dos estilos que existem de fato, e não `string`. Com o
 * tipo declarado à mão aqui, cliente e servidor discordavam do que era um
 * look válido e cada lado "consertava" por conta própria.
 */
export type { AvatarLook } from './look.js';

export type Pose = 'idle' | 'walk' | 'sit' | 'dance' | 'climb' | 'brew' | 'wave' | 'clap' | 'sad';

export type PresenceStatus = 'online' | 'busy' | 'meeting' | 'away';

// ---------------------------------------------------------------- domínio

export interface CoffeeSnapshot {
  ready: boolean;
  takenCount: number;
  maxCups: number;
  brewedBy: string | null;
  brewedAt: number | null;
  /** Fim previsto da fervura em curso (epoch ms) ou null. */
  brewingUntil: number | null;
}

export interface MeetingEvent {
  id: string;
  title: string;
  organizer: string | null;
  startISO: string;
  endISO: string;
}

export interface MeetingRoomSnapshot {
  occupied: boolean;
  current: MeetingEvent | null;
  queue: MeetingEvent[];
  fetchedAt: string;
  /** false quando o Google Calendar não está configurado (modo local). */
  live: boolean;
}

export interface RosterEntry {
  id: string;
  name: string;
  mapKey: MapKey;
  status: PresenceStatus;
  isBot: boolean;
}
