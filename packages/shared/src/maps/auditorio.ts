import type { MapDefinition } from '../types.js';

/**
 * Auditório — sala nova. Palco elevado com telão, plateia de poltronas e um
 * ponto de fala: quem sobe no palco e usa o microfone manda um anúncio que
 * aparece para o VicioTown inteiro, não só para esta sala.
 */
export const auditorio: MapDefinition = {
  key: 'auditorio',
  name: 'Auditório',
  tagline: 'Palco, telão e microfone aberto.',
  theme: 'stage',
  order: 4,
  tiles: [
    '#####################',
    '#......QQQQQQQ......#',
    '#..===============..#',
    '#..===============..#',
    '#J.................J#',
    '#..aaaa.aaaaa.aaaa..#',
    '#...................#',
    '#..aaaa.aaaaa.aaaa..#',
    '#...................#',
    '#..aaaa.aaaaa.aaaa..#',
    '#P.................P#',
    '#...................#',
    '#...................#',
    '#####################',
  ],
  doors: [{ x: 10, y: 12, to: 'salaPrincipal', spawnAt: { x: 9, y: 9 }, label: 'Voltar ao saguão' }],
  stations: [
    { x: 10, y: 3, type: 'screen', label: 'Microfone do palco' },
    { x: 1, y: 5, type: 'speaker', label: 'Caixa de som' },
  ],
  zones: [
    { name: 'Palco', x: 3, y: 2, w: 15, h: 2 },
    { name: 'Plateia', x: 1, y: 5, w: 19, h: 5 },
  ],
  spawn: { x: 10, y: 11 },
};
