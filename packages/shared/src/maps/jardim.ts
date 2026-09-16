import type { MapDefinition } from '../types.js';

/**
 * Jardim (terraço) — sala nova, acessível pela escada da SalaSPPN. Grama,
 * deck de madeira, guarda-sóis e bancos: o lugar de "vamos conversar fora
 * da mesa" sem sair do escritório.
 */
export const jardim: MapDefinition = {
  key: 'jardim',
  name: 'Jardim',
  tagline: 'Terraço com grama, sombra e bancos.',
  theme: 'garden',
  order: 5,
  tiles: [
    '###################',
    '#,,,,,,,,,,,,,,,,,#',
    '#,,H,,,,,,,,,,,H,,#',
    '#,,,,,,,,,,,,,,,,,#',
    '#,,__U__,,,__U__,,#',
    '#,,_b_b_,,,_b_b_,,#',
    '#,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,#',
    '#,,H,,,,,,,,,,,H,,#',
    '#,,,,,,,,,,,,,,,,,#',
    '#_________________#',
    '#,,,,,,,,,,,,,,,,,#',
    '###################',
  ],
  doors: [
    { x: 9, y: 10, to: 'salaSPPN', spawnAt: { x: 16, y: 2 }, label: 'Voltar para a SalaSPPN' },
  ],
  zones: [
    { name: 'Sombra oeste', x: 2, y: 4, w: 5, h: 2 },
    { name: 'Sombra leste', x: 11, y: 4, w: 5, h: 2 },
    { name: 'Gramado', x: 1, y: 6, w: 17, h: 4 },
  ],
  spawn: { x: 9, y: 7 },
};
