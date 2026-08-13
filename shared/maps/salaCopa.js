// Copa — cozinha/copa com geladeira, armario+micro-ondas, ilha de terrazzo,
// lockers de parede, cantinho de sofa e mesa de refeicao. Mesmo tamanho da
// SalaSPPN (17x13). Alcancada indo pra esquerda a partir da Sala Principal.
const SALA_COPA_DATA = {
  name: 'Copa',
  theme: 'copa',
  tiles: [
    '#################',
    '#.G..M..K..X..N.#',
    '#.............N.#',
    '#...............#',
    '#...............#',
    '#.......I.......#',
    '#...............#',
    '#...............#',
    '#...........T...#',
    '#.SS.......r.r..#',
    '#.P.............#',
    '#...............#',
    '#################',
  ],
  doors: [
    { x: 8, y: 10, to: 'salaPrincipal', spawnAt: { x: 3, y: 4 }, label: 'Voltar' },
  ],
  // "estacoes" de interacao: tile andavel logo em frente ao movel (a cafeteira
  // em si, K, e a pia, X, sao solidas — a interacao acontece parado do lado).
  stations: [
    { x: 8, y: 2, type: 'coffee' },
    { x: 11, y: 2, type: 'sink' },
  ],
  spawn: { x: 8, y: 9 },
};

if (typeof module !== 'undefined' && module.exports) module.exports = SALA_COPA_DATA;
if (typeof window !== 'undefined') {
  window.MAPS = window.MAPS || {};
  window.MAPS.salaCopa = SALA_COPA_DATA;
}
