'use strict';

// Integracao com o Google Calendar para a reserva da "Sala Roxa". Usa uma
// service account (arquivo JSON em key/) com a agenda dedicada compartilhada
// com o e-mail dela — sem OAuth, sem login de usuario.

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const KEY_DIR = path.join(__dirname, '..', 'key');
const CALENDAR_ID = 'bd3a8e90258116ba2ef0b1d2cc466d7609e357d878ec2f2f59213fa4001a94c7@group.calendar.google.com';
const TIME_ZONE = 'America/Sao_Paulo';

function findKeyFile() {
  const file = fs.readdirSync(KEY_DIR).find((f) => f.endsWith('.json'));
  if (!file) throw new Error(`Nenhum arquivo .json de service account encontrado em ${KEY_DIR}`);
  return path.join(KEY_DIR, file);
}

let calendarClient = null;
function getClient() {
  if (calendarClient) return calendarClient;
  const auth = new google.auth.GoogleAuth({
    keyFile: findKeyFile(),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  calendarClient = google.calendar({ version: 'v3', auth });
  return calendarClient;
}

function toEvent(ev) {
  return {
    id: ev.id,
    title: ev.summary || '(sem título)',
    organizer: (ev.description || '').replace(/^Reservado por /, '') || null,
    startISO: ev.start.dateTime || ev.start.date,
    endISO: ev.end.dateTime || ev.end.date,
  };
}

/** Eventos entre timeMinISO e timeMaxISO, em ordem cronologica. */
async function listWindow(timeMinISO, timeMaxISO) {
  const calendar = getClient();
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return (res.data.items || []).map(toEvent);
}

/** Status atual da sala: ocupada agora (com quem/ate quando) + fila de proximas reservas. */
async function getStatus() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const events = await listWindow(now.toISOString(), windowEnd.toISOString());

  const nowMs = now.getTime();
  const current = events.find((e) => new Date(e.startISO).getTime() <= nowMs && nowMs < new Date(e.endISO).getTime());
  const queue = events.filter((e) => e !== current && new Date(e.startISO).getTime() > nowMs).slice(0, 10);

  return {
    occupied: !!current,
    current: current || null,
    queue,
    fetchedAt: now.toISOString(),
  };
}

/** Cria uma reserva, rejeitando se houver choque de horario com evento existente. */
async function createReservation({ title, organizer, startISO, endISO }) {
  const overlapping = await listWindow(startISO, endISO);
  if (overlapping.length > 0) {
    return { ok: false, error: 'Esse horário já está reservado. Escolha outro.' };
  }

  const calendar = getClient();
  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: title,
      description: `Reservado por ${organizer}`,
      start: { dateTime: startISO, timeZone: TIME_ZONE },
      end: { dateTime: endISO, timeZone: TIME_ZONE },
    },
  });
  return { ok: true, event: toEvent(res.data) };
}

module.exports = { getStatus, createReservation, CALENDAR_ID };
