// Agregador das salas do jogo, para uso no servidor (`require('../shared/maps')`).
// O cliente carrega os mesmos arquivos individualmente via <script>, que ja
// se registram em window.MAPS.
module.exports = {
  salaSPPN: require('./salaSPPN'),
  salaPrincipal: require('./salaPrincipal'),
  salaCentral: require('./salaCentral'),
  salaCopa: require('./salaCopa'),
};
