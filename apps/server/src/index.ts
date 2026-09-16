import type { Presence } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MAP_KEYS, MAPS } from '@viciotown/shared';
import { LocalPresence, Server } from 'colyseus';
import { createBrain } from './ai/brain.js';
import { createStorage } from './db/storage.js';
import { env, isProduction } from './env.js';
import { createHttpApp } from './http/app.js';
import { logger } from './logger.js';
import { OfficeRoom, type OfficeRoomOptions } from './rooms/OfficeRoom.js';
import type { ServerServices } from './services/container.js';
import { createMeetingService } from './services/meetings.js';
import { startSlack } from './slack/index.js';
import { WorldHub } from './world/hub.js';

async function createPresence(): Promise<{ presence: Presence; driver?: unknown }> {
  if (!env.REDIS_URL) return { presence: new LocalPresence() };

  // Com Redis, presence e driver passam a ser compartilhados: dá para subir N
  // processos atrás de um load balancer e eles enxergam as mesmas salas, o
  // mesmo café e a mesma lista de quem está online.
  const [{ RedisPresence }, { RedisDriver }] = await Promise.all([
    import('@colyseus/redis-presence'),
    import('@colyseus/redis-driver'),
  ]);
  logger.info({ url: redact(env.REDIS_URL) }, 'modo distribuído: Redis conectado');
  return {
    presence: new RedisPresence(env.REDIS_URL) as unknown as Presence,
    driver: new RedisDriver(env.REDIS_URL),
  };
}

const redact = (url: string): string => url.replace(/\/\/[^@]*@/, '//***@');

async function main(): Promise<void> {
  const { presence, driver } = await createPresence();

  const hub = new WorldHub(presence);
  const storage = await createStorage();
  const meetings = createMeetingService();
  const brain = createBrain();

  const services: ServerServices = { hub, meetings, storage, brain, slack: null };
  services.slack = await startSlack({ hub, meetings, storage, brain });

  const app = await createHttpApp(services);
  // O handler do Fastify já está registrado no http.Server neste ponto; o
  // Colyseus se pendura na frente e só intercepta as rotas de matchmaking,
  // repassando todo o resto. Por isso `ready()` vem ANTES do transporte.
  await app.ready();

  const gameServer = new Server({
    transport: new WebSocketTransport({ server: app.server }),
    presence,
    ...(driver ? { driver: driver as never } : {}),
    greet: false,
  });

  // Uma definição de sala por mapa: o matchmaking do Colyseus trata cada sala
  // do escritório como um "tipo" de room, o que permite escalar cada uma
  // independentemente (e ter mais de uma instância quando lotar).
  for (const mapKey of MAP_KEYS) {
    gameServer.define(mapKey, OfficeRoom, { mapKey, services } satisfies OfficeRoomOptions);
  }

  await gameServer.listen(env.PORT, undefined, undefined, () => {
    logger.info(
      {
        port: env.PORT,
        mode: env.REDIS_URL ? 'distribuído' : 'processo único',
        bot: brain.kind,
        slack: services.slack ? 'on' : 'off',
        salas: Object.values(MAPS).map((m) => m.name),
      },
      `🏙️  VicioTown no ar em http://localhost:${env.PORT}`,
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'encerrando...');
    const timer = setTimeout(() => {
      logger.warn('encerramento demorou demais — forçando saída');
      process.exit(1);
    }, 10_000);
    timer.unref();

    try {
      await gameServer.gracefullyShutdown(false);
      await services.slack?.stop();
      await app.close();
      storage.close();
    } catch (error) {
      logger.error({ err: error }, 'erro durante o encerramento');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'promise rejeitada sem tratamento');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'exceção não capturada');
    if (isProduction) process.exit(1);
  });
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'falha ao subir o servidor');
  process.exit(1);
});
