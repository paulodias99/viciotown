import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';
import { createLogger } from '../logger.js';
import {
  TOOL_DEFINITIONS,
  estatisticas,
  executeTool,
  mapaDoEscritorio,
  quemEstaOnline,
  salaRoxaStatus,
  statusDoCafe,
  type ToolContext,
} from './tools.js';

const log = createLogger('bot');

export interface BrainRequest {
  question: string;
  /** Chave de conversa: mantém o histórico por pessoa/canal. */
  conversationId: string;
  ctx: ToolContext;
}

export interface Brain {
  readonly kind: 'claude' | 'rules';
  reply(request: BrainRequest): Promise<string>;
  forget(conversationId: string): void;
}

const PERSONA = `Você é o Vício, o assistente do VicioTown — um escritório virtual isométrico onde as pessoas da equipe andam com avatares pixel-art, conversam e usam salas.

Como você fala:
- Português do Brasil, informal e direto, como um colega de trabalho simpático.
- Respostas CURTAS: 1 a 3 frases. Nada de listas longas quando uma frase resolve.
- Sem emoji em excesso — no máximo um por resposta, e só quando ajuda.
- Nunca invente informação sobre salas, pessoas ou café: use as ferramentas. Se a ferramenta não souber, diga que não sabe.

O mundo:
- Salas: Sala Principal (o saguão), SalaSPPN (o escritório), Sala Central (recepção, onde se reserva a Sala Roxa), Copa (cozinha e cafeteira), Auditório (palco com microfone) e Jardim (terraço).
- A "Sala Roxa" é a sala de reunião física, reservada pelo Google Calendar.
- O café é feito na Copa e o mundo inteiro é avisado quando fica pronto.

Regras de uso das ferramentas:
- Para qualquer pergunta sobre disponibilidade de sala, café, quem está online ou estatísticas, CHAME a ferramenta correspondente antes de responder.
- Para reservar, você precisa de título, data/hora de início e duração. Se faltar alguma coisa, pergunte em vez de chutar.
- Só use "anunciar_no_mundo" quando a pessoa pedir explicitamente para avisar todo mundo.
- Se pedirem algo que você não faz (abrir chamado, mexer em código, falar com RH), diga o que você faz e ofereça a coisa mais próxima.`;

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY_TURNS = 12;
const CONVERSATION_TTL_MS = 30 * 60 * 1000;

interface Conversation {
  messages: Anthropic.MessageParam[];
  updatedAt: number;
}

/** Bot com IA: escolhe e encadeia ferramentas a partir da pergunta em linguagem natural. */
class ClaudeBrain implements Brain {
  readonly kind = 'claude' as const;
  private readonly client: Anthropic;
  private readonly conversations = new Map<string, Conversation>();

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  forget(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  async reply({ question, conversationId, ctx }: BrainRequest): Promise<string> {
    const conversation = this.getConversation(conversationId);
    const messages: Anthropic.MessageParam[] = [
      ...conversation.messages,
      { role: 'user', content: question },
    ];

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await this.client.messages.create({
          model: env.ANTHROPIC_MODEL,
          max_tokens: 16000,
          // Persona + ferramentas são idênticas a cada chamada, então o
          // breakpoint de cache vai depois delas; o contexto volátil (hora,
          // quem está falando, em que sala) vem no bloco seguinte, fora do cache.
          system: [
            { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: volatileContext(ctx) },
          ],
          tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
          // Resposta de chat curta: `low` corta profundidade de raciocínio (e
          // latência) sem perder a escolha de ferramenta, que é o que importa aqui.
          output_config: { effort: 'low' },
          messages,
        } as Anthropic.MessageCreateParamsNonStreaming);

        if (response.stop_reason === 'refusal') {
          // `stop_details` só vem preenchido em recusa; nem toda versão do SDK
          // o tipa no `Message` estável, então lemos de forma defensiva.
          const details = (response as { stop_details?: unknown }).stop_details;
          log.warn({ details }, 'modelo recusou a pergunta');
          return 'Prefiro não responder isso. Posso ajudar com salas, café ou quem está online.';
        }

        messages.push({ role: 'assistant', content: response.content });

        const toolUses = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );

        if (toolUses.length === 0) {
          const text = textOf(response.content);
          this.remember(conversationId, messages);
          return text || 'Não consegui formular uma resposta agora.';
        }

        // Chamadas paralelas voltam TODAS num único turno de user — dividir em
        // várias mensagens ensina o modelo a parar de paralelizar.
        const results = await Promise.all(
          toolUses.map(async (toolUse): Promise<Anthropic.ToolResultBlockParam> => {
            try {
              const output = await executeTool(ctx, toolUse.name, toolUse.input);
              return { type: 'tool_result', tool_use_id: toolUse.id, content: output };
            } catch (error) {
              log.error({ err: error, tool: toolUse.name }, 'ferramenta falhou');
              return {
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: 'A ferramenta falhou. Diga à pessoa que esse dado está indisponível agora.',
                is_error: true,
              };
            }
          }),
        );

        messages.push({ role: 'user', content: results });
      }

