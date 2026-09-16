import { z } from 'zod';

/**
 * Configuração validada uma vez, no boot. Antes cada módulo lia
 * `process.env.ALGUMA_COISA` na hora de usar, então uma variável faltando só
 * aparecia como um erro estranho meia hora depois — e com credencial
 * hardcoded no meio (o ID do calendário morava no código).
 */

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? fallback : /^(1|true|yes|on)$/i.test(v)));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** Origens permitidas no CORS do matchmaking (separadas por vírgula, `*` libera tudo). */
  CORS_ORIGINS: z.string().default('*'),

  /** Onde fica o build do cliente que o servidor serve em produção. */
  CLIENT_DIST: z.string().optional(),

  /** Redis liga o modo multi-processo (presence + driver compartilhados). */
  REDIS_URL: z.string().url().optional(),

  /** Banco de perfis/histórico. `:memory:` desliga a persistência em disco. */
  DATABASE_PATH: z.string().default('./data/viciotown.db'),

  /** Painel do Colyseus em /colyseus — exige senha para ficar de pé. */
  MONITOR_PASSWORD: z.string().optional(),

  // ---- Google Calendar (Sala Roxa) ----
  GOOGLE_CALENDAR_ID: z.string().optional(),
  /** Caminho do JSON da service account, OU o JSON inteiro em GOOGLE_CREDENTIALS_JSON. */
  GOOGLE_CREDENTIALS_FILE: z.string().optional(),
  GOOGLE_CREDENTIALS_JSON: z.string().optional(),

  // ---- Slack ----
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_READ_CHANNEL: z.string().default('avisos'),
  /** Canal para onde o bot empurra avisos do mundo (café pronto, anúncios). */
  SLACK_NOTIFY_CHANNEL: z.string().optional(),

  // ---- IA do bot ----
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5'),
  /** Desliga a IA mesmo com chave presente (útil para testes determinísticos). */
  BOT_AI_DISABLED: bool(false),
  /** O NPC "Vício" anda e conversa dentro do mundo. */
  BOT_NPC_ENABLED: bool(true),

  TIMEZONE: z.string().default('America/Sao_Paulo'),
});

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  return parsed.data;
}

export const env = load();

export const isProduction = env.NODE_ENV === 'production';

export const corsOrigins: string[] | true =
  env.CORS_ORIGINS === '*'
    ? true
    : env.CORS_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
