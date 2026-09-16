import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MeetingEvent, MeetingRoomSnapshot } from '@viciotown/shared';
import { google } from 'googleapis';
import { env } from '../env.js';
import { createLogger } from '../logger.js';

const log = createLogger('meetings');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;

export interface BookingRequest {
  title: string;
  organizer: string;
  startISO: string;
  endISO: string;
}

export type BookingResult =
  | { ok: true; event: MeetingEvent }
  | { ok: false; error: string };

/**
 * Reserva da Sala Roxa.
 *
 * A interface existe porque o Google Calendar é opcional: sem credenciais o
 * jogo antes simplesmente quebrava (o módulo lia a pasta `key/` no import e
 * estourava). Agora o mundo continua de pé com uma agenda local em memória —
 * e a UI diz explicitamente que está em modo local, em vez de fingir que
 * salvou no calendário da empresa.
 */
export interface MeetingService {
  readonly live: boolean;
  getStatus(): Promise<MeetingRoomSnapshot>;
  book(request: BookingRequest): Promise<BookingResult>;
  cancel(eventId: string, requestedBy: string): Promise<{ ok: boolean; error?: string }>;
}

/** Validações que valem para qualquer backend — feitas antes de falar com a rede. */
export function validateBooking(
  startISO: string,
  endISO: string,
): { ok: true } | { ok: false; error: string } {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { ok: false, error: 'Horário inválido.' };
  }
  if (end <= start) {
    return { ok: false, error: 'O término precisa ser depois do início.' };
  }
  if (start < Date.now() - 60_000) {
    return { ok: false, error: 'Não dá para reservar um horário que já passou.' };
  }
  if (end - start > MAX_DURATION_MS) {
    return { ok: false, error: 'Duração máxima de 4 horas.' };
  }
  if (start > Date.now() + 90 * 24 * 60 * 60 * 1000) {
    return { ok: false, error: 'Só dá para reservar com até 90 dias de antecedência.' };
  }
  return { ok: true };
}

function snapshotFrom(events: MeetingEvent[], live: boolean): MeetingRoomSnapshot {
  const now = Date.now();
  const current =
    events.find(
      (e) => new Date(e.startISO).getTime() <= now && now < new Date(e.endISO).getTime(),
    ) ?? null;
  const queue = events
    .filter((e) => e !== current && new Date(e.startISO).getTime() > now)
    .slice(0, 10);
  return {
    occupied: current !== null,
    current,
    queue,
    fetchedAt: new Date(now).toISOString(),
    live,
  };
}

const overlaps = (a: MeetingEvent, startISO: string, endISO: string): boolean => {
  const s = new Date(startISO).getTime();
  const e = new Date(endISO).getTime();
  return new Date(a.startISO).getTime() < e && s < new Date(a.endISO).getTime();
};

// ---------------------------------------------------------------- local

/** Agenda em memória — o modo em que o jogo roda sem credenciais do Google. */
class LocalMeetingService implements MeetingService {
  readonly live = false;
  private events: MeetingEvent[] = [];
  private nextId = 1;

  async getStatus(): Promise<MeetingRoomSnapshot> {
    const cutoff = Date.now() - 60 * 60 * 1000;
    this.events = this.events
      .filter((e) => new Date(e.endISO).getTime() > cutoff)
      .sort((a, b) => a.startISO.localeCompare(b.startISO));
    return snapshotFrom(this.events, false);
  }

  async book(request: BookingRequest): Promise<BookingResult> {
    const conflict = this.events.find((e) => overlaps(e, request.startISO, request.endISO));
    if (conflict) {
      return { ok: false, error: `Choca com "${conflict.title}". Escolha outro horário.` };
    }
    const event: MeetingEvent = {
      id: `local-${this.nextId++}`,
      title: request.title,
      organizer: request.organizer,
      startISO: request.startISO,
      endISO: request.endISO,
    };
    this.events.push(event);
    return { ok: true, event };
  }

  async cancel(eventId: string, requestedBy: string): Promise<{ ok: boolean; error?: string }> {
    const index = this.events.findIndex((e) => e.id === eventId);
    if (index < 0) return { ok: false, error: 'Reserva não encontrada.' };
    const event = this.events[index]!;
    if (event.organizer && event.organizer !== requestedBy) {
      return { ok: false, error: `Só ${event.organizer} pode cancelar essa reserva.` };
    }
    this.events.splice(index, 1);
    return { ok: true };
  }
}

// ---------------------------------------------------------------- Google

interface GoogleCredentials {
  client_email: string;
  private_key: string;
}

function loadGoogleCredentials(): GoogleCredentials | null {
  if (env.GOOGLE_CREDENTIALS_JSON) {
    try {
      return JSON.parse(env.GOOGLE_CREDENTIALS_JSON) as GoogleCredentials;
    } catch {
      log.error('GOOGLE_CREDENTIALS_JSON não é um JSON válido');
      return null;
    }
  }

  const candidates = [env.GOOGLE_CREDENTIALS_FILE, join(process.cwd(), 'key')].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      // Aceita tanto o caminho do JSON quanto a pasta `key/` do projeto antigo.
      const file = candidate.endsWith('.json')
        ? candidate
        : (() => {
            const found = readdirSync(candidate).find((f) => f.endsWith('.json'));
            return found ? join(candidate, found) : null;
          })();
      if (!file) continue;
      return JSON.parse(readFileSync(file, 'utf8')) as GoogleCredentials;
    } catch (error) {
      log.warn({ err: error, candidate }, 'credencial do Google ilegível');
    }
  }
  return null;
}

