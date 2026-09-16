import { App } from '@slack/bolt';
import type { KnownBlock } from '@slack/types';
import { env } from '../env.js';
import { createLogger } from '../logger.js';
import type { Brain } from '../ai/brain.js';
import { BOT_HELP_TEXT } from '../ai/brain.js';
import {
  mapaDoEscritorio,
  quemEstaOnline,
  salaRoxaStatus,
  statusDoCafe,
  type ToolContext,
} from '../ai/tools.js';
import type { Storage } from '../db/storage.js';
import type { WorldHub } from '../world/hub.js';
import type { NotificationService } from '../services/container.js';
import type { MeetingService } from '../services/meetings.js';

const log = createLogger('slack');

/**
 * Nome de quem clicou. O payload do Slack tem três formatos de `user`
 * dependendo do tipo de interação (alguns trazem `name`, outros `username`),
 * então a leitura é estrutural em vez de assumir um deles.
 */
function actorFrom(body: unknown): string {
  const user = (body as { user?: { name?: string; username?: string; id?: string } }).user;
  return user?.name ?? user?.username ?? user?.id ?? 'alguém';
}

export interface SlackDeps {
  hub: WorldHub;
  meetings: MeetingService;
  storage: Storage;
  brain: Brain;
}

const ACTION_COFFEE = 'viciotown_coffee';
const ACTION_ROOM = 'viciotown_room';
const ACTION_ONLINE = 'viciotown_online';
const ACTION_MAP = 'viciotown_map';

/**
 * Bot do Slack.
 *
 * A versão anterior era regex → texto fixo, com duas intenções. Esta delega
 * ao mesmo cérebro (e às mesmas ferramentas) do NPC do jogo, então a
 * pergunta "dá pra reservar a sala amanhã às 15h?" funciona de verdade em
 * vez de cair no fallback. O Home tab e os botões existem porque as três
 * perguntas mais comuns não deveriam exigir digitar nada.
 */
class SlackService implements NotificationService {
  private readonly app: App;
  private notifyChannelId: string | null = null;
  private readChannelId: string | null = null;
  private started = false;

  constructor(private readonly deps: SlackDeps) {
    const socketMode = Boolean(env.SLACK_APP_TOKEN);
    this.app = new App({
      token: env.SLACK_BOT_TOKEN!,
      ...(socketMode
        ? { appToken: env.SLACK_APP_TOKEN!, socketMode: true }
        : { signingSecret: env.SLACK_SIGNING_SECRET! }),
    });
    this.register();
  }

  async start(): Promise<void> {
    await this.app.start();
    this.started = true;
    this.readChannelId = await this.findChannel(env.SLACK_READ_CHANNEL);
    this.notifyChannelId = env.SLACK_NOTIFY_CHANNEL
      ? await this.findChannel(env.SLACK_NOTIFY_CHANNEL)
      : this.readChannelId;
    log.info(
      { read: env.SLACK_READ_CHANNEL, notify: env.SLACK_NOTIFY_CHANNEL ?? env.SLACK_READ_CHANNEL },
      'Slack conectado',
    );
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.app.stop();
    this.started = false;
  }

  // ---------------------------------------------------------- notificações

  async notifyCoffee(by: string): Promise<void> {
    await this.post(`☕ *Tem café fresco na Copa!* Passado por ${by}. Corre que são 20 xícaras.`);
  }

  async notifyAnnouncement(from: string, text: string): Promise<void> {
    await this.post(`📣 *${from}* anunciou no VicioTown:\n> ${text}`);
  }

  private async post(text: string): Promise<void> {
    if (!this.notifyChannelId) return;
    try {
      await this.app.client.chat.postMessage({ channel: this.notifyChannelId, text });
    } catch (error) {
      log.warn({ err: error }, 'falha ao postar notificação');
    }
  }

  // ---------------------------------------------------------- handlers

  private register(): void {
    this.app.event('app_home_opened', async ({ event, client }) => {
      if (event.tab === 'home') {
        try {
          await client.views.publish({
            user_id: event.user,
            view: { type: 'home', blocks: await this.homeBlocks() },
          });
        } catch (error) {
          log.warn({ err: error }, 'falha ao publicar Home tab');
        }
        return;
      }
      if (event.tab === 'messages') {
        await this.safeSay(event.channel, BOT_HELP_TEXT);
      }
    });

    this.app.event('app_mention', async ({ event, say }) => {
      const text = (event.text ?? '').replace(/<@[^>]+>/g, '').trim();
      const reply = await this.ask(text, event.user ?? 'alguém', `slack:${event.user}`);
      try {
        await say({ text: reply, thread_ts: event.thread_ts ?? event.ts });
      } catch (error) {
        log.warn({ err: error }, 'falha ao responder menção');
      }
    });

    this.app.message(async ({ message, say }) => {
      if (message.subtype || !('user' in message) || !message.user) return;

      if (message.channel_type === 'im') {
        const text = 'text' in message ? (message.text ?? '') : '';
        const reply = await this.ask(text, message.user, `slack:${message.user}`);
        try {
          await say(reply);
        } catch (error) {
          log.warn({ err: error }, 'falha ao responder DM');
        }
        return;
      }

      if (message.channel === this.readChannelId && 'text' in message) {
        log.info({ user: message.user, text: message.text }, `#${env.SLACK_READ_CHANNEL}`);
      }
    });

    this.app.command('/viciotown', async ({ command, ack, respond }) => {
      await ack();
      const question = command.text.trim();
      if (!question) {
        await respond({ blocks: await this.homeBlocks(), response_type: 'ephemeral' });
        return;
      }
      const reply = await this.ask(question, command.user_name, `slack:${command.user_id}`);
      await respond({ text: reply, response_type: 'ephemeral' });
    });

    const quickAction = (
      id: string,
      run: (ctx: ToolContext) => Promise<string> | string,
    ): void => {
      this.app.action(id, async ({ ack, body, respond }) => {
        await ack();
        const actor = actorFrom(body);
        const text = await run(this.context(actor));
        await respond({ text, response_type: 'ephemeral', replace_original: false });
      });
    };

    quickAction(ACTION_COFFEE, statusDoCafe);
    quickAction(ACTION_ROOM, salaRoxaStatus);
    quickAction(ACTION_ONLINE, quemEstaOnline);
    quickAction(ACTION_MAP, mapaDoEscritorio);
  }

