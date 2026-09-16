import { pino } from 'pino';
import { env, isProduction } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Em produção o log vai como JSON de uma linha (o que qualquer coletor
  // entende); em dev passa pelo pino-pretty, que é legível no terminal.
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});

export type Logger = typeof logger;

export const createLogger = (scope: string): Logger => logger.child({ scope });
