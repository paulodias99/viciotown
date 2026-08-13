// Sala Central — recepcao roxa com balcao redondo e painel luminoso na parede,
// alcancada indo pra direita a partir da Sala Principal.
const SALA_CENTRAL_DATA = {
  name: 'Sala Central',
  theme: 'hub',
  tiles: [
    '#########LL####',
    '#.............#',
    '#......Z......#',
    '#.............#',
    '#.............#',
    '#P...........P#',
    '###############',
  ],
  doors: [
    { x: 3, y: 4, to: null, label: 'Reservar Sala Roxa', special: 'salaRoxa' },
    { x: 11, y: 4, to: 'salaPrincipal', spawnAt: { x: 11, y: 4 }, label: 'Voltar' },
  ],
  spawn: { x: 7, y: 4 },
};

if (typeof module !== 'undefined' && module.exports) module.exports = SALA_CENTRAL_DATA;
if (typeof window !== 'undefined') {
  window.MAPS = window.MAPS || {};
  window.MAPS.salaCentral = SALA_CENTRAL_DATA;
}
