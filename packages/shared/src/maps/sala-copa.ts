import type { MapDefinition } from '../types.js';

/** Copa — cozinha, cafeteira e o sofá onde a conversa realmente acontece. */
export const salaCopa: MapDefinition = {
  key: 'salaCopa',
  name: 'Copa',
  tagline: 'Café fresco, sofá e fofoca.',
  theme: 'copa',
  order: 3,
  tiles: [
    '###################',
    '#.G..M..K..X..N.N.#',
    '#.................#',
    '#.................#',
    '#......III........#',
    '#.................#',
    '#.................#',
    '#.SS..........T...#',
    '#.pp..........r.r.#',
    '#.................#',
    '#P...............P#',
    '#.................#',
    '#.................#',
    '###################',
  ],
  doors: [{ x: 9, y: 12, to: 'salaPrincipal', spawnAt: { x: 2, y: 6 }, label: 'Voltar ao saguão' }],
  stations: [
    { x: 8, y: 2, type: 'coffee', label: 'Cafeteira' },
    { x: 11, y: 2, type: 'sink', label: 'Pia' },
    { x: 2, y: 2, type: 'fridge', label: 'Geladeira' },
  ],
  zones: [
    { name: 'Cozinha', x: 1, y: 1, w: 17, h: 4 },
    { name: 'Sofá', x: 1, y: 7, w: 4, h: 2 },
    { name: 'Mesa de refeição', x: 13, y: 7, w: 4, h: 2 },
  ],
  spawn: { x: 9, y: 10 },
};
