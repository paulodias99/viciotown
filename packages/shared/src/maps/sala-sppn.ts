import type { MapDefinition } from '../types.js';

/** SalaSPPN — o escritório de verdade: baias, mesa de reunião e o quadro branco. */
export const salaSPPN: MapDefinition = {
  key: 'salaSPPN',
  name: 'SalaSPPN',
  tagline: 'Onde o trabalho acontece.',
  theme: 'office',
  order: 1,
  tiles: [
    '###VV####YYY###WW##',
    '#K................#',
    '#.................#',
    '#.S....DDD....DDD.#',
    '#.S....ccc....ccc.#',
    '#RRR.............F#',
    '#.......oOo.......#',
    '#........o.......P#',
    '#.................#',
    '#B................#',
    '#.....ccc.........#',
    '#.....TTT.........#',
    '#.....ccc....P....#',
    '#.................#',
    '###################',
  ],
  doors: [
    { x: 9, y: 13, to: 'salaPrincipal', spawnAt: { x: 9, y: 5 }, label: 'Descer para o saguão' },
    { x: 15, y: 2, to: 'jardim', spawnAt: { x: 9, y: 11 }, label: 'Terraço' },
  ],
  stations: [
    { x: 2, y: 9, type: 'whiteboard', label: 'Quadro branco' },
    { x: 1, y: 2, type: 'coffee', label: 'Cafeteira da sala' },
  ],
  zones: [
    { name: 'Baias', x: 6, y: 3, w: 11, h: 2 },
    { name: 'Mesa de reunião', x: 5, y: 10, w: 3, h: 3 },
    { name: 'Lounge', x: 1, y: 3, w: 3, h: 3 },
  ],
  spawn: { x: 9, y: 12 },
};
