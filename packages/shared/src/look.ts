import { z } from 'zod';

/**
 * Catálogo do editor de avatar. É a fonte única: o servidor valida contra
 * ele, o cliente monta a UI a partir dele e o renderizador desenha a partir
 * dele. Adicionar um cabelo novo é acrescentar uma linha aqui + o `draw`
 * correspondente no renderizador.
 */

export const HAIR_STYLES = [
  'curto',
  'longo',
  'coque',
  'black',
  'moicano',
  'rabo',
  'cachos',
  'bone',
  'careca',
] as const;

export const HAIR_LABELS: Record<(typeof HAIR_STYLES)[number], string> = {
  curto: 'Curto',
  longo: 'Longo',
  coque: 'Coque',
  black: 'Black',
  moicano: 'Moicano',
  rabo: 'Rabo de cavalo',
  cachos: 'Cachos',
  bone: 'Boné',
  careca: 'Careca',
};

export const TOP_STYLES = ['camiseta', 'moletom', 'blazer', 'regata', 'listrada'] as const;

export const TOP_LABELS: Record<(typeof TOP_STYLES)[number], string> = {
  camiseta: 'Camiseta',
  moletom: 'Moletom',
  blazer: 'Blazer',
  regata: 'Regata',
  listrada: 'Listrada',
};

export const ACCESSORIES = ['nenhum', 'oculos', 'escuros', 'fone', 'mascara', 'cachecol'] as const;

export const ACCESSORY_LABELS: Record<(typeof ACCESSORIES)[number], string> = {
  nenhum: 'Nenhum',
  oculos: 'Óculos',
  escuros: 'Escuros',
  fone: 'Fone',
  mascara: 'Máscara',
  cachecol: 'Cachecol',
};

/**
 * Fantasias substituem o figurino inteiro (cabelo/roupa/calça/sapato/
 * acessório) por um conjunto fixo; só a pele continua sendo escolha.
 */
export const COSTUMES = ['nenhuma', 'saojoao', 'natal', 'halloween', 'praia'] as const;

export const COSTUME_LABELS: Record<(typeof COSTUMES)[number], string> = {
  nenhuma: 'Nenhuma',
  saojoao: 'São João',
  natal: 'Papai Noel',
  halloween: 'Halloween',
  praia: 'Praia',
};

export interface CostumePreset {
  topColor: string;
  accentColor: string;
  pantsColor: string;
  shoesColor: string;
  hairColor: string;
}

export const COSTUME_PRESETS: Record<
  Exclude<(typeof COSTUMES)[number], 'nenhuma'>,
  CostumePreset
> = {
  saojoao: {
    topColor: '#efe4c8',
    accentColor: '#c0392b',
    pantsColor: '#5b3a29',
    shoesColor: '#3a2a1c',
    hairColor: '#dba838',
  },
  natal: {
    topColor: '#c0392b',
    accentColor: '#f4f4f4',
    pantsColor: '#a52d24',
    shoesColor: '#1c1c1c',
    hairColor: '#c0392b',
  },
  halloween: {
    topColor: '#2b2140',
    accentColor: '#f07a1f',
    pantsColor: '#1b1530',
    shoesColor: '#0e0c1a',
    hairColor: '#4a2f7a',
  },
  praia: {
    topColor: '#26c2c9',
    accentColor: '#fff3c4',
    pantsColor: '#f2a541',
    shoesColor: '#d9d2c4',
    hairColor: '#e6cf8f',
  },
};

export const SKINS = ['#ffdbb4', '#f0c8a0', '#e0ac7e', '#c68863', '#a3653f', '#6f4327'] as const;

export const HAIR_COLORS = [
  '#1b1410',
  '#3a2419',
  '#6b4423',
  '#a9713b',
  '#d9a441',
  '#e8dcc8',
  '#b03a3a',
  '#4a6fa5',
  '#7d5ba6',
  '#2e8b6f',
] as const;

export const CLOTHES = [
  '#2f7de1',
  '#e14b4b',
  '#3fae63',
  '#f0a92b',
  '#8e5cd9',
  '#20b6c9',
  '#e26fa8',
  '#3a4250',
  '#f2f2f2',
  '#111418',
] as const;

export const PANTS = [
  '#38414f',
  '#22262e',
  '#3f6ea8',
  '#6b4f3a',
  '#7a2f3a',
  '#2e5d46',
  '#8a8f99',
  '#d9d2c4',
] as const;

export const SHOES = ['#22262e', '#f2f2f2', '#8b3a2f', '#2f5d8b', '#c9a227'] as const;

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Cores são validadas por formato (hex) e não por pertencimento à paleta:
 * a paleta é uma sugestão da UI, e travar o servidor nela impediria o
 * seletor de cor livre que queremos adicionar depois. Estilos, ao contrário,
 * mapeiam 1:1 para funções de desenho — esses precisam ser do enum.
 */
const hexColor = (fallback: string) =>
  z
    .string()
    .regex(HEX)
    .transform((v) => v.toLowerCase())
    .catch(fallback);

export const avatarLookSchema = z.object({
  skin: hexColor(SKINS[1]),
  hair: z.enum(HAIR_STYLES).catch('curto'),
  hairColor: hexColor(HAIR_COLORS[1]),
  top: z.enum(TOP_STYLES).catch('camiseta'),
  topColor: hexColor(CLOTHES[0]),
  pantsColor: hexColor(PANTS[0]),
  shoesColor: hexColor(SHOES[0]),
  accessory: z.enum(ACCESSORIES).catch('nenhum'),
  costume: z.enum(COSTUMES).catch('nenhuma'),
});

/** Forma canônica de um visual — derivada do schema, nunca redeclarada. */
export type AvatarLook = z.infer<typeof avatarLookSchema>;

export function defaultLook(): AvatarLook {
  return {
    skin: SKINS[1],
    hair: 'curto',
    hairColor: HAIR_COLORS[1],
    top: 'camiseta',
    topColor: CLOTHES[0],
    pantsColor: PANTS[0],
    shoesColor: SHOES[0],
    accessory: 'nenhum',
    costume: 'nenhuma',
  };
}

/** Normaliza qualquer coisa vinda da rede/localStorage em um look válido. */
export function sanitizeLook(input: unknown): AvatarLook {
  const parsed = avatarLookSchema.safeParse(input ?? {});
  return parsed.success ? parsed.data : defaultLook();
}

export function randomLook(): AvatarLook {
  const any = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
  return {
    skin: any(SKINS),
    hair: any(HAIR_STYLES),
    hairColor: any(HAIR_COLORS),
    top: any(TOP_STYLES),
    topColor: any(CLOTHES),
    pantsColor: any(PANTS),
    shoesColor: any(SHOES),
    accessory: any(ACCESSORIES),
    costume: 'nenhuma',
  };
}

/** Chave estável de um look — usada para cachear o spritesheet gerado. */
export function lookKey(look: AvatarLook): string {
  return [
    look.skin,
    look.hair,
    look.hairColor,
    look.top,
    look.topColor,
    look.pantsColor,
    look.shoesColor,
    look.accessory,
    look.costume,
  ].join('|');
}
