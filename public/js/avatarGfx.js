/**
 * Avatar pixel-art estilo Habbo, desenhado proceduralmente com Phaser Graphics.
 * Unidade = 1 pixel de mundo. Altura total 54px, "pes" na origem (0,0).
 * A arte base olha para a DIREITA; direcoes para a esquerda sao espelhadas.
 *
 * Direcoes: 0 = sudoeste, 1 = sudeste, 2 = nordeste, 3 = noroeste
 *           (0 e 1 mostram o rosto; 2 e 3 mostram as costas)
 */
window.AvatarGfx = (() => {
  const H = 54;

  const HAIR_STYLES = ['curto', 'longo', 'coque', 'black', 'moicano', 'bone', 'careca'];
  const TOP_STYLES = ['camiseta', 'moletom', 'blazer'];
  const ACCESSORIES = ['nenhum', 'oculos', 'escuros', 'fone'];

  const SKINS = ['#ffdbb4', '#f0c8a0', '#e0ac7e', '#c68863', '#a3653f', '#6f4327'];
  const HAIR_COLORS = ['#1b1410', '#3a2419', '#6b4423', '#a9713b', '#d9a441', '#e8dcc8', '#b03a3a', '#4a6fa5', '#7d5ba6', '#2e8b6f'];
  const CLOTHES = ['#2f7de1', '#e14b4b', '#3fae63', '#f0a92b', '#8e5cd9', '#20b6c9', '#e26fa8', '#3a4250', '#f2f2f2', '#111418'];
  const PANTS = ['#38414f', '#22262e', '#3f6ea8', '#6b4f3a', '#7a2f3a', '#2e5d46', '#8a8f99', '#d9d2c4'];
  const SHOES = ['#22262e', '#f2f2f2', '#8b3a2f', '#2f5d8b', '#c9a227'];

  /**
   * Fantasias: looks tematicos completos que substituem cabelo/roupa/calça/
   * sapato/acessório por um figurino fixo (só a pele continua escolhível).
   * Pra adicionar uma nova, so entra aqui + os `draw*` correspondentes.
   */
  const FANTASIAS = ['nenhuma', 'saojoao', 'natal'];
  const FANTASIA_LABELS = { nenhuma: 'Nenhuma', saojoao: 'São João', natal: 'Papai Noel' };
  const FANTASIA_PRESETS = {
    saojoao: {
      topColor: '#efe4c8',
      accentColor: '#c0392b',
      pantsColor: '#5b3a29',
      shoesColor: '#3a2a1c',
      hairColor: '#dba838',
    },
    natal: {
      topColor: '#c0392b',
      accentColor: '#f4f4f4',
      pantsColor: '#a52d24',
      shoesColor: '#1c1c1c',
      hairColor: '#c0392b',
    },
  };

  // ---------------------------------------------------------------- cores

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const t = amt < 0 ? 0 : 255;
      const k = Math.abs(amt);
      return Math.round(v + (t - v) * k);
    });
    return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  const toNum = (hex) => parseInt(hex.slice(1), 16);

  function defaultLook() {
    return {
      skin: SKINS[1],
      hair: 'curto',
      hairColor: HAIR_COLORS[1],
      top: 'camiseta',
      topColor: CLOTHES[0],
      pantsColor: PANTS[0],
      shoesColor: SHOES[0],
      accessory: 'nenhum',
      fantasia: 'nenhuma',
    };
  }

  function randomLook() {
    const any = (a) => a[Math.floor(Math.random() * a.length)];
    return {
      skin: any(SKINS),
      hair: any(HAIR_STYLES),
      hairColor: any(HAIR_COLORS),
      top: any(TOP_STYLES),
      topColor: any(CLOTHES),
      pantsColor: any(PANTS),
      shoesColor: any(SHOES),
      accessory: any(ACCESSORIES),
      fantasia: 'nenhuma',
    };
  }

  // ---------------------------------------------------------------- desenho

  /**
   * @param {Phaser.GameObjects.Graphics} g graphics ja transladado para os PES do avatar
   * @param {object} look
   * @param {{dir?:number, frame?:number, sitting?:boolean, dancing?:boolean}} opts
   */
  function draw(g, look, opts = {}) {
    const dir = (opts.dir ?? 1) & 3;
    const frame = Math.max(0, (opts.frame ?? 0) | 0);
    const wf = frame & 3; // caminhada: 4 tempos
    const df = frame % 8; // dança: 8 tempos
    const sitting = !!opts.sitting;
    const dancing = !!opts.dancing && !sitting;
    const back = dir >= 2;
    const mirror = dir === 0 || dir === 3;

    g.save();
    if (mirror) g.scaleCanvas(-1, 1);
    g.translateCanvas(0, -H);

    const p = (x, y, w, h, c) => {
      g.fillStyle(toNum(c), 1);
      g.fillRect(Math.round(x), Math.round(y), w, h);
    };

    // fantasia ativa: so a pele continua sendo escolha do usuario, o resto
    // do figurino vem fixo do preset (ver FANTASIA_PRESETS).
    const fantasiaKey = look.fantasia && look.fantasia !== 'nenhuma' ? look.fantasia : null;
    const preset = fantasiaKey ? FANTASIA_PRESETS[fantasiaKey] : null;

    const skin = look.skin;
    const skinD = shade(skin, -0.18);
    const hairC = preset ? preset.hairColor : look.hairColor;
    const hairD = shade(hairC, -0.25);
    const topC = preset ? preset.topColor : look.topColor;
    const topD = shade(topC, -0.2);
    const topL = shade(topC, 0.18);
    const pantsC = preset ? preset.pantsColor : look.pantsColor;
    const pantsD = shade(pantsC, -0.2);
    const shoesC = preset ? preset.shoesColor : look.shoesColor;

    // animacao de caminhada
    const walking = !sitting && !dancing && (wf === 1 || wf === 3);
    const legSwing = sitting || dancing ? 0 : [0, -2, 0, 2][wf];
    const armSwing = sitting || dancing ? 0 : [0, 1, 0, -1][wf];

    // dança = passinho do Jamal: quica agachado, chuta um pe de cada vez para o
    // lado e mantem os cotovelos dobrados bombeando junto ao corpo.
    const d = (table) => (dancing ? table[df] : 0);
    //                          0   1   2   3   4   5   6   7
    // agachar e levantar o pe nunca caem no mesmo tempo — juntos, some a perna
    const bobD = d([4, 0, 4, 0, 4, 0, 4, 0]); // + = agachado
    const lean = d([0, 2, 0, -2, 0, 3, 0, -3]); // contrapeso do tronco
    const kickL = d([0, -5, 0, 1, 0, -6, 0, 1]);
    const kickR = d([0, 1, 0, 5, 0, 1, 0, 6]);
    const liftL = d([0, 2, 0, 0, 0, 2, 0, 0]);
    const liftR = d([0, 0, 0, 2, 0, 0, 0, 2]);
    const armFar = d([2, -3, 2, 0, 2, -3, 2, 0]);
    const armNear = d([2, 0, 2, -3, 2, 0, 2, -3]);

    // agachar desce tronco, cabeca e bracos juntos; as pernas comprimem
    const bob = dancing ? bobD : walking ? -1 : 0;

    // ------------------------------------------------ cabelo traseiro (atras de tudo)
    // fantasia usa chapeu/gorro (desenhado em drawHair), entao pula o cabelo normal
    if (!fantasiaKey && look.hair === 'black') {
      p(-13, 0, 26, 6, hairC);
      p(-14, 4, 28, 10, hairC);
      p(-12, 13, 24, 3, hairD);
    } else if (!fantasiaKey && look.hair === 'longo') {
      p(-11, 8, 22, 22, hairC);
      p(-11, 28, 22, 2, hairD);
    }

    // ------------------------------------------------ pernas / sapatos
    if (sitting) {
      // coxas projetadas para frente, canelas descendo, pes no chao
      p(-9, 37, 18, 7, pantsC);
      p(-9, 42, 18, 2, pantsD);
      p(-8, 44, 6, 6, pantsC);
      p(2, 44, 6, 6, pantsC);
      p(-9, 49, 7, 4, shoesC);
      p(2, 49, 7, 4, shoesC);
      p(-9, 52, 7, 1, shade(shoesC, -0.3));
      p(2, 52, 7, 1, shade(shoesC, -0.3));
    } else {
      /**
       * Coxa fica ancorada no quadril e so a canela + o pe deslocam: e o que
       * faz o chute lateral ler como chute, em vez de descolar a perna do corpo.
       */
      const leg = (x, kick, lift, shoeOff) => {
        const top = 38 + bob;
        const bottom = 49 - lift;
        const mid = Math.round((top + bottom) / 2);
        const sx = x + Math.round(kick * 0.6);
        p(x, top, 6, Math.max(2, mid - top), pantsC);
        p(sx, mid, 6, Math.max(2, bottom - mid), pantsC);
        p(sx, bottom - 2, 6, 2, pantsD);
        p(sx + shoeOff, bottom, 7, 4, shoesC);
        p(sx + shoeOff, bottom + 3, 7, 1, shade(shoesC, -0.3));
      };
      leg(-7 + legSwing, kickL, liftL, -1);
      leg(1 - legSwing, kickR, liftR, 0);
    }

    // tronco para cima acompanha o gingado; as pernas ficam plantadas no chao
    g.save();
    g.translateCanvas(lean, 0);

    // ------------------------------------------------ braco distante (atras do corpo)
    drawArm(-11 + armSwing, false, dancing, armFar);

    // ------------------------------------------------ tronco
    const bodyY = 23 + bob;
    p(-8, bodyY, 16, 15, topC);
    p(-8, bodyY, 16, 2, topL);
    p(-8, bodyY + 13, 16, 2, topD);

    if (fantasiaKey === 'saojoao') {
      drawXadrez(bodyY);
      drawNeckerchief(bodyY);
    } else if (fantasiaKey === 'natal') {
      drawSantaTrim(bodyY);
    } else if (look.top === 'blazer') {
      p(-2, bodyY, 4, 15, '#f4f4f4');      // camisa por baixo
      p(-8, bodyY, 5, 10, topD);           // lapelas
      p(3, bodyY, 5, 10, topD);
      p(-1, bodyY + 9, 2, 2, shade(topC, -0.45));
    } else if (look.top === 'moletom') {
      p(-7, bodyY + 2, 14, 3, topD);       // capuz caido
      p(-4, bodyY + 8, 8, 4, topD);        // bolsao
      p(-1, bodyY + 1, 2, 5, topL);        // cordao
    } else {
      p(-4, bodyY, 8, 2, topL);            // gola
    }

    // ------------------------------------------------ pescoco + cabeca
    const headY = bob;
    p(-3, 20 + headY, 6, 4, skinD);

    p(-7, 3 + headY, 14, 2, skin);
    p(-9, 5 + headY, 18, 14, skin);
    p(-7, 19 + headY, 14, 2, skin);
    p(-9, 18 + headY, 18, 1, skinD);       // sombra do queixo
    p(-10, 11 + headY, 1, 4, skinD);       // orelhas
    p(9, 11 + headY, 1, 4, skinD);

    // ------------------------------------------------ cabelo frontal
    drawHair(headY);

    // ------------------------------------------------ rosto (so de frente)
    if (!back) {
      const ex = 2; // olhos deslocados para o lado que o avatar encara
      p(-5 + ex, 11 + headY, 2, 3, '#2a2118');
      p(2 + ex, 11 + headY, 2, 3, '#2a2118');
      p(-1 + ex, 16 + headY, 3, 1, shade(skin, -0.4));
    }

    // ------------------------------------------------ acessorios
    drawAccessory(headY, back);

    // ------------------------------------------------ braco proximo (na frente)
    drawArm(8 - armSwing, true, dancing, armNear);

    g.restore(); // fim do gingado
    g.restore();

    // ---- helpers internos ------------------------------------------------

    /**
     * Braco de 14px preso no ombro. Dobrado (dança), o antebraco volta para
     * dentro e a mao para na altura do peito — o braco nao so encolhe.
     * @param {number} dy sobe/desce o ombro no tempo da musica
     */
    function drawArm(x, near, bent = false, dy = 0) {
      const shoulder = 24 + bob + dy;
      const longSleeve = fantasiaKey ? true : look.top !== 'camiseta';
      const sleeveH = longSleeve ? 9 : 5;
      const sleeve = near ? topC : topD;
      const flesh = near ? skin : skinD;

      if (bent) {
        const inX = near ? x - 4 : x + 4;
        p(x, shoulder, 3, 7, sleeve);                                  // braco
        p(inX, shoulder + 5, 4, 3, longSleeve ? sleeve : flesh);       // antebraco dobrando
        if (fantasiaKey === 'natal') p(inX, shoulder + 7, 3, 1, '#f4f4f4'); // punho
        p(inX, shoulder + 7, 3, 3, flesh);                             // mao no peito
        if (near) p(x, shoulder, 3, 1, topL);
      } else {
        p(x, shoulder, 3, sleeveH, sleeve);
        p(x, shoulder + sleeveH, 3, 11 - sleeveH, flesh);
        if (fantasiaKey === 'natal') p(x, shoulder + 9, 3, 2, '#f4f4f4'); // punho
        p(x, shoulder + 11, 3, 3, flesh);
        if (near) p(x, shoulder, 3, 1, topL);
      }
    }

    function drawHair(hy) {
      if (fantasiaKey === 'saojoao') return drawStrawHat(hy);
      if (fantasiaKey === 'natal') return drawSantaHat(hy);

      const style = look.hair;
      if (style === 'careca') return;

      if (style === 'moicano') {
        p(-9, 3 + hy, 18, 3, shade(skin, -0.12));
        p(-3, -4 + hy, 6, 10, hairC);
        p(-3, -4 + hy, 6, 2, shade(hairC, 0.2));
        return;
      }

      if (style === 'bone') {
        p(-9, 5 + hy, 18, 3, hairC);
        p(-10, 0 + hy, 20, 6, topC);
        p(-10, 0 + hy, 20, 2, shade(topC, 0.2));
        p(-10, 5 + hy, 20, 1, shade(topC, -0.3));
        p(3, 5 + hy, 11, 2, shade(topC, -0.15)); // aba
        return;
      }

      // base curta comum a curto / longo / coque / black
      p(-9, 1 + hy, 18, 3, hairC);
      p(-10, 3 + hy, 20, 5, hairC);
      p(-10, 3 + hy, 20, 1, shade(hairC, 0.18));
      p(-10, 8 + hy, 2, 4, hairC);
      p(8, 8 + hy, 2, 4, hairC);
      if (back) p(-9, 5 + hy, 18, 12, hairC); // de costas, cobre a nuca
      if (!back) p(-9, 7 + hy, 5, 2, hairD);  // franja lateral

      if (style === 'coque') {
        p(-4, -5 + hy, 8, 3, hairC);
        p(-5, -3 + hy, 10, 5, hairC);
        p(-5, -3 + hy, 10, 1, shade(hairC, 0.2));
      }
    }

    function drawAccessory(hy, isBack) {
      if (fantasiaKey === 'natal') return drawBeard(hy, isBack);
      if (fantasiaKey === 'saojoao') return; // sem acessorio, mantem o figurino limpo

      const a = look.accessory;
      if (a === 'fone') {
        p(-11, 0 + hy, 22, 3, '#2b2f38');
        p(-11, 0 + hy, 22, 1, '#454b57');
        p(-12, 8 + hy, 4, 8, '#2b2f38');
        p(11, 8 + hy, 1, 8, '#2b2f38');
        p(-11, 10 + hy, 2, 4, topC);
        return;
      }
      if (isBack || a === 'nenhum') return;

      const ex = 2;
      const lens = a === 'escuros' ? '#1c1c22' : '#bee1ff';
      const frame2 = a === 'escuros' ? '#0e0e12' : '#2b2b33';
      p(-7 + ex, 10 + hy, 6, 5, frame2);
      p(0 + ex, 10 + hy, 6, 5, frame2);
      p(-6 + ex, 11 + hy, 4, 3, lens);
      p(1 + ex, 11 + hy, 4, 3, lens);
      p(-1 + ex, 11 + hy, 1, 1, frame2);
      p(-10 + ex, 11 + hy, 3, 1, frame2);
    }

    // ---- fantasias: chapeu/gorro, barba e detalhes de roupa -------------

    function drawStrawHat(hy) {
      const straw = hairC;
      const strawD = shade(straw, -0.22);
      const strawL = shade(straw, 0.18);
      // aba larga (mais larga que a cabeca)
      p(-15, 6 + hy, 30, 3, straw);
      p(-15, 6 + hy, 30, 1, strawL);
      p(-15, 8 + hy, 30, 1, strawD);
      // copa arredondada
      p(-8, -2 + hy, 16, 9, straw);
      p(-6, -5 + hy, 12, 4, straw);
      p(-8, -2 + hy, 16, 2, strawL);
      // fita na base da copa
      p(-8, 5 + hy, 16, 2, '#c0392b');
    }

    function drawSantaHat(hy) {
      const red = hairC;
      const white = '#f4f4f4';
      // faixa branca na base
      p(-10, 4 + hy, 20, 4, white);
      p(-10, 4 + hy, 20, 1, shade(white, -0.15));
      // corpo vermelho (cone caido pro lado)
      p(-9, -6 + hy, 18, 11, red);
      p(-9, -6 + hy, 18, 2, shade(red, 0.15));
      p(6, -9 + hy, 8, 5, red);
      p(11, -10 + hy, 6, 5, red);
      // pompom branco na ponta
      p(14, -13 + hy, 6, 6, white);
    }

    function drawBeard(hy, isBack) {
      if (isBack) return;
      const white = '#f4f4f4';
      const whiteD = shade(white, -0.1);
      p(-9, 13 + hy, 3, 6, white);   // costeleta esquerda
      p(6, 13 + hy, 3, 6, white);    // costeleta direita
      p(-6, 15 + hy, 12, 3, white);  // bigode
      p(-8, 17 + hy, 16, 6, white);  // barba principal
      p(-8, 22 + hy, 16, 2, whiteD); // sombra da barba
    }

    function drawXadrez(bodyY) {
      const accent = FANTASIA_PRESETS.saojoao.accentColor;
      const cw = 4;
      const ch = 5;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          if ((row + col) % 2 === 0) continue;
          p(-8 + col * cw, bodyY + row * ch, cw, ch, accent);
        }
      }
    }

    function drawNeckerchief(bodyY) {
      const red = FANTASIA_PRESETS.saojoao.accentColor;
      const redD = shade(red, -0.2);
      p(-5, bodyY - 2, 10, 3, red);
      p(-3, bodyY + 1, 6, 3, red);
      p(-1, bodyY + 4, 2, 2, redD);
    }

    function drawSantaTrim(bodyY) {
      const white = FANTASIA_PRESETS.natal.accentColor;
      const black = '#1c1c1c';
      const gold = '#d4af37';
      p(-8, bodyY, 16, 2, white);        // gola
      p(-8, bodyY + 13, 16, 2, white);   // barra na base do casaco
      p(-8, bodyY + 7, 16, 3, black);    // cinto
      p(-2, bodyY + 7, 4, 3, gold);      // fivela
    }
  }

  /** Sombra eliptica no chao, desenhada antes do avatar. */
  function drawShadow(g, alpha = 0.22) {
    g.save();
    g.fillStyle(0x000000, alpha);
    g.fillEllipse(0, 0, 22, 10);
    g.restore();
  }

  return {
    H,
    draw,
    drawShadow,
    shade,
    toNum,
    defaultLook,
    randomLook,
    HAIR_STYLES,
    TOP_STYLES,
    ACCESSORIES,
    SKINS,
    HAIR_COLORS,
    CLOTHES,
    PANTS,
    SHOES,
    FANTASIAS,
    FANTASIA_LABELS,
    FANTASIA_PRESETS,
  };
})();
