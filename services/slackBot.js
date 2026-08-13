'use strict';

// Bot Slack: escuta o canal SLACK_READ_CHANNEL (so leitura, so loga) e responde
// no DM por intencao simples (regex) — sala/reuniao usa o calendar.js (Sala
// Roxa), cafe usa o coffeeState.js (Copa); qualquer outra coisa cai no fallback.

require('dotenv').config();
const { App } = require('@slack/bolt');
const calendarService = require('./calendar');
const coffeeState = require('./coffeeState');

const CHANNEL_NAME = process.env.SLACK_READ_CHANNEL || 'avisos';
const TIME_ZONE = 'America/Sao_Paulo';

const GREETING_TEXT = 'Olá!  Posso te responder se alguma sala está livre ou se algum evento está acontecendo na Copa! Só perguntar aqui!';
const FALLBACK_TEXT = 'poxa, ainda não consigo te responder sobre tudo! Mas qualquer informação sobre disponibilidade de salas e eventos na Copa pode contar comigo, ok?';

const ROOM_INTENT = /\bsalas?\b|reuni(ã|a)o|dispon[íi]vel|\blivres?\b|ocupad/i;
const COFFEE_INTENT = /caf[ée]/i;

async function findChannelId(client, name) {
  let cursor;
  do {
    const res = await client.conversations.list({
      types: 'public_channel',
      limit: 200,
      cursor,
    });
    const match = res.channels.find((c) => c.name === name);
    if (match) return match.id;
    cursor = res.response_metadata && res.response_metadata.next_cursor;
  } while (cursor);
  return null;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' });
}

async function salaRoxaStatusText() {
  const status = await calendarService.getStatus();
  let text = status.occupied
    ? `🔴 Sala Roxa ocupada agora (${status.current.title}) até ${formatTime(status.current.endISO)}.`
    : '🟢 Sala Roxa livre agora.';

  if (status.queue.length) {
    text += '\n\nPróximas reservas:\n' + status.queue.map((e) => `• ${e.title} — ${formatTime(e.startISO)}`).join('\n');
  }
  return text;
}

function coffeeStatusText() {
  const state = coffeeState.getState();
  if (!state.ready) return '☕ Não tem café pronto na Copa agora.';
  const brewedBy = state.brewedBy ? ` (feito por ${state.brewedBy})` : '';
  return `☕ Tem café fresquinho na Copa${brewedBy}! ${state.takenCount}/${state.maxCups} xícaras já foram.`;
}

async function replyFor(text) {
  if (ROOM_INTENT.test(text)) return salaRoxaStatusText();
  if (COFFEE_INTENT.test(text)) return coffeeStatusText();
  return FALLBACK_TEXT;
}

async function startSlackBot() {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) {
    console.log('  💬 Slack bot desativado (faltam SLACK_BOT_TOKEN / SLACK_APP_TOKEN no .env)');
    return;
  }

  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
  });

  const channelId = await findChannelId(app.client, CHANNEL_NAME);
  if (!channelId) {
    console.warn(`  💬 Slack bot: canal #${CHANNEL_NAME} não encontrado (confira se o bot foi convidado e se channels:read/groups:read estão no escopo)`);
  }

  app.event('app_home_opened', async ({ event, client }) => {
    if (event.tab !== 'messages') return;
    try {
      await client.chat.postMessage({ channel: event.channel, text: GREETING_TEXT });
    } catch (err) {
      console.error('  💬 Slack bot: falha ao enviar saudação:', err.message);
    }
  });

  app.event('app_mention', async ({ event, say }) => {
    const text = (event.text || '').replace(/<@[^>]+>/g, '').trim();
    try {
      await say({ text: await replyFor(text), thread_ts: event.thread_ts || event.ts });
    } catch (err) {
      console.error('  💬 Slack bot: falha ao responder menção:', err.message);
    }
  });

  app.message(async ({ message, say }) => {
    if (message.subtype || message.bot_id) return;

    if (message.channel_type === 'im') {
      try {
        say(await replyFor(message.text || ''));
      } catch (err) {
        console.error('  💬 Slack bot: falha ao responder DM:', err.message);
      }
      return;
    }

    if (message.channel === channelId) {
      console.log(`[slack #${CHANNEL_NAME}] ${message.user}: ${message.text}`);
    }
  });

  await app.start();
  console.log(`  💬 Slack bot conectado (Socket Mode) — ouvindo #${CHANNEL_NAME}, respondendo DMs e menções`);
}

module.exports = { startSlackBot };