      log.warn({ conversationId }, 'limite de rodadas de ferramenta atingido');
      return 'Me enrolei aqui. Pode reformular a pergunta?';
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return 'Estou recebendo perguntas demais agora — tenta de novo em alguns segundos?';
      }
      if (error instanceof Anthropic.AuthenticationError) {
        log.error('ANTHROPIC_API_KEY inválida');
        return 'Minha integração de IA está com a credencial errada. Avisa quem cuida do servidor?';
      }
      if (error instanceof Anthropic.APIError) {
        log.error({ err: error, status: error.status }, 'erro da API da Anthropic');
      } else {
        log.error({ err: error }, 'erro inesperado no bot');
      }
      // Cair no modo determinístico é melhor que responder "erro": a pergunta
      // mais comum (sala/café/quem está online) continua sendo respondida.
      return ruleReply(question, ctx);
    }
  }

  private getConversation(id: string): Conversation {
    const existing = this.conversations.get(id);
    if (existing && Date.now() - existing.updatedAt < CONVERSATION_TTL_MS) return existing;
    const fresh: Conversation = { messages: [], updatedAt: Date.now() };
    this.conversations.set(id, fresh);
    return fresh;
  }

  private remember(id: string, messages: Anthropic.MessageParam[]): void {
    // Guarda só os últimos turnos: o histórico é conveniência de conversa, não
    // memória de longo prazo, e crescer sem limite só encarece cada chamada.
    const trimmed = messages.slice(-MAX_HISTORY_TURNS);
    // Um histórico não pode começar com tool_result órfão (o tool_use ficou para trás).
    const firstUserIndex = trimmed.findIndex(
      (m) => m.role === 'user' && (typeof m.content === 'string' || m.content[0]?.type !== 'tool_result'),
    );
    this.conversations.set(id, {
      messages: firstUserIndex >= 0 ? trimmed.slice(firstUserIndex) : [],
      updatedAt: Date.now(),
    });

    if (this.conversations.size > 500) {
      const oldest = [...this.conversations.entries()].sort(
        (a, b) => a[1].updatedAt - b[1].updatedAt,
      )[0];
      if (oldest) this.conversations.delete(oldest[0]);
    }
  }
}

function volatileContext(ctx: ToolContext): string {
  const now = new Date();
  const local = now.toLocaleString('pt-BR', {
    timeZone: env.TIMEZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return [
    `Agora: ${local} (fuso ${env.TIMEZONE}).`,
    `Data ISO de referência: ${now.toISOString()}.`,
    `Quem está falando com você: ${ctx.actor}.`,
    ctx.surface === 'world'
      ? `A conversa acontece DENTRO do jogo${ctx.mapKey ? `, na sala ${ctx.mapKey}` : ''}. Responda em no máximo 2 frases curtas — o texto aparece num balão de fala.`
      : 'A conversa acontece no Slack. Pode usar *negrito* e listas com • quando ajudar.',
  ].join('\n');
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------- fallback

const INTENTS: Array<{ test: RegExp; run: (ctx: ToolContext) => Promise<string> | string }> = [
  { test: /caf[eé]|cafezinho|expresso/i, run: statusDoCafe },
  {
    test: /\b(quem|qu[ae]m)\b.*(online|a[ií]|por a[ií]|no escrit[óo]rio)|quem est[áa]|online agora/i,
    run: quemEstaOnline,
  },
  { test: /\b(mapa|salas?|onde fica|como chego|como vou)\b/i, run: mapaDoEscritorio },
  { test: /\b(estat[íi]stic|n[úu]meros|quantas pessoas|m[ée]tricas)\b/i, run: (c) => estatisticas(c) },
  {
    test: /\bsala roxa\b|reuni(ã|a)o|dispon[íi]vel|\blivres?\b|ocupad|reserv/i,
    run: salaRoxaStatus,
  },
];

const HELP = [
  'Oi! Eu sou o Vício 👋 Posso te dizer:',
  '• se a *Sala Roxa* está livre e quais reservas estão na fila',
  '• se tem *café* pronto na Copa',
  '• *quem está online* e em que sala',
  '• o *mapa* do escritório e como chegar em cada sala',
  '',
  'É só perguntar em português mesmo.',
].join('\n');

async function ruleReply(question: string, ctx: ToolContext): Promise<string> {
  for (const intent of INTENTS) {
    if (intent.test.test(question)) return intent.run(ctx);
  }
  return HELP;
}

/**
 * Bot sem IA. Não é um stub: é o mesmo conjunto de ferramentas atrás de
 * intenções por regex, então o VicioTown continua útil sem chave de API —
 * só não entende pedidos fora do roteiro (reservar por texto livre, por exemplo).
 */
class RuleBrain implements Brain {
  readonly kind = 'rules' as const;

  async reply({ question, ctx }: BrainRequest): Promise<string> {
    return ruleReply(question, ctx);
  }

  forget(): void {
    /* sem histórico para esquecer */
  }
}

export function createBrain(): Brain {
  if (env.BOT_AI_DISABLED || !env.ANTHROPIC_API_KEY) {
    log.info(
      { reason: env.ANTHROPIC_API_KEY ? 'desligada por configuração' : 'sem ANTHROPIC_API_KEY' },
      'bot em modo determinístico (intenções por regex)',
    );
    return new RuleBrain();
  }
  log.info({ model: env.ANTHROPIC_MODEL }, 'bot com IA e uso de ferramentas ativo');
  return new ClaudeBrain(env.ANTHROPIC_API_KEY);
}

export { HELP as BOT_HELP_TEXT };