class GoogleMeetingService implements MeetingService {
  readonly live = true;
  private readonly calendar;
  /**
   * O status é lido a cada poucos segundos por sala; sem cache, seis salas
   * multiplicam por seis as chamadas à API do Google para responder sempre a
   * mesma coisa.
   */
  private cache: { snapshot: MeetingRoomSnapshot; at: number } | null = null;

  constructor(
    credentials: GoogleCredentials,
    private readonly calendarId: string,
  ) {
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  async getStatus(force = false): Promise<MeetingRoomSnapshot> {
    if (!force && this.cache && Date.now() - this.cache.at < 10_000) return this.cache.snapshot;
    const now = new Date();
    const events = await this.list(now.toISOString(), new Date(now.getTime() + WEEK_MS).toISOString());
    const snapshot = snapshotFrom(events, true);
    this.cache = { snapshot, at: Date.now() };
    return snapshot;
  }

  async book(request: BookingRequest): Promise<BookingResult> {
    const conflicts = await this.list(request.startISO, request.endISO);
    const clash = conflicts.find((e) => overlaps(e, request.startISO, request.endISO));
    if (clash) {
      return { ok: false, error: `Choca com "${clash.title}". Escolha outro horário.` };
    }

    const res = await this.calendar.events.insert({
      calendarId: this.calendarId,
      requestBody: {
        summary: request.title,
        description: `Reservado por ${request.organizer} via VicioTown`,
        start: { dateTime: request.startISO, timeZone: env.TIMEZONE },
        end: { dateTime: request.endISO, timeZone: env.TIMEZONE },
        extendedProperties: { private: { viciotownOrganizer: request.organizer } },
      },
    });
    this.cache = null;
    return { ok: true, event: toEvent(res.data) };
  }

  async cancel(eventId: string, requestedBy: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const existing = await this.calendar.events.get({
        calendarId: this.calendarId,
        eventId,
      });
      const organizer = readOrganizer(existing.data);
      if (organizer && organizer !== requestedBy) {
        return { ok: false, error: `Só ${organizer} pode cancelar essa reserva.` };
      }
      await this.calendar.events.delete({ calendarId: this.calendarId, eventId });
      this.cache = null;
      return { ok: true };
    } catch (error) {
      log.warn({ err: error, eventId }, 'falha ao cancelar reserva');
      return { ok: false, error: 'Não consegui cancelar essa reserva.' };
    }
  }

  private async list(timeMin: string, timeMax: string): Promise<MeetingEvent[]> {
    const res = await this.calendar.events.list({
      calendarId: this.calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });
    return (res.data.items ?? []).map(toEvent);
  }
}

type CalendarEvent = {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
};

function readOrganizer(ev: CalendarEvent): string | null {
  const tagged = ev.extendedProperties?.private?.viciotownOrganizer;
  if (tagged) return tagged;
  const fromDescription = (ev.description ?? '').match(/Reservado por (.+?)(?: via VicioTown)?$/m);
  return fromDescription?.[1]?.trim() ?? null;
}

function toEvent(ev: CalendarEvent): MeetingEvent {
  return {
    id: ev.id ?? '',
    title: ev.summary ?? '(sem título)',
    organizer: readOrganizer(ev),
    startISO: ev.start?.dateTime ?? ev.start?.date ?? new Date().toISOString(),
    endISO: ev.end?.dateTime ?? ev.end?.date ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- fábrica

/**
 * Envolve o backend real com um fallback: se o Google falhar em runtime
 * (cota, rede, credencial revogada), a sala mostra a última leitura boa em
 * vez de um modal de erro — e o jogo não trava por causa de uma integração.
 */
class ResilientMeetingService implements MeetingService {
  private lastGood: MeetingRoomSnapshot | null = null;

  constructor(private readonly inner: MeetingService) {}

  get live(): boolean {
    return this.inner.live;
  }

  async getStatus(): Promise<MeetingRoomSnapshot> {
    try {
      const snapshot = await this.inner.getStatus();
      this.lastGood = snapshot;
      return snapshot;
    } catch (error) {
      log.warn({ err: error }, 'status da Sala Roxa indisponível — usando último snapshot');
      return (
        this.lastGood ?? {
          occupied: false,
          current: null,
          queue: [],
          fetchedAt: new Date().toISOString(),
          live: false,
        }
      );
    }
  }

  async book(request: BookingRequest): Promise<BookingResult> {
    try {
      const result = await this.inner.book(request);
      if (result.ok) this.lastGood = null;
      return result;
    } catch (error) {
      log.error({ err: error }, 'falha ao reservar');
      return { ok: false, error: 'Não consegui falar com o calendário agora. Tente de novo.' };
    }
  }

  async cancel(eventId: string, requestedBy: string): Promise<{ ok: boolean; error?: string }> {
    try {
      return await this.inner.cancel(eventId, requestedBy);
    } catch (error) {
      log.error({ err: error }, 'falha ao cancelar');
      return { ok: false, error: 'Não consegui falar com o calendário agora.' };
    }
  }
}

export function createMeetingService(): MeetingService {
  const calendarId = env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    log.info('GOOGLE_CALENDAR_ID ausente — Sala Roxa em modo local (agenda na memória)');
    return new ResilientMeetingService(new LocalMeetingService());
  }
  const credentials = loadGoogleCredentials();
  if (!credentials) {
    log.warn('credenciais do Google não encontradas — Sala Roxa em modo local');
    return new ResilientMeetingService(new LocalMeetingService());
  }
  log.info({ calendarId }, 'Sala Roxa conectada ao Google Calendar');
  return new ResilientMeetingService(new GoogleMeetingService(credentials, calendarId));
}
