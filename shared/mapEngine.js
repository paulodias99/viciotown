/**
 * Motor de grade/colisao/A* independente do mapa em si. Cada sala (SalaSPPN,
 * Sala Principal, ...) fornece so os dados (tiles + portas); este modulo
 * fabrica a API (isWalkable/findPath/etc) em cima desses dados.
 *
 * Legenda universal de tiles (compartilhada por todas as salas):
 *   #  parede        V  janela (parede)    W  quadro branco (parede)
 *   Y  parede com grafismo (parede)        A  decoracao solida (ex: escada)
 *   L  parede com painel luminoso (parede) Z  recepcao redonda (decoracao solida)
 *   .  chao          R  tapete (andavel)
 *   D  mesa (bancada) T  mesa de reuniao   O  mesa redonda
 *   P  planta         K  cafeteira         F  estante
 *   c  cadeira cinza (andavel, senta)      o  cadeira laranja (andavel, senta)
 *   r  cadeira rose/lilas (andavel, senta) S  sofa (andavel, senta)
 *   G  geladeira      M  armario+micro-ondas   I  ilha de cozinha (terrazzo)
 *   N  nichos/lockers de parede               X  pia
 *
 * Portas nao sao um caractere no grid — sao metadados (`doors: [{x,y,to,...}]`)
 * sobre um tile normal e andavel, pra nao precisar inventar uma letra nova
 * por porta. "Estacoes" (`stations: [{x,y,type}]`) seguem o mesmo principio,
 * pra interacoes com moveis (ex: cafeteira, pia) sem virar porta.
 */
const SOLID = new Set(['#', 'V', 'W', 'Y', 'L', 'D', 'T', 'O', 'P', 'K', 'F', 'A', 'Z', 'G', 'M', 'I', 'N', 'X']);
const SEATS = new Set(['c', 'o', 'r', 'S']);

function createMapApi(mapData) {
  const tiles = mapData.tiles;
  const doors = mapData.doors || [];
  const stations = mapData.stations || [];
  const MAP_W = tiles[0].length;
  const MAP_H = tiles.length;

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#';
    return tiles[y][x];
  }

  function isWalkable(x, y) {
    return !SOLID.has(tileAt(x, y));
  }

  function isSeat(x, y) {
    return SEATS.has(tileAt(x, y));
  }

  function doorAt(x, y) {
    return doors.find((d) => d.x === x && d.y === y) || null;
  }

  function stationAt(x, y, type) {
    return stations.find((s) => s.x === x && s.y === y && (!type || s.type === type)) || null;
  }

  /**
   * A* em grade com movimento em 8 direcoes (sem cortar quinas).
   * Retorna lista de tiles [{x,y}, ...] SEM incluir o tile inicial, ou [] se nao houver rota.
   */
  function findPath(start, goal) {
    if (!isWalkable(goal.x, goal.y)) return [];
    if (start.x === goal.x && start.y === goal.y) return [];

    const key = (x, y) => y * MAP_W + x;
    const h = (x, y) => {
      const dx = Math.abs(x - goal.x);
      const dy = Math.abs(y - goal.y);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };

    const open = [{ x: start.x, y: start.y, g: 0, f: h(start.x, start.y) }];
    const gScore = new Map([[key(start.x, start.y), 0]]);
    const cameFrom = new Map();
    const closed = new Set();

    const DIRS = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.x, cur.y);
      if (closed.has(ck)) continue;
      closed.add(ck);

      if (cur.x === goal.x && cur.y === goal.y) {
        const path = [];
        let k = ck;
        let node = { x: cur.x, y: cur.y };
        while (k !== key(start.x, start.y)) {
          path.push(node);
          const prev = cameFrom.get(k);
          if (!prev) break;
          node = prev;
          k = key(prev.x, prev.y);
        }
        return path.reverse();
      }

      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!isWalkable(nx, ny)) continue;
        if (dx && dy && (!isWalkable(cur.x + dx, cur.y) || !isWalkable(cur.x, cur.y + dy))) continue;
        if (isSeat(nx, ny) && !(nx === goal.x && ny === goal.y)) continue;

        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = cur.g + (dx && dy ? Math.SQRT2 : 1);
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          cameFrom.set(nk, { x: cur.x, y: cur.y });
          open.push({ x: nx, y: ny, g: ng, f: ng + h(nx, ny) });
        }
      }
    }
    return [];
  }

  function randomSpawn() {
    for (let tries = 0; tries < 200; tries++) {
      const x = 1 + Math.floor(Math.random() * (MAP_W - 2));
      const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
      if (isWalkable(x, y) && !isSeat(x, y)) return { x, y };
    }
    return { x: 1, y: 1 };
  }

  return {
    name: mapData.name,
    ROOM: { name: mapData.name, tiles },
    MAP_W, MAP_H, SOLID, SEATS, doors, stations,
    tileAt, isWalkable, isSeat, doorAt, stationAt, findPath, randomSpawn,
  };
}

const api = { createMapApi, SOLID, SEATS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.MapEngine = api;
