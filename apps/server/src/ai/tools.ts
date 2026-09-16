import type { MapKey, MeetingEvent } from '@viciotown/shared';
import { MAPS, MAP_DIRECTORY } from '@viciotown/shared';
import { env } from '../env.js';
import type { Storage } from '../db/storage.js';
import type { MeetingService } from '../services/meetings.js';
import { validateBooking } from '../services/meetings.js';
import type { WorldHub } from '../world/hub.js';

/**
 * As capacidades do bot, como funções normais.
 *
 * Elas são deliberadamente independentes da IA: o modo determinístico (sem
 * chave da Anthropic) chama exatamente as mesmas funções. Isso mantém uma
 * única implementação de "como se reserva uma sala" — a IA escolhe QUANDO
 * chamar, nunca COMO fazer.
 */

export interface ToolContext {
  hub: WorldHub;
  meetings: MeetingService;
  storage: Storage;
  /** Quem está falando com o bot (para reservas e permissões). */
  actor: string;
  /** Onde a conversa acontece — muda o que faz sentido oferecer. */
  surface: 'slack' | 'world';
  mapKey?: MapKey;
  /** Publica um anúncio no mundo inteiro. */
  announce(text: string): void;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: env.TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const formatEvent = (e: MeetingEvent): string =>
  `${formatDateTime(e.startISO)} — "${e.title}"${e.organizer ? ` (${e.organizer})` : ''}`;

// ---------------------------------------------------------------- ações

export async function salaRoxaStatus(ctx: ToolContext): Promise<string> {
  const snapshot = await ctx.meetings.getStatus();
  const lines: string[] = [];

  lines.push(
    snapshot.occupied && snapshot.current
      ? `🔴 Sala Roxa OCUPADA: "${snapshot.current.title}"${
          snapshot.current.organizer ? ` (${snapshot.current.organizer})` : ''
        }, até ${formatDateTime(snapshot.current.endISO)}.`
      : '🟢 Sala Roxa LIVRE agora.',
  );

  if (snapshot.queue.length > 0) {
    lines.push('', 'Próximas reservas:');
    for (const e of snapshot.queue.slice(0, 5)) lines.push(`• ${formatEvent(e)} [id: ${e.id}]`);
  } else {
    lines.push('Nenhuma reserva futura na agenda.');
  }

  if (!snapshot.live) {
    lines.push('', '_(agenda local: o Google Calendar não está configurado neste servidor)_');
  }
  return lines.join('\n');
}

export async function reservarSalaRoxa(
  ctx: ToolContext,
  input: { title: string; startISO: string; durationMinutes: number },
): Promise<string> {
  const start = new Date(input.startISO);
  if (Number.isNaN(start.getTime())) return '❌ Não entendi o horário de início.';

  const endISO = new Date(start.getTime() + input.durationMinutes * 60_000).toISOString();
  const check = validateBooking(start.toISOString(), endISO);
  if (!check.ok) return `❌ ${check.error}`;

  const result = await ctx.meetings.book({
    title: input.title || 'Reunião',
    organizer: ctx.actor,
    startISO: start.toISOString(),
    endISO,
  });

  if (!result.ok) return `❌ ${result.error}`;
  ctx.storage.logEvent('booking', ctx.mapKey ?? null, ctx.actor, { id: result.event.id });
  return `✅ Reservado: "${result.event.title}" em ${formatDateTime(result.event.startISO)} → ${formatDateTime(result.event.endISO)}.`;
}

export async function cancelarReserva(ctx: ToolContext, input: { eventId: string }): Promise<string> {
  const result = await ctx.meetings.cancel(input.eventId, ctx.actor);
  return result.ok ? '✅ Reserva cancelada.' : `❌ ${result.error ?? 'Não consegui cancelar.'}`;
}

export async function statusDoCafe(ctx: ToolContext): Promise<string> {
  const coffee = await ctx.hub.getCoffee();
  if (coffee.brewingUntil) {
    const seconds = Math.max(1, Math.round((coffee.brewingUntil - Date.now()) / 1000));
    return `⏳ Tem café passando agora — fica pronto em ~${seconds}s.`;
  }
  if (!coffee.ready) {
    return '☕ Não tem café pronto na Copa. Alguém precisa passar (é só ir até a cafeteira e clicar em "Fazer café").';
  }
  const restantes = coffee.maxCups - coffee.takenCount;
  const quem = coffee.brewedBy ? ` (feito por ${coffee.brewedBy})` : '';
  const quando = coffee.brewedAt ? `, passado às ${formatDateTime(new Date(coffee.brewedAt).toISOString())}` : '';
  return `☕ Tem café fresco na Copa${quem}${quando}! Restam ${restantes} de ${coffee.maxCups} xícaras.`;
}

export async function quemEstaOnline(ctx: ToolContext): Promise<string> {
  const roster = await ctx.hub.roster();
  const humans = roster.filter((p) => !p.isBot);
  if (humans.length === 0) return '🫥 Ninguém no VicioTown agora.';

  const byRoom = new Map<MapKey, string[]>();
  for (const p of humans) {
    const list = byRoom.get(p.mapKey) ?? [];
    const badge =
      p.status === 'busy' ? ' 🔴' : p.status === 'meeting' ? ' 📅' : p.status === 'away' ? ' 💤' : '';
    list.push(p.name + badge);
    byRoom.set(p.mapKey, list);
  }

  const lines = [`👥 ${humans.length} ${humans.length === 1 ? 'pessoa' : 'pessoas'} no VicioTown:`];
  for (const map of MAP_DIRECTORY) {
    const names = byRoom.get(map.key);
    if (names?.length) lines.push(`• *${map.name}*: ${names.join(', ')}`);
  }
  return lines.join('\n');
}

export async function mapaDoEscritorio(ctx: ToolContext): Promise<string> {
  const counts = await ctx.hub.roomCounts();
  const lines = ['🗺️ Salas do VicioTown:'];
  for (const map of MAP_DIRECTORY) {
    const count = counts.get(map.key) ?? 0;
    lines.push(`• *${map.name}* — ${map.tagline} (${count} ${count === 1 ? 'pessoa' : 'pessoas'})`);
  }
  lines.push(
    '',
    'Como chegar: do saguão (Sala Principal), a Copa fica a oeste, a Sala Central a leste, o Auditório ao sul e a escada sobe para a SalaSPPN. Do escritório, outra escada leva ao Jardim (terraço).',
  );
  return lines.join('\n');
}

export function estatisticas(ctx: ToolContext): string {
  const s = ctx.storage.stats();
  const nomes = s.topRooms
    .map((r) => `${MAPS[r.mapKey as MapKey]?.name ?? r.mapKey} (${r.visits})`)
    .join(', ');
  return [
    '📊 VicioTown em números:',
    `• ${s.totalProfiles} pessoas já criaram avatar`,
    `• ${s.seenToday} estiveram por aqui hoje, ${s.seenThisWeek} nos últimos 7 dias`,
    `• ${s.chatMessagesToday} mensagens no chat hoje`,
    `• ${s.coffeeBrewedToday} cafés passados hoje`,
    nomes ? `• Salas mais visitadas: ${nomes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function anunciarNoMundo(ctx: ToolContext, input: { text: string }): string {
  const text = input.text.trim().slice(0, 180);
  if (!text) return '❌ Anúncio vazio.';
  ctx.announce(text);
  return `📣 Anunciado para todo o VicioTown: "${text}"`;
}

// ---------------------------------------------------------------- schemas

/**
 * Definições no formato da Messages API. Ficam junto das implementações de
 * propósito: um parâmetro novo no schema sem o campo correspondente no
 * `execute` é um erro de compilação, não uma resposta estranha em produção.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'consultar_sala_roxa',
    description:
      'Status atual da Sala Roxa (livre/ocupada) e a fila de próximas reservas, com os ids necessários para cancelar.',
    input_schema: { type: 'object' as const, properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'reservar_sala_roxa',
    description:
      'Cria uma reserva da Sala Roxa em nome de quem está falando. Use só quando a pessoa der título e horário; se faltar algo, pergunte antes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Título da reunião.' },
        startISO: {
          type: 'string',
          description:
            'Início em ISO 8601 COM offset, no fuso America/Sao_Paulo. Ex: 2026-09-17T14:00:00-03:00',
        },
        durationMinutes: {
          type: 'integer',
          description: 'Duração em minutos (15 a 240).',
          minimum: 15,
          maximum: 240,
        },
      },
      required: ['title', 'startISO', 'durationMinutes'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'cancelar_reserva',
    description:
      'Cancela uma reserva pelo id. Só funciona se quem pediu for quem reservou. Pegue o id em consultar_sala_roxa.',
    input_schema: {
      type: 'object' as const,
      properties: { eventId: { type: 'string' } },
      required: ['eventId'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'status_do_cafe',
    description: 'Se tem café pronto na Copa, quem passou e quantas xícaras restam.',
    input_schema: { type: 'object' as const, properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'quem_esta_online',
    description: 'Quem está no VicioTown agora e em qual sala, com o status de cada um.',
    input_schema: { type: 'object' as const, properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'mapa_do_escritorio',
    description: 'Lista as salas, o que tem em cada uma, quanta gente há e como se chega nelas.',
    input_schema: { type: 'object' as const, properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'estatisticas_do_escritorio',
    description: 'Números agregados de uso: visitantes, mensagens e cafés.',
    input_schema: { type: 'object' as const, properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'anunciar_no_mundo',
    description:
      'Manda um anúncio que aparece para TODO MUNDO em TODAS as salas do VicioTown. Use com parcimônia e só quando a pessoa pedir explicitamente para avisar todo mundo.',
    input_schema: {
      type: 'object' as const,
      properties: { text: { type: 'string', description: 'Texto do anúncio (até 180 caracteres).' } },
      required: ['text'],
      additionalProperties: false,
    },
    strict: true,
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

/** Executa uma tool por nome. Entradas vêm do modelo — validadas aqui, não confiadas. */
export async function executeTool(
  ctx: ToolContext,
  name: string,
  rawInput: unknown,
): Promise<string> {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'consultar_sala_roxa':
      return salaRoxaStatus(ctx);
    case 'reservar_sala_roxa':
      return reservarSalaRoxa(ctx, {
        title: String(input.title ?? 'Reunião').slice(0, 80),
        startISO: String(input.startISO ?? ''),
        durationMinutes: clampInt(input.durationMinutes, 15, 240, 60),
      });
    case 'cancelar_reserva':
      return cancelarReserva(ctx, { eventId: String(input.eventId ?? '') });
    case 'status_do_cafe':
      return statusDoCafe(ctx);
    case 'quem_esta_online':
      return quemEstaOnline(ctx);
    case 'mapa_do_escritorio':
      return mapaDoEscritorio(ctx);
    case 'estatisticas_do_escritorio':
      return estatisticas(ctx);
    case 'anunciar_no_mundo':
      return anunciarNoMundo(ctx, { text: String(input.text ?? '') });
    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
