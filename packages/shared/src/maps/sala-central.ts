import type { MapDefinition } from '../types.js';

/** Sala Central — recepção roxa. É daqui que se reserva a Sala Roxa. */
export const salaCentral: MapDefinition = {
  key: 'salaCentral',
  name: 'Sala Central',
  tagline: 'Recepção e reservas da Sala Roxa.',
  theme: 'hub',
  order: 2,
  tiles: [
    '######LLL########',
    '#...............#',
    '#...............#',
    '#......ZZ.......#',
    '#......ZZ.......#',
    '#...............#',
    '#...............#',
    '#..p.........p..#',
    '#P.............P#',
    '#...............#',
    '#################',
  ],
  doors: [
    { x: 3, y: 5, to: null, label: 'Reservar Sala Roxa', opens: 'meetingRoom' },
    { x: 13, y: 5, to: 'salaPrincipal', spawnAt: { x: 16, y: 6 }, label: 'Voltar ao saguão' },
  ],
  zones: [{ name: 'Recepção', x: 5, y: 2, w: 6, h: 4 }],
  spawn: { x: 8, y: 6 },
};
