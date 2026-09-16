import type { AvatarLook, MapKey, Pose, PresenceStatus } from '@viciotown/shared';

/**
 * Espelho tipado do schema do servidor.
 *
 * O Colyseus decodifica o estado por reflexão, então o cliente não precisa
 * das classes do servidor em runtime — só de um tipo que descreva os campos.
 * Manter isto como interface (e não importar as classes do servidor) evita
 * arrastar `@colyseus/schema` do servidor para o bundle do navegador, que já
 * vem embutido no `colyseus.js`.
 */

export interface LookView extends AvatarLook {}

export interface PlayerView {
  sessionId: string;
  profileId: string;
  name: string;
  look: LookView;
  x: number;
  y: number;
  dir: number;
  route: string;
  routeStartedAt: number;
  pose: Pose;
  poseUntil: number;
  status: PresenceStatus;
  statusMessage: string;
  zone: string;
  holdingCoffee: boolean;
  isBot: boolean;
  joinedAt: number;
}

export interface CoffeeView {
  ready: boolean;
  takenCount: number;
  maxCups: number;
  brewedBy: string;
  brewedAt: number;
  brewingUntil: number;
}

/** Subconjunto do `MapSchema` que o cliente realmente usa. */
export interface MapView<T> {
  get(key: string): T | undefined;
  forEach(callback: (value: T, key: string) => void): void;
  readonly size: number;
}

export interface OfficeView {
  mapKey: MapKey;
  players: MapView<PlayerView>;
  seats: MapView<string>;
  coffee: CoffeeView;
  announcement: string;
  announcementUntil: number;
}
