import { MapSchema, Schema, type } from '@colyseus/schema';
import type { AvatarLook, MapKey, Point, Pose, PresenceStatus } from '@viciotown/shared';
import { MAX_CUPS, decodeRoute, sampleRoute, sanitizeLook } from '@viciotown/shared';

export class LookState extends Schema {
  @type('string') skin = '#f0c8a0';
  @type('string') hair = 'curto';
  @type('string') hairColor = '#3a2419';
  @type('string') top = 'camiseta';
  @type('string') topColor = '#2f7de1';
  @type('string') pantsColor = '#38414f';
  @type('string') shoesColor = '#22262e';
  @type('string') accessory = 'nenhum';
  @type('string') costume = 'nenhuma';

  apply(look: AvatarLook): void {
    this.skin = look.skin;
    this.hair = look.hair;
    this.hairColor = look.hairColor;
    this.top = look.top;
    this.topColor = look.topColor;
    this.pantsColor = look.pantsColor;
    this.shoesColor = look.shoesColor;
    this.accessory = look.accessory;
    this.costume = look.costume;
  }

  /**
   * `toJSON` já existe em `Schema`; este é o look em objeto simples.
   *
   * Passa pelo `sanitizeLook` porque os campos do schema são `string` crua
   * (é o que o Colyseus sincroniza) e `AvatarLook` é a união fechada dos
   * estilos que existem — a conversão de volta precisa validar, não afirmar.
   */
  toLook(): AvatarLook {
    return sanitizeLook({
      skin: this.skin,
      hair: this.hair,
      hairColor: this.hairColor,
      top: this.top,
      topColor: this.topColor,
      pantsColor: this.pantsColor,
      shoesColor: this.shoesColor,
      accessory: this.accessory,
      costume: this.costume,
    });
  }
}

export class PlayerState extends Schema {
  @type('string') sessionId = '';
  /** Identidade estável entre sessões/dispositivos (vem do perfil salvo). */
  @type('string') profileId = '';
  @type('string') name = 'Convidado';
  @type(LookState) look = new LookState();

  /** Tile de origem da rota atual — ou a posição de repouso, se não há rota. */
  @type('number') x = 0;
  @type('number') y = 0;
  @type('uint8') dir = 1;

  /**
   * Rota em trânsito, no schema (não em broadcast avulso): quem entra no meio
   * do trajeto de outra pessoa vê o avatar andando, e não teleportando.
   */
  @type('string') route = '';
  @type('number') routeStartedAt = 0;

  @type('string') pose: Pose = 'idle';
  @type('number') poseUntil = 0;

  @type('string') status: PresenceStatus = 'online';
  @type('string') statusMessage = '';
  @type('string') zone = '';

  @type('boolean') holdingCoffee = false;
  @type('boolean') isBot = false;
  @type('number') joinedAt = 0;

  /** Posição interpolada agora — a mesma função que o cliente usa para desenhar. */
  sampleAt(now: number): ReturnType<typeof sampleRoute> {
    return sampleRoute(
      { x: this.x, y: this.y },
      decodeRoute(this.route),
      now - this.routeStartedAt,
      this.dir,
    );
  }

  /** Tile inteiro ocupado agora (arredondado a partir da interpolação). */
  currentTile(now: number): Point {
    const sample = this.sampleAt(now);
    return { x: Math.round(sample.x), y: Math.round(sample.y) };
  }

  clearRoute(): void {
    this.route = '';
    this.routeStartedAt = 0;
  }

  isMoving(now: number): boolean {
    return this.route !== '' && !this.sampleAt(now).finished;
  }
}

export class CoffeeState extends Schema {
  @type('boolean') ready = false;
  @type('number') takenCount = 0;
  @type('number') maxCups = MAX_CUPS;
  @type('string') brewedBy = '';
  @type('number') brewedAt = 0;
  @type('number') brewingUntil = 0;
}

export class OfficeState extends Schema {
  @type('string') mapKey: MapKey = 'salaPrincipal';
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  /**
   * Ocupação de assentos: `"x,y" -> sessionId`. Ficava implícita no mapa
   * antes (qualquer um podia sentar em cima de qualquer outro); no schema,
   * o cliente consegue mostrar a cadeira como ocupada antes de tentar.
   */
  @type({ map: 'string' }) seats = new MapSchema<string>();

  @type(CoffeeState) coffee = new CoffeeState();

  /** Anúncio do palco atualmente no ar (vazio quando não há). */
  @type('string') announcement = '';
  @type('number') announcementUntil = 0;
}

export const seatKey = (x: number, y: number): string => `${x},${y}`;
