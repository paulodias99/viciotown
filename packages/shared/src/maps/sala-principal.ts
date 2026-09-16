import type { MapDefinition } from '../types.js';

/**
 * Sala Principal — o hub. Todo mundo nasce aqui e todas as outras salas
 * penduram nela:
 *
 *        SalaSPPN (escada, norte)
 *              |
 *   Copa  <-- HUB -->  Sala Central
 *              |
 *         Auditório (sul)
 */
export const salaPrincipal: MapDefinition = {
  key: 'salaPrincipal',
  name: 'Sala Principal',
  tagline: 'O saguão do VicioTown — tudo começa aqui.',
  theme: 'hub',
  order: 0,
  tiles: [
    '##########LL#######',
    '#.................#',
    '#..P...........P..#',
    '#........A........#',
    '#.................#',
    '#...S.........S...#',
    '#.................#',
    '#........Z........#',
    '#.................#',
    '#..P...........P..#',
    '#.................#',
    '###################',
  ],
  doors: [
    { x: 1, y: 6, to: 'salaCopa', spawnAt: { x: 9, y: 11 }, label: 'Copa' },
    // A ÚNICA porta com animação de escada no jogo. As outras ligações são
    // portais (o tapete com a seta): fingir uma escada para quem está
    // descendo obrigava o avatar a subir degraus que não existem no destino.
    {
      x: 9,
      y: 4,
      to: 'salaSPPN',
      spawnAt: { x: 9, y: 12 },
      label: 'SalaSPPN',
      climb: true,
    },
    { x: 17, y: 6, to: 'salaCentral', spawnAt: { x: 12, y: 5 }, label: 'Sala Central' },
    { x: 9, y: 10, to: 'auditorio', spawnAt: { x: 10, y: 11 }, label: 'Auditório' },
  ],
  zones: [
    { name: 'Recepção', x: 6, y: 6, w: 7, h: 3 },
    { name: 'Lounge', x: 1, y: 5, w: 17, h: 1 },
  ],
  spawn: { x: 9, y: 5 },
};
