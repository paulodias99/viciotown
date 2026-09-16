import type { PlayerState } from '../rooms/state.js';
import { PlayerState as Player } from '../rooms/state.js';
import type { OfficeRoom } from '../rooms/OfficeRoom.js';
import { createLogger } from '../logger.js';
import type { ToolContext } from '../ai/tools.js';

const log = createLogger('npc');

const SESSION_ID = 'npc-vicio';
const PROFILE_ID = 'npc-vicio';

const WANDER_MIN_MS = 7_000;
const WANDER_MAX_MS = 16_000;
const GREET_COOLDOWN_MS = 45_000;
/** Uma pergunta por vez: sem isso, dez pessoas falando viram dez chamadas simultâneas. */
const MAX_CONCURRENT_ANSWERS = 2;

const GREETINGS = [
  'Opa, chegou! Se quiser saber de sala, café ou quem está online, é só me chamar.',
  'E aí! Sou o Vício. Digite /vicio e sua pergunta que eu respondo.',
  'Bem-vindo ao VicioTown 👋 Pergunta aí se tem café.',
];

const MENTION = /\bv[ií]cio\b|@vicio/i;

/**
 * O bot como personagem, não só como integração.
 *
 * Ele existe de verdade no estado da sala (tem avatar, anda, aparece na lista
 * de quem está online) e responde com as MESMAS ferramentas que o bot do
 * Slack usa. O ponto é que perguntar "tem café?" no chat do jogo e perguntar
 * no Slack levem exatamente à mesma resposta, e não a duas implementações que
 * divergem com o tempo.
 */
export class VicioNpc {
  private player: PlayerState | null = null;
  private nextWanderAt = 0;
  private lastGreetAt = 0;
  private pending = 0;
  private disposed = false;

  constructor(private readonly room: OfficeRoom) {}

  spawn(): void {
    const home = this.room.map.nearestWalkable(this.room.map.defaultSpawn());
    const player = new Player();
    player.sessionId = SESSION_ID;
    player.profileId = PROFILE_ID;
    player.name = 'Vício';
    player.look.apply({
      skin: '#e0ac7e',
      hair: 'coque',
      hairColor: '#7d5ba6',
      top: 'blazer',
      topColor: '#8e5cd9',
      pantsColor: '#22262e',
      shoesColor: '#f2f2f2',
      accessory: 'oculos',
      costume: 'nenhuma',
    });
    player.x = home.x;
    player.y = home.y;
    player.dir = 1;
    player.isBot = true;
    player.status = 'online';
    player.statusMessage = 'seu assistente';
    player.joinedAt = Date.now();

    this.player = player;
    this.room.state.players.set(SESSION_ID, player);
    this.nextWanderAt = Date.now() + WANDER_MIN_MS;
    log.info({ mapKey: this.room.mapKey }, 'NPC Vício em cena');
  }

  dispose(): void {
    this.disposed = true;
    this.room.state.players.delete(SESSION_ID);
    this.player = null;
  }

  tick(now: number): void {
    const player = this.player;
    if (!player || this.disposed) return;
    if (now < this.nextWanderAt) return;
    if (player.route) return;

    this.nextWanderAt =
      now + WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS);

    // Passeia perto de casa em vez de cruzar a sala inteira: um NPC que some
    // no canto oposto não serve para quem acabou de chegar pelo saguão.
    const home = this.room.map.defaultSpawn();
    const target = this.room.map.nearestWalkable(
      {
        x: home.x + Math.round((Math.random() - 0.5) * 8),
        y: home.y + Math.round((Math.random() - 0.5) * 6),
      },
      4,
    );
    this.room.requestMove(SESSION_ID, player, target);
  }

  onPlayerJoined(joined: PlayerState): void {
    const player = this.player;
    if (!player || joined.isBot) return;

    const now = Date.now();
    if (now - this.lastGreetAt < GREET_COOLDOWN_MS) return;
    this.lastGreetAt = now;

    setTimeout(() => {
      if (this.disposed || !this.player) return;
      const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]!;
      this.room.say(this.player, `${joined.name}, ${lowerFirst(greeting)}`, 'room', false);
    }, 1200);
  }

  /** O NPC responde quando é chamado pelo nome — não a tudo que se fala na sala. */
  shouldAnswer(text: string): boolean {
    return MENTION.test(text);
  }

  async answer(asker: PlayerState, question: string): Promise<void> {
    const player = this.player;
    if (!player || this.disposed) return;

    if (this.pending >= MAX_CONCURRENT_ANSWERS) {
      this.room.say(player, `${asker.name}, me dá um segundo — estou respondendo outra pergunta.`);
      return;
    }

    this.pending++;
    this.room.broadcastTyped('bot:typing', { on: true });

    try {
      // Olha para quem perguntou antes de responder: pequeno, mas é o que faz
      // o NPC parecer presente em vez de um alto-falante.
      this.faceToward(asker);

      const ctx: ToolContext = {
        hub: this.room.services.hub,
        meetings: this.room.services.meetings,
        storage: this.room.services.storage,
        actor: asker.name,
        surface: 'world',
        mapKey: this.room.mapKey,
        announce: (text) => this.room.services.hub.announce('Vício', text),
      };

      const reply = await this.room.services.brain.reply({
        question: question.replace(MENTION, '').trim() || question,
        conversationId: `world:${asker.profileId}`,
        ctx,
      });

      if (this.disposed || !this.player) return;
      for (const chunk of splitForBubbles(reply)) {
        this.room.say(this.player, chunk, 'room');
      }
    } catch (error) {
      log.error({ err: error }, 'NPC falhou ao responder');
      if (this.player) {
        this.room.say(this.player, 'Deu ruim aqui do meu lado. Tenta de novo?');
      }
    } finally {
      this.pending--;
      if (this.pending === 0) this.room.broadcastTyped('bot:typing', { on: false });
    }
  }

  private faceToward(other: PlayerState): void {
    const player = this.player;
    if (!player) return;
    const now = Date.now();
    const from = player.currentTile(now);
    const to = other.currentTile(now);
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    if (dx === 0 && dy === 0) return;
    const sdx = dx - dy;
    const sdy = dx + dy;
    player.dir = sdy >= 0 ? (sdx >= 0 ? 1 : 0) : sdx >= 0 ? 2 : 3;
  }
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Quebra a resposta em balões legíveis. Um parágrafo de 400 caracteres num
 * balão de fala isométrico é ilegível; a IA já é instruída a ser curta, mas
 * o corte precisa existir para quando ela não for.
 */
function splitForBubbles(text: string, max = 180): string[] {
  const clean = text.replace(/\s*\n\s*/g, ' · ').replace(/\*+/g, '').trim();
  if (clean.length <= max) return [clean];

  const chunks: string[] = [];
  let remaining = clean;
  while (remaining.length > max && chunks.length < 3) {
    const cut = remaining.lastIndexOf(' ', max);
    const at = cut > max * 0.5 ? cut : max;
    chunks.push(remaining.slice(0, at).trim());
    remaining = remaining.slice(at).trim();
  }
  if (remaining) chunks.push(remaining.slice(0, max));
  return chunks;
}
