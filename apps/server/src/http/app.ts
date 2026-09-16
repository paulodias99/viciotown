import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { MAP_DIRECTORY } from '@viciotown/shared';
import { corsOrigins, env, isProduction } from '../env.js';
import { createLogger } from '../logger.js';
import type { ServerServices } from '../services/container.js';

const here = dirname(fileURLToPath(import.meta.url));
const log = createLogger('http');

const PRETTY = {
  target: 'pino-pretty',
  options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
};

/**
 * Onde está o build do cliente. Em produção o mesmo processo serve o jogo e
 * o WebSocket — um serviço só para hospedar, sem CDN nem proxy obrigatório.
 */
function resolveClientDist(): string | null {
  const candidates = [
    env.CLIENT_DIST && resolve(env.CLIENT_DIST),
    resolve(here, '../../../client/dist'),
    resolve(process.cwd(), 'apps/client/dist'),
  ].filter((p): p is string => typeof p === 'string');

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

export async function createHttpApp(services: ServerServices): Promise<FastifyInstance> {
  const app = Fastify({
    // Em produção o logger do Fastify sobe para `warn`: o log por requisição
    // é `info`, então isso silencia o ruído de acesso sem precisar da opção
    // `disableRequestLogging` (depreciada no Fastify 5). As nossas próprias
    // mensagens saem pelo `logger` compartilhado, que mantém o nível do env.
    logger: isProduction ? { level: 'warn' } : { level: env.LOG_LEVEL, transport: PRETTY },
    trustProxy: true,
  });

  await app.register(cors, { origin: corsOrigins, credentials: true });

  // ---- API -----------------------------------------------------------------

  app.get('/health', async () => ({
    ok: true,
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version ?? '1.0.0',
  }));

  /** Estado do mundo para quem ainda não abriu o jogo (landing, Slack, dashboards). */
  app.get('/api/world', async () => {
    const [directory, coffee, meeting] = await Promise.all([
      services.hub.directory(),
      services.hub.getCoffee(),
      services.meetings.getStatus(),
    ]);
    return { directory, coffee, meeting, bot: services.brain.kind };
  });

  app.get('/api/roster', async () => ({ players: await services.hub.roster() }));

  app.get('/api/stats', async () => services.storage.stats());

  app.get('/api/maps', async () =>
    MAP_DIRECTORY.map((m) => ({
      key: m.key,
      name: m.name,
      tagline: m.tagline,
      theme: m.theme,
      size: { width: Math.max(...m.tiles.map((r) => r.length)), height: m.tiles.length },
    })),
  );

  // ---- cliente -------------------------------------------------------------

  const clientDist = resolveClientDist();
  if (clientDist) {
    await app.register(fastifyStatic, {
      root: clientDist,
      // Os assets do Vite têm hash no nome, então podem ser cacheados de forma
      // agressiva; o index.html não pode, senão o deploy novo não chega.
      maxAge: '1y',
      immutable: true,
      setHeaders(reply, path) {
        if (path.endsWith('index.html') || path.endsWith('sw.js')) {
          reply.header('cache-control', 'no-cache');
        }
      },
    });

    // SPA: qualquer rota não-API devolve o index (deep links funcionam).
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/matchmake')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
    log.info({ clientDist }, 'servindo o cliente estático');
  } else {
    app.get('/', async () => ({
      message:
        'API do VicioTown de pé. O cliente roda no Vite em dev (npm run dev) ou precisa ser buildado (npm run build).',
    }));
    log.warn('build do cliente não encontrado — servindo só a API');
  }

  return app;
}
