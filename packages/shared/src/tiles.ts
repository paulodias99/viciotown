/**
 * Legenda universal de tiles. Cada sala é uma matriz de caracteres; o
 * significado de cada caractere mora AQUI e só aqui, para que servidor
 * (colisão/pathfinding) e cliente (render) nunca divirjam.
 *
 * A tabela é um registro por tile em vez de vários `Set`s soltos porque as
 * três perguntas que o jogo faz — "dá pra andar?", "dá pra sentar?", "é
 * parede?" — são propriedades do mesmo objeto. Um `Set` novo por pergunta é
 * exatamente como um tile acaba andável no servidor e sólido no cliente.
 */

export type TileChar = string;

export interface TileSpec {
  /** Rótulo humano — aparece em ferramentas de debug e no editor de mapas. */
  readonly label: string;
  /** Bloqueia movimento. */
  readonly solid: boolean;
  /** É assento: andável, mas só como destino final (ninguém atravessa cadeira). */
  readonly seat: boolean;
  /** Faz parte da estrutura da sala (paredes) — renderizada como prisma alto. */
  readonly wall: boolean;
  /** Variante de piso usada pelo renderizador (`floor` = piso padrão do tema). */
  readonly floor: 'floor' | 'rug' | 'deck' | 'grass' | 'stage' | null;
}

const spec = (
  label: string,
  opts: Partial<Omit<TileSpec, 'label'>> = {},
): TileSpec => ({
  label,
  solid: opts.solid ?? false,
  seat: opts.seat ?? false,
  wall: opts.wall ?? false,
  floor: opts.floor ?? null,
});

export const TILES = {
  // ---- estrutura -----------------------------------------------------------
  '#': spec('Parede', { solid: true, wall: true }),
  V: spec('Janela', { solid: true, wall: true }),
  W: spec('Quadro', { solid: true, wall: true }),
  Y: spec('Parede com grafismo', { solid: true, wall: true }),
  L: spec('Painel luminoso', { solid: true, wall: true }),

  // ---- pisos ---------------------------------------------------------------
  '.': spec('Chão', { floor: 'floor' }),
  R: spec('Tapete', { floor: 'rug' }),
  _: spec('Deck de madeira', { floor: 'deck' }),
  ',': spec('Grama', { floor: 'grass' }),
  '=': spec('Palco', { floor: 'stage' }),

  // ---- mobiliário sólido ---------------------------------------------------
  D: spec('Mesa de trabalho', { solid: true }),
  T: spec('Mesa de reunião', { solid: true }),
  O: spec('Mesa redonda', { solid: true }),
  P: spec('Planta', { solid: true }),
  K: spec('Cafeteira', { solid: true }),
  F: spec('Estante', { solid: true }),
  A: spec('Escada', { solid: true }),
  Z: spec('Balcão de recepção', { solid: true }),
  G: spec('Geladeira', { solid: true }),
  M: spec('Armário com micro-ondas', { solid: true }),
  I: spec('Ilha de cozinha', { solid: true }),
  N: spec('Lockers', { solid: true }),
  X: spec('Pia', { solid: true }),
  B: spec('Quadro branco', { solid: true }),
  H: spec('Arbusto', { solid: true }),
  U: spec('Guarda-sol', { solid: true }),
  J: spec('Caixa de som', { solid: true }),
  Q: spec('Telão', { solid: true }),

  // ---- assentos ------------------------------------------------------------
  c: spec('Cadeira', { seat: true, floor: 'floor' }),
  o: spec('Cadeira laranja', { seat: true, floor: 'floor' }),
  r: spec('Cadeira rosa', { seat: true, floor: 'floor' }),
  S: spec('Sofá', { seat: true, floor: 'floor' }),
  b: spec('Banco', { seat: true, floor: 'grass' }),
  p: spec('Puff', { seat: true, floor: 'floor' }),
  a: spec('Poltrona de auditório', { seat: true, floor: 'floor' }),
} as const satisfies Record<string, TileSpec>;

export type KnownTile = keyof typeof TILES;

const FALLBACK: TileSpec = spec('Desconhecido', { solid: true });

export function tileSpec(char: string): TileSpec {
  return (TILES as Record<string, TileSpec | undefined>)[char] ?? FALLBACK;
}

/** Tiles que o renderizador desenha como mobiliário (tudo que não é piso nem parede). */
export function isFurniture(char: string): boolean {
  const s = tileSpec(char);
  return !s.wall && s.floor === null;
}
