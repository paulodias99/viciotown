// SalaSPPN — escritorio amarelo/roxo (ver legenda em shared/mapEngine.js).
// A porta de saida fica em (8,11), no chao aberto perto da parede sul;
// quem entra pela SalaSPPN vindo da Sala Principal aparece logo ao lado, em (8,10)
// (chegou subindo a escada da Sala Principal, entao volta descendo por essa mesma porta).
const SALA_SPPN_DATA = {
  name: 'SalaSPPN',
  theme: 'office',
  tiles: [
    '###VV##YYY##WW###',
    '#K............F.#',
    '#.S...DDD.....F.#',
    '#.S...ccc...o...#',
    '#RRR.......oOoP.#',
    '#...........o...#',
    '#...............#',
    '#.....D.D.......#',
    '#.....c.c.......#',
    '#P..............#',
    '#...............#',
    '#...............#',
    '#################',
  ],
  doors: [
    { x: 8, y: 11, to: 'salaPrincipal', spawnAt: { x: 10, y: 3 }, label: 'Saída' },
  ],
};

if (typeof module !== 'undefined' && module.exports) module.exports = SALA_SPPN_DATA;
if (typeof window !== 'undefined') {
  window.MAPS = window.MAPS || {};
  window.MAPS.salaSPPN = SALA_SPPN_DATA;
}