  private async ask(question: string, actor: string, conversationId: string): Promise<string> {
    if (!question) return BOT_HELP_TEXT;
    try {
      return await this.deps.brain.reply({
        question,
        conversationId,
        ctx: this.context(actor),
      });
    } catch (error) {
      log.error({ err: error }, 'cérebro do bot falhou');
      return 'Tive um problema aqui. Tenta de novo em instantes?';
    }
  }

  private context(actor: string): ToolContext {
    return {
      hub: this.deps.hub,
      meetings: this.deps.meetings,
      storage: this.deps.storage,
      actor,
      surface: 'slack',
      announce: (text) => this.deps.hub.announce(actor, text),
    };
  }

  /** Painel do Home tab: estado do mundo + os atalhos mais pedidos. */
  private async homeBlocks(): Promise<KnownBlock[]> {
    const [coffee, directory] = await Promise.all([
      this.deps.hub.getCoffee(),
      this.deps.hub.directory(),
    ]);
    const meeting = await this.deps.meetings.getStatus();

    const rooms = directory.rooms
      .map((r) => `• *${r.name}* — ${r.count} ${r.count === 1 ? 'pessoa' : 'pessoas'}`)
      .join('\n');

    return [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🏙️  VicioTown', emoji: true },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Sala Roxa*\n${meeting.occupied ? `🔴 ocupada${meeting.current ? ` — ${meeting.current.title}` : ''}` : '🟢 livre'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Café*\n${coffee.ready ? `☕ pronto (${coffee.maxCups - coffee.takenCount} xícaras)` : coffee.brewingUntil ? '⏳ passando' : '— sem café'}`,
          },
          { type: 'mrkdwn', text: `*Online*\n👥 ${directory.totalOnline}` },
        ],
      },
      { type: 'section', text: { type: 'mrkdwn', text: rooms || '_Ninguém online agora._' } },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: ACTION_ROOM,
            text: { type: 'plain_text', text: '🟣 Sala Roxa', emoji: true },
          },
          {
            type: 'button',
            action_id: ACTION_COFFEE,
            text: { type: 'plain_text', text: '☕ Café', emoji: true },
          },
          {
            type: 'button',
            action_id: ACTION_ONLINE,
            text: { type: 'plain_text', text: '👥 Quem está online', emoji: true },
          },
          {
            type: 'button',
            action_id: ACTION_MAP,
            text: { type: 'plain_text', text: '🗺️ Mapa', emoji: true },
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Me mande uma DM ou use `/viciotown <pergunta>` — respondo em português mesmo.',
          },
        ],
      },
    ];
  }

  private async safeSay(channel: string, text: string): Promise<void> {
    try {
      await this.app.client.chat.postMessage({ channel, text });
    } catch (error) {
      log.warn({ err: error }, 'falha ao enviar mensagem');
    }
  }

  /**
   * Procura o canal pelo nome. Tenta incluir canais privados e, se o app não
   * tiver o escopo `groups:read`, repete só com os públicos — pedir um escopo
   * a mais não deveria derrubar a busca inteira, que foi o que acontecia.
   */
  private async findChannel(name: string): Promise<string | null> {
    for (const types of ['public_channel,private_channel', 'public_channel']) {
      let cursor: string | undefined;
      try {
        do {
          const res = await this.app.client.conversations.list({ types, limit: 200, cursor });
          const match = res.channels?.find((c) => c.name === name);
          if (match?.id) return match.id;
          cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);
        break; // listou sem erro e não achou: tentar de novo não muda nada
      } catch (error) {
        const code = (error as { data?: { error?: string } }).data?.error;
        if (code === 'missing_scope' && types.includes('private')) continue;
        log.warn({ err: error, name }, 'não consegui listar canais (falta channels:read?)');
        return null;
      }
    }
    log.warn({ name }, 'canal não encontrado — o bot foi convidado para ele?');
    return null;
  }
}

export async function startSlack(deps: SlackDeps): Promise<NotificationService | null> {
  if (!env.SLACK_BOT_TOKEN) {
    log.info('Slack desativado (SLACK_BOT_TOKEN ausente)');
    return null;
  }
  if (!env.SLACK_APP_TOKEN && !env.SLACK_SIGNING_SECRET) {
    log.warn('Slack desativado: defina SLACK_APP_TOKEN (socket mode) ou SLACK_SIGNING_SECRET');
    return null;
  }

  const service = new SlackService(deps);
  try {
    await service.start();
    return service;
  } catch (error) {
    // Uma integração externa fora do ar não pode impedir o escritório de abrir.
    log.error({ err: error }, 'Slack não conectou — o mundo segue sem ele');
    return null;
  }
}
