// Sala Principal — hub do jogo (corredor roxo com escada reta subindo pro fundo).
// Layout: um corredor horizontal (Copa a oeste, Sala Central a leste) com um
// ramal vertical ao norte subindo para a SalaSPPN.
//
//   Copa <----spawn----> Sala Central
//              |
//        escada (-> SalaSPPN)
//
// 'A' = decoracao solida da escada (um unico bloco — o desenho em si ja
// "sobe" varios degraus a partir dele). A porta fica logo ao sul, na base.
const SALA_PRINCIPAL_DATA = {
  name: 'Sala Principal',
  theme: 'hub',
  tiles: [
    '###############',
    '#.............#',
    '#......A......#',
    '#.............#',
    '#.............#',
    '#.............#',
    '###############',
  ],
  doors: [
    { x: 2, y: 4, to: 'salaCopa', spawnAt: { x: 8, y: 9 }, label: 'Copa' },
    { x: 7, y: 3, to: 'salaSPPN', spawnAt: { x: 8, y: 10 }, label: 'Escada', climb: true },
    { x: 12, y: 4, to: 'salaCentral', spawnAt: { x: 11, y: 3 }, label: 'Sala Central' },
  ],
  spawn: { x: 7, y: 4 },
};

if (typeof module !== 'undefined' && module.exports) module.exports = SALA_PRINCIPAL_DATA;
if (typeof window !== 'undefined') {
  window.MAPS = window.MAPS || {};
  window.MAPS.salaPrincipal = SALA_PRINCIPAL_DATA;
}
