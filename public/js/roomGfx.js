/**
 * Renderizador isometrico da sala, com Phaser Graphics.
 * Tile de 64x32 (padrao Habbo). Origem do mundo no centro do tile (0,0).
 */
window.RoomGfx = (() => {
  const TW = 64;
  const TH = 32;
  const HW = TW / 2;
  const HH = TH / 2;
  const WALL_H = 72;

  // cores de moveis: compartilhadas por todas as salas (uma mesa e uma mesa,
  // nao importa o tema do ambiente).
  const C = {
    wood: '#b5793f',
    deskTop: '#f2f0ea',
    deskLeg: '#3a3d42',
    chairGrey: '#8b8f96',
    chairOrange: '#e0842f',
    chairRose: '#b3707c',
    chairLilac: '#b7a0d6',
    sofaDark: '#2b2e35',
    sofaAccent: '#565c66',
    shelfWood: '#8a5a34',
  };

  // cores de chao/parede: variam por sala (cada uma define seu proprio tema).
  const THEMES = {
    office: {
      floorA: '#54585f', floorB: '#4a4e55', floorLine: '#3d4046',
      rug: '#6b6f78', rugAlt: '#787c85',
      wallTop: '#f0b93a', wallLeft: '#d9a52c', wallRight: '#b8871f',
      wallAccent: '#5b3a8f',
    },
    hub: {
      floorA: '#8a5a34', floorB: '#7a4d2c', floorLine: '#5e3a20',
      rug: '#6b6f78', rugAlt: '#787c85',
      wallTop: '#4a2f7a', wallLeft: '#3d2566', wallRight: '#2f1c52',
      wallAccent: '#7a5bb0',
    },
    copa: {
      floorA: '#e8e6e0', floorB: '#dcd8d0', floorLine: '#c5c0b6',
      rug: '#c9c5bb', rugAlt: '#d4d0c6',
      wallTop: '#4a2f7a', wallLeft: '#3d2566', wallRight: '#2f1c52',
      wallAccent: '#e0508a',
    },
  };
  let theme = THEMES.office;
  const setTheme = (name) => { theme = THEMES[name] || THEMES.office; };

  const toScreen = (gx, gy) => ({ x: (gx - gy) * HW, y: (gx + gy) * HH });

  /**
   * Inverso de toScreen. Arredonda (nao trunca): o centro do tile corresponde a
   * um valor inteiro exato nos eixos isometricos, entao a regiao do tile e
   * [n-0.5, n+0.5) — que e justamente o losango desenhado na tela.
   */
  function toTile(sx, sy) {
    return {
      x: Math.round(sx / TW + sy / TH),
      y: Math.round(sy / TH - sx / TW),
    };
  }

  function bounds(w, h) {
    return {
      minX: -(h - 1) * HW - HW,
      maxX: (w - 1) * HW + HW,
      minY: -WALL_H - HH,
      maxY: (w - 1 + h - 1) * HH + HH,
    };
  }

  const num = window.AvatarGfx.toNum;
  const sh = window.AvatarGfx.shade;

  // ---------------------------------------------------------------- primitivas

  function diamond(g, cx, cy, hw = HW, hh = HH) {
    g.beginPath();
    g.moveTo(cx, cy - hh);
    g.lineTo(cx + hw, cy);
    g.lineTo(cx, cy + hh);
    g.lineTo(cx - hw, cy);
    g.closePath();
  }

  /** Prisma isometrico: face esquerda (normal +y), face direita (normal +x), topo. */
  function prism(g, cx, cy, hw, hh, h, top, left, right) {
    const ty = cy - h;

    g.fillStyle(num(left), 1);
    g.beginPath();
    g.moveTo(cx - hw, ty);
    g.lineTo(cx, ty + hh);
    g.lineTo(cx, cy + hh);
    g.lineTo(cx - hw, cy);
    g.closePath();
    g.fillPath();

    g.fillStyle(num(right), 1);
    g.beginPath();
    g.moveTo(cx, ty + hh);
    g.lineTo(cx + hw, ty);
    g.lineTo(cx + hw, cy);
    g.lineTo(cx, cy + hh);
    g.closePath();
    g.fillPath();

    g.fillStyle(num(top), 1);
    diamond(g, cx, ty, hw, hh);
    g.fillPath();
  }

  const box = (g, cx, cy, hw, hh, h, color) =>
    prism(g, cx, cy, hw, hh, h, sh(color, 0.16), sh(color, -0.1), sh(color, -0.28));

  // ---------------------------------------------------------------- moveis

  function drawDesk(g, cx, cy) {
    box(g, cx, cy, 30, 15, 24, C.deskTop);
    // pes metalicos
    box(g, cx - 24, cy + 8, 3, 3, 22, C.deskLeg);
    box(g, cx + 24, cy + 8, 3, 3, 22, C.deskLeg);
    const ty = cy - 24;
    // monitor
    box(g, cx + 2, ty + 2, 9, 5, 4, '#3a3f4a');
    g.fillStyle(0x2a2e36, 1);
    g.fillRect(cx - 8, ty - 16, 20, 13);
    g.fillStyle(0x5fd0e6, 1);
    g.fillRect(cx - 7, ty - 15, 18, 11);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(cx - 7, ty - 15, 18, 4);
    // teclado + garrafa de agua
    g.fillStyle(0xd8d4c8, 1);
    g.fillRect(cx - 9, ty + 5, 16, 5);
    box(g, cx + 18, ty + 2, 3, 2, 11, '#dce7e6');
  }

  function drawTable(g, cx, cy) {
    box(g, cx, cy, 30, 15, 20, '#9a6b45');
    const ty = cy - 20;
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(cx - 10, ty - 3, 20, 4);
    box(g, cx - 12, ty + 4, 5, 2, 6, '#f2f2f2');
  }

  /** Mesa redonda (area de reuniao): topo menor e um unico pedestal central. */
  function drawRoundTable(g, cx, cy) {
    box(g, cx, cy, 10, 5, 8, sh(C.wood, -0.35));   // base do pedestal (mais larga, baixa)
    box(g, cx, cy - 8, 6, 3, 12, C.wood);           // coluna
    box(g, cx, cy - 20, 27, 13.5, 4, C.wood);       // tampo (bem maior que a coluna, "flutua")
    g.fillStyle(0xffffff, 0.2);
    diamond(g, cx, cy - 21.5, 23, 11.5);
    g.fillPath();
  }

  function drawChairBase(g, cx, cy, seatColor, backColor) {
    box(g, cx, cy, 8, 4, 13, '#333944');            // pedestal
    box(g, cx, cy - 13, 17, 8.5, 5, seatColor);      // assento
    box(g, cx, cy - 26, 15, 3.5, 22, backColor);     // encosto (placa fina ao norte)
  }

  const drawChair = (g, cx, cy) => drawChairBase(g, cx, cy, C.chairGrey, sh(C.chairGrey, -0.22));
  const drawOrangeChair = (g, cx, cy) => drawChairBase(g, cx, cy, C.chairOrange, sh(C.chairOrange, -0.22));
  const drawRoseChair = (g, cx, cy) => drawChairBase(g, cx, cy, C.chairLilac, C.chairRose);

  function drawSofa(g, cx, cy) {
    box(g, cx, cy, 30, 15, 12, C.sofaDark);           // base
    box(g, cx, cy - 24, 27, 4, 20, sh(C.sofaDark, 0.06)); // encosto
    box(g, cx - 22, cy - 12, 7, 4, 8, sh(C.sofaDark, 0.06)); // bracos
    box(g, cx + 22, cy - 12, 7, 4, 8, sh(C.sofaDark, 0.06));
    g.fillStyle(num(C.sofaAccent), 0.6);
    diamond(g, cx, cy - 12, 24, 12);
    g.fillPath();
  }

  /** Estante de madeira encostada na parede, com alguns objetos de decoracao. */
  function drawShelf(g, cx, cy) {
    box(g, cx, cy, 14, 7, 40, C.shelfWood);
    const ty = cy - 40;
    g.fillStyle(num(sh(C.shelfWood, -0.3)), 1);
    g.fillRect(cx - 11, ty + 10, 22, 2);
    g.fillRect(cx - 11, ty + 22, 22, 2);
    const decor = ['#e14b4b', '#3fae63', '#f0a92b', '#20b6c9'];
    decor.forEach((c, i) => {
      g.fillStyle(num(c), 1);
      g.fillRect(cx - 9 + i * 5, ty + 3, 3, 7);
    });
    g.fillStyle(num('#2f7d4f'), 1);
    g.fillCircle(cx + 6, ty + 18, 5);
  }

  function drawPlant(g, cx, cy) {
    box(g, cx, cy, 12, 6, 14, '#b5652f');
    const ty = cy - 14;
    g.fillStyle(num('#2f7d4f'), 1);
    for (const [dx, dy, r] of [[0, -18, 13], [-9, -10, 9], [9, -11, 9], [0, -30, 9]]) {
      g.fillCircle(cx + dx, ty + dy, r);
    }
    g.fillStyle(num('#3f9d64'), 1);
    g.fillCircle(cx - 4, ty - 22, 7);
  }

  function drawCoffee(g, cx, cy) {
    box(g, cx, cy, 16, 8, 34, '#5a616e');
    const ty = cy - 34;
    g.fillStyle(0x22262e, 1);
    g.fillRect(cx - 9, ty - 4, 18, 10);
    g.fillStyle(0xe14b4b, 1);
    g.fillRect(cx - 7, ty - 2, 3, 3);
    g.fillStyle(0xf0a92b, 1);
    g.fillRect(cx - 1, ty - 2, 8, 2);
    box(g, cx + 5, ty + 3, 4, 2, 6, '#f2f2f2'); // xicara apoiada no topo
  }

  function drawWall(g, cx, cy, kind) {
    prism(g, cx, cy, HW, HH, WALL_H, theme.wallTop, theme.wallLeft, theme.wallRight);
    if (kind === 'V') {
      // janela na face voltada para a sala (normal +y = face esquerda)
      g.fillStyle(0x9a8fe0, 1);
      g.beginPath();
      g.moveTo(cx - 24, cy - WALL_H + 14);
      g.lineTo(cx - 2, cy - WALL_H + 25);
      g.lineTo(cx - 2, cy - WALL_H + 53);
      g.lineTo(cx - 24, cy - WALL_H + 42);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0xf2efe8, 1);
      g.strokePath();
      g.beginPath();
      g.moveTo(cx - 13, cy - WALL_H + 19.5);
      g.lineTo(cx - 13, cy - WALL_H + 47.5);
      g.strokePath();
    } else if (kind === 'W') {
      g.fillStyle(0xf7f6f2, 1);
      g.beginPath();
      g.moveTo(cx - 26, cy - WALL_H + 12);
      g.lineTo(cx - 1, cy - WALL_H + 24.5);
      g.lineTo(cx - 1, cy - WALL_H + 50.5);
      g.lineTo(cx - 26, cy - WALL_H + 38);
      g.closePath();
      g.fillPath();
      g.lineStyle(1.5, 0xb9b2a4, 1);
      g.strokePath();
      g.lineStyle(2, 0x2f7de1, 1);
      g.beginPath();
      g.moveTo(cx - 21, cy - WALL_H + 22);
      g.lineTo(cx - 7, cy - WALL_H + 29);
      g.moveTo(cx - 21, cy - WALL_H + 29);
      g.lineTo(cx - 11, cy - WALL_H + 34);
      g.strokePath();
    } else if (kind === 'Y') {
      // grafismo ondulado de destaque sobre a parede (mancha organica, sem texto)
      const purple = theme.wallAccent;
      g.fillStyle(num(purple), 0.85);
      g.fillCircle(cx - 12, cy - WALL_H + 30, 14);
      g.fillCircle(cx + 6, cy - WALL_H + 20, 11);
      g.fillCircle(cx + 14, cy - WALL_H + 38, 10);
      g.fillStyle(num(purple), 0.5);
      g.fillCircle(cx + 2, cy - WALL_H + 42, 9);
    } else if (kind === 'L') {
      // painel luminoso (dois blocos empilhados, tipo letreiro retroiluminado)
      const glow = '#f6b93b';
      const glowD = sh(glow, -0.25);
      g.fillStyle(num(glowD), 1);
      g.beginPath();
      g.moveTo(cx - 25, cy - WALL_H + 8);
      g.lineTo(cx - 2, cy - WALL_H + 20.5);
      g.lineTo(cx - 2, cy - WALL_H + 56);
      g.lineTo(cx - 25, cy - WALL_H + 43.5);
      g.closePath();
      g.fillPath();
      g.fillStyle(num(glow), 1);
      const panel = (topFrac, botFrac) => {
        g.beginPath();
        g.moveTo(cx - 23, cy - WALL_H + 9 + topFrac);
        g.lineTo(cx - 4, cy - WALL_H + 20 + topFrac);
        g.lineTo(cx - 4, cy - WALL_H + 20 + botFrac);
        g.lineTo(cx - 23, cy - WALL_H + 9 + botFrac);
        g.closePath();
        g.fillPath();
      };
      panel(0, 15);
      panel(19, 34);
    }
  }

  // Escada reta, maciça: cada degrau e um UNICO bloco largo (sem tabuas
  // separadas nem postes finos) — a lateral roxa do proprio bloco already
  // funciona como "parede" da escada, igual a referencia (rampa solida com
  // degraus de madeira clara por cima). Constantes exportadas pra a animacao
  // de "subir" (main.js) andar exatamente por cima dos degraus.
  const STAIR_STEPS = 6;
  const STAIR_RISER = 10; // altura ganha por degrau
  const STAIR_STEP_DX = 10; // avanco por degrau, na direcao da subida
  const STAIR_STEP_DY = -8;
  const STAIR_HW = 34; // metade da largura do degrau (bem largo, tipo rampa)
  const STAIR_HH = 8;

  /**
   * Escada reta e maciça subindo na diagonal: cada degrau e um bloco largo
   * (roxo nas laterais/frente, tampo de madeira clara) empilhado sobre o
   * anterior — sem vaos nem postes soltos, igual a referencia do Habbo.
   */
  function drawStaircase(g, cx, cy) {
    const side = '#3d2566';
    const tread = '#c9a86a';
    const treadD = sh(tread, -0.18);

    for (let i = 0; i < STAIR_STEPS; i++) {
      const sx = cx + i * STAIR_STEP_DX;
      const sy = cy + i * STAIR_STEP_DY;
      const h = STAIR_RISER * (i + 1);
      box(g, sx, sy, STAIR_HW, STAIR_HH, h, side);
      // piso do degrau: faixa de madeira clara na borda de cima, o "onde se pisa"
      g.fillStyle(num(tread), 1);
      diamond(g, sx, sy - h, STAIR_HW, STAIR_HH);
      g.fillPath();
      g.lineStyle(1, num(treadD), 0.7);
      diamond(g, sx, sy - h, STAIR_HW, STAIR_HH);
      g.strokePath();
    }
  }

  /** Deslocamento total de tela (x,y) do pe ao topo da escada — a animacao de
   * subir usa isso pra andar exatamente por cima dos degraus. */
  function getStairClimbOffset() {
    return {
      dx: STAIR_STEPS * STAIR_STEP_DX,
      dy: STAIR_STEPS * STAIR_STEP_DY - STAIR_RISER * STAIR_STEPS,
    };
  }

  /** Balcao de recepcao redondo (como um pequeno pedestal cilindrico roxo). */
  function drawReceptionDesk(g, cx, cy) {
    const purple = '#4a2f7a';
    const purpleL = sh(purple, 0.22);
    const purpleD = sh(purple, -0.2);

    box(g, cx, cy, 22, 22, 30, purple);
    g.fillStyle(num(purpleL), 0.45);
    diamond(g, cx, cy - 30, 22, 22);
    g.fillPath();
    // realce curvo (sugere o balcao arredondado/ciclindrico)
    g.fillStyle(num(purpleD), 0.35);
    diamond(g, cx + 6, cy - 14, 14, 14);
    g.fillPath();
    // topo (tampo do balcao)
    box(g, cx, cy - 30, 20, 20, 4, sh(purple, 0.1));
  }

  function drawFridge(g, cx, cy) {
    const body = '#d8dadd';
    box(g, cx, cy, 13, 8, 46, body);
    g.fillStyle(0xaeb2b8, 1);
    g.fillRect(cx - 2, cy - 44, 3, 32); // linha divisoria da porta
    g.fillStyle(0x6b6f76, 1);
    g.fillRect(cx - 10, cy - 30, 2, 7); // puxadores
    g.fillRect(cx + 4, cy - 30, 2, 7);
  }

  /** Armario de cozinha com um micro-ondas embutido. */
  function drawCabinetMicrowave(g, cx, cy) {
    const wood = '#c9c2b4';
    box(g, cx, cy, 16, 8, 30, wood);
    g.fillStyle(0x2a2e36, 1);
    g.fillRect(cx - 8, cy - 24, 16, 11);
    g.fillStyle(0x1c1f25, 1);
    g.fillRect(cx - 6, cy - 22, 11, 7);
    g.fillStyle(0xf0a92b, 0.7);
    g.fillRect(cx + 6, cy - 21, 2, 5); // botoes
  }

  /** Ilha de cozinha: bancada larga com tampo de terrazzo salpicado. */
  function drawKitchenIsland(g, cx, cy) {
    const stone = '#e6e2d8';
    box(g, cx, cy, 32, 16, 22, stone);
    const speck = ['#a9b6b2', '#c9a8a0', '#8a8f96'];
    let seed = Math.round(cx + cy);
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed % 1000) / 1000;
    };
    for (let i = 0; i < 10; i++) {
      const dx = (rand() - 0.5) * 56;
      const dy = (rand() - 0.5) * 24;
      g.fillStyle(num(speck[i % speck.length]), 0.5);
      g.fillRect(cx + dx, cy - 22 + dy, 2, 2);
    }
  }

  /** Nichos de parede (lockers pessoais), com grade de compartimentos. */
  function drawLockers(g, cx, cy) {
    const wood = '#caa46a';
    box(g, cx, cy, 15, 7, 34, wood);
    g.fillStyle(num(sh(wood, -0.35)), 1);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        g.fillRect(cx - 11 + col * 8, cy - 30 + row * 9, 6, 6);
      }
    }
  }

  /** Pia de cozinha: bancada com cuba embutida e torneira. */
  function drawSink(g, cx, cy) {
    const stone = '#c9c5bb';
    box(g, cx, cy, 16, 8, 20, stone);
    const ty = cy - 20;
    g.fillStyle(0xaeb2b8, 1);
    diamond(g, cx, ty, 9, 4.5);
    g.fillPath();
    g.fillStyle(0x7a7e85, 1);
    g.fillRect(cx - 1, ty - 12, 2, 9); // torneira
    g.fillRect(cx - 1, ty - 12, 6, 2);
  }

  const FURNITURE = {
    D: drawDesk,
    T: drawTable,
    O: drawRoundTable,
    c: drawChair,
    o: drawOrangeChair,
    r: drawRoseChair,
    S: drawSofa,
    P: drawPlant,
    K: drawCoffee,
    F: drawShelf,
    G: drawFridge,
    M: drawCabinetMicrowave,
    I: drawKitchenIsland,
    N: drawLockers,
    A: drawStaircase,
    Z: drawReceptionDesk,
    X: drawSink,
  };

  // ---------------------------------------------------------------- chao

  function drawFloor(g, map) {
    for (let gy = 0; gy < map.MAP_H; gy++) {
      for (let gx = 0; gx < map.MAP_W; gx++) {
        const t = map.tileAt(gx, gy);
        if (t === '#' || t === 'V' || t === 'W' || t === 'Y' || t === 'L') continue;
        const { x, y } = toScreen(gx, gy);
        const checker = (gx + gy) % 2 === 0;
        const fill = t === 'R' ? (checker ? theme.rug : theme.rugAlt) : checker ? theme.floorA : theme.floorB;
        g.fillStyle(num(fill), 1);
        diamond(g, x, y);
        g.fillPath();
        g.lineStyle(1, t === 'R' ? 0x000000 : num(theme.floorLine), t === 'R' ? 0.06 : 1);
        diamond(g, x, y);
        g.strokePath();
      }
    }
  }

  function highlight(g, gx, gy, colorNum, alpha = 1) {
    const { x, y } = toScreen(gx, gy);
    g.lineStyle(2, colorNum, alpha);
    diamond(g, x, y, HW - 2, HH - 1);
    g.strokePath();
  }

  /** Tapete de porta: mancha colorida com uma seta, sobre o chao normal.
   * statusColor (opcional) sobrepoe a cor padrao — usado pela porta da Sala
   * Roxa pra indicar livre (verde) / ocupada (vermelho). */
  function drawDoor(g, cx, cy, built, statusColor) {
    const accent = statusColor || (built ? '#2f7de1' : '#5a5f68');
    g.fillStyle(num(accent), 0.8);
    diamond(g, cx, cy, HW - 12, HH - 6);
    g.fillPath();
    g.lineStyle(2, num(sh(accent, 0.3)), 0.9);
    diamond(g, cx, cy, HW - 12, HH - 6);
    g.strokePath();
    g.fillStyle(0xffffff, built ? 0.9 : 0.5);
    g.beginPath();
    g.moveTo(cx - 4, cy - 5);
    g.lineTo(cx + 5, cy);
    g.lineTo(cx - 4, cy + 5);
    g.closePath();
    g.fillPath();
  }

  return {
    TW, TH, HW, HH, WALL_H, C, THEMES, setTheme,
    toScreen, toTile, bounds, diamond, prism, box,
    drawFloor, drawWall, drawDoor, highlight, FURNITURE,
    getStairClimbOffset,
  };
})();
