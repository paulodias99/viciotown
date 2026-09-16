import type { AvatarLook, Pose } from '@viciotown/shared';
import { AVATAR_HEIGHT, COSTUME_PRESETS, shade } from '@viciotown/shared';
import { context2d, createCanvas, fillRect } from './canvas';

/**
 * Avatar pixel-art procedural.
 *
 * A arte continua sendo ~40 retângulos por frame (é o que torna cada peça
 * recolorível de graça), mas agora esses retângulos são desenhados UMA vez
 * por aparência, numa folha de sprites — em vez de a cada frame, para cada
 * jogador, como antes. Com 20 pessoas na sala isso era ~800 retângulos por
 * frame só de gente.
 *
 * A arte base olha para a DIREITA; as direções da esquerda são espelhadas.
 * Direções: 0 = sudoeste, 1 = sudeste, 2 = nordeste, 3 = noroeste.
 */

const H = AVATAR_HEIGHT;

/** Célula da folha de sprites. Folgada o bastante para chapéus e braços erguidos. */
export const CELL_W = 56;
export const CELL_H = 78;
const FEET_X = CELL_W / 2;
const FEET_Y = 70;

export const ORIGIN_X = FEET_X / CELL_W;
export const ORIGIN_Y = FEET_Y / CELL_H;

/**
 * Layout das colunas da folha. Cada linha é uma direção; a coluna é a pose.
 * O mapa é exportado porque a cena precisa converter (pose, tempo) → frame,
 * e as duas coisas precisam concordar exatamente.
 */
export const COLUMNS = {
  idle: { start: 0, count: 1 },
  walk: { start: 1, count: 4 },
  dance: { start: 5, count: 8 },
  sit: { start: 13, count: 1 },
  wave: { start: 14, count: 2 },
  clap: { start: 16, count: 2 },
  sad: { start: 18, count: 1 },
} as const satisfies Record<string, { start: number; count: number }>;

export type AvatarColumn = keyof typeof COLUMNS;

export const COLUMNS_PER_DIR = 19;
export const TOTAL_FRAMES = COLUMNS_PER_DIR * 4;

/** Duração de cada tempo de animação, por pose. */
export const FRAME_MS: Record<AvatarColumn, number> = {
  idle: 1000,
  walk: 120,
  dance: 125,
  sit: 1000,
  wave: 220,
  clap: 160,
  sad: 1000,
};

/** Converte a pose do servidor na coluna da folha. */
export function columnForPose(pose: Pose, moving: boolean): AvatarColumn {
  if (moving) return 'walk';
  switch (pose) {
    case 'sit':
      return 'sit';
    case 'dance':
      return 'dance';
    case 'wave':
      return 'wave';
    case 'clap':
      return 'clap';
    case 'sad':
      return 'sad';
    case 'climb':
    case 'brew':
      return 'walk';
    default:
      return 'idle';
  }
}

export function frameIndex(dir: number, column: AvatarColumn, step: number): number {
  const { start, count } = COLUMNS[column];
  return (dir & 3) * COLUMNS_PER_DIR + start + (step % count);
}

// ---------------------------------------------------------------- desenho

interface DrawOptions {
  dir: number;
  column: AvatarColumn;
  step: number;
}

function drawAvatar(ctx: CanvasRenderingContext2D, look: AvatarLook, opts: DrawOptions): void {
  const dir = opts.dir & 3;
  const back = dir >= 2;
  const mirror = dir === 0 || dir === 3;
  const { column, step } = opts;

  const sitting = column === 'sit';
  const dancing = column === 'dance';
  const waving = column === 'wave';
  const clapping = column === 'clap';
  const sadly = column === 'sad';
  const walking = column === 'walk';

  ctx.save();
  if (mirror) ctx.scale(-1, 1);
  ctx.translate(0, -H);

  const p = (x: number, y: number, w: number, h: number, c: string): void =>
    fillRect(ctx, x, y, w, h, c);

  const costumeKey =
    look.costume && look.costume !== 'nenhuma'
      ? (look.costume as keyof typeof COSTUME_PRESETS)
      : null;
  const preset = costumeKey ? COSTUME_PRESETS[costumeKey] : null;

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

  const wf = step & 3;
  const df = step % 8;

  const stepping = walking && (wf === 1 || wf === 3);
  const legSwing = walking ? [0, -2, 0, 2][wf]! : 0;
  const armSwing = walking ? [0, 1, 0, -1][wf]! : 0;

  // Dança: quica agachado, chuta um pé de cada vez e bombeia os cotovelos.
  // Agachar e levantar o pé nunca caem no mesmo tempo — juntos, a perna some.
  const d = (table: readonly number[]): number => (dancing ? table[df]! : 0);
  const bobD = d([4, 0, 4, 0, 4, 0, 4, 0]);
  const lean = d([0, 2, 0, -2, 0, 3, 0, -3]);
  const kickL = d([0, -5, 0, 1, 0, -6, 0, 1]);
  const kickR = d([0, 1, 0, 5, 0, 1, 0, 6]);
  const liftL = d([0, 2, 0, 0, 0, 2, 0, 0]);
  const liftR = d([0, 0, 0, 2, 0, 0, 0, 2]);
  const armFar = d([2, -3, 2, 0, 2, -3, 2, 0]);
  const armNear = d([2, 0, 2, -3, 2, 0, 2, -3]);

  const bob = dancing ? bobD : stepping ? -1 : sadly ? 2 : 0;

  // ---------------------------------------------- cabelo traseiro
  if (!costumeKey && look.hair === 'black') {
    p(-13, 0, 26, 6, hairC);
    p(-14, 4, 28, 10, hairC);
    p(-12, 13, 24, 3, hairD);
  } else if (!costumeKey && (look.hair === 'longo' || look.hair === 'cachos')) {
    p(-11, 8, 22, 22, hairC);
    p(-11, 28, 22, 2, hairD);
    if (look.hair === 'cachos') {
      p(-13, 10, 3, 4, hairC);
      p(10, 10, 3, 4, hairC);
      p(-13, 20, 3, 5, hairD);
      p(10, 20, 3, 5, hairD);
    }
  } else if (!costumeKey && look.hair === 'rabo') {
    p(-3, 6, 7, 5, hairC);
    p(-1, 10, 5, 16, hairC);
    p(-1, 24, 5, 3, hairD);
  }

  // ---------------------------------------------- pernas / sapatos
  if (sitting) {
    p(-9, 37, 18, 7, pantsC);
    p(-9, 42, 18, 2, pantsD);
    p(-8, 44, 6, 6, pantsC);
    p(2, 44, 6, 6, pantsC);
    p(-9, 49, 7, 4, shoesC);
    p(2, 49, 7, 4, shoesC);
    p(-9, 52, 7, 1, shade(shoesC, -0.3));
    p(2, 52, 7, 1, shade(shoesC, -0.3));
  } else {
    // A coxa fica ancorada no quadril e só a canela + o pé deslocam: é isso
    // que faz o chute lateral ler como chute em vez de perna descolando.
    const leg = (x: number, kick: number, lift: number, shoeOff: number): void => {
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

  ctx.save();
  ctx.translate(lean, 0);

  const bodyY = 23 + bob;

  // ---------------------------------------------- braço distante (atrás)
  drawArm(-11 + armSwing, false, armFar);

  // ---------------------------------------------- tronco
  p(-8, bodyY, 16, 15, topC);
  p(-8, bodyY, 16, 2, topL);
  p(-8, bodyY + 13, 16, 2, topD);

  if (costumeKey === 'saojoao') {
    drawXadrez(bodyY);
    drawNeckerchief(bodyY);
  } else if (costumeKey === 'natal') {
    drawSantaTrim(bodyY);
  } else if (costumeKey === 'halloween') {
    drawWitchTrim(bodyY);
  } else if (costumeKey === 'praia') {
    drawBeachTrim(bodyY);
  } else if (look.top === 'blazer') {
    p(-2, bodyY, 4, 15, '#f4f4f4');
    p(-8, bodyY, 5, 10, topD);
    p(3, bodyY, 5, 10, topD);
    p(-1, bodyY + 9, 2, 2, shade(topC, -0.45));
  } else if (look.top === 'moletom') {
    p(-7, bodyY + 2, 14, 3, topD);
    p(-4, bodyY + 8, 8, 4, topD);
    p(-1, bodyY + 1, 2, 5, topL);
  } else if (look.top === 'regata') {
    p(-8, bodyY, 16, 3, skin);
    p(-8, bodyY, 3, 8, skin);
    p(5, bodyY, 3, 8, skin);
    p(-5, bodyY, 10, 2, topL);
  } else if (look.top === 'listrada') {
    for (let i = 0; i < 4; i++) p(-8, bodyY + 2 + i * 3, 16, 2, topD);
    p(-4, bodyY, 8, 2, topL);
  } else {
    p(-4, bodyY, 8, 2, topL);
  }

  // ---------------------------------------------- pescoço + cabeça
  const headY = bob;
  p(-3, 20 + headY, 6, 4, skinD);
  p(-7, 3 + headY, 14, 2, skin);
  p(-9, 5 + headY, 18, 14, skin);
  p(-7, 19 + headY, 14, 2, skin);
  p(-9, 18 + headY, 18, 1, skinD);
  p(-10, 11 + headY, 1, 4, skinD);
  p(9, 11 + headY, 1, 4, skinD);

  drawHair(headY);

  // ---------------------------------------------- rosto (só de frente)
  if (!back) {
    const ex = 2;
    p(-5 + ex, 11 + headY, 2, 3, '#2a2118');
    p(2 + ex, 11 + headY, 2, 3, '#2a2118');
    if (sadly) {
      p(-5 + ex, 10 + headY, 2, 1, '#2a2118');
      p(2 + ex, 10 + headY, 2, 1, '#2a2118');
      p(-1 + ex, 17 + headY, 3, 1, shade(skin, -0.4));
    } else {
      p(-1 + ex, 16 + headY, 3, 1, shade(skin, -0.4));
    }
  }

  drawAccessory(headY, back);

  // ---------------------------------------------- braço próximo (na frente)
  drawArm(8 - armSwing, true, armNear);

  ctx.restore();
  ctx.restore();

  // ---- helpers -----------------------------------------------------------

  /**
   * Braço de 14px preso no ombro. Dobrado, o antebraço volta para dentro e a
   * mão para na altura do peito — o braço não simplesmente encolhe.
   */
  function drawArm(x: number, near: boolean, dy: number): void {
    const shoulder = 24 + bob + dy;
    const longSleeve = costumeKey ? costumeKey !== 'praia' : look.top !== 'camiseta' && look.top !== 'regata';
    const sleeveH = longSleeve ? 9 : 5;
    const sleeve = near ? topC : topD;
    const flesh = near ? skin : skinD;

    // Aceno: só o braço da frente sobe, e a manga/mão trocam de ponta — senão
    // a mão fica no meio do braço.
    if (waving && near) {
      const lift = step % 2 === 0 ? 0 : -3;
      p(x, shoulder - 8, 3, 8, sleeve);
      p(x + 1, shoulder - 16 + lift, 3, 9, longSleeve ? sleeve : flesh);
      p(x + 1, shoulder - 19 + lift, 4, 4, flesh);
      return;
    }

    const bent = dancing || clapping;
    if (bent) {
      const inX = near ? x - 4 : x + 4;
      const clapOffset = clapping ? (step % 2 === 0 ? (near ? -2 : 2) : 0) : 0;
      p(x, shoulder, 3, 7, sleeve);
      p(inX + clapOffset, shoulder + 5, 4, 3, longSleeve ? sleeve : flesh);
      if (costumeKey === 'natal') p(inX + clapOffset, shoulder + 7, 3, 1, '#f4f4f4');
      p(inX + clapOffset, shoulder + 7, 3, 3, flesh);
      if (near) p(x, shoulder, 3, 1, topL);
      return;
    }

    p(x, shoulder, 3, sleeveH, sleeve);
    p(x, shoulder + sleeveH, 3, 11 - sleeveH, flesh);
    if (costumeKey === 'natal') p(x, shoulder + 9, 3, 2, '#f4f4f4');
    p(x, shoulder + 11, 3, 3, flesh);
    if (near) p(x, shoulder, 3, 1, topL);
  }

  function drawHair(hy: number): void {
    if (costumeKey === 'saojoao') return drawStrawHat(hy, hairC);
    if (costumeKey === 'praia') return drawStrawHat(hy, '#e6cf8f');
    if (costumeKey === 'natal') return drawSantaHat(hy);
    if (costumeKey === 'halloween') return drawWitchHat(hy);

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
      p(3, 5 + hy, 11, 2, shade(topC, -0.15));
      return;
    }

    // base curta, comum a curto / longo / coque / black / rabo / cachos
    p(-9, 1 + hy, 18, 3, hairC);
    p(-10, 3 + hy, 20, 5, hairC);
    p(-10, 3 + hy, 20, 1, shade(hairC, 0.18));
    p(-10, 8 + hy, 2, 4, hairC);
    p(8, 8 + hy, 2, 4, hairC);
    if (back) p(-9, 5 + hy, 18, 12, hairC);
    if (!back) p(-9, 7 + hy, 5, 2, hairD);

    if (style === 'coque') {
      p(-4, -5 + hy, 8, 3, hairC);
      p(-5, -3 + hy, 10, 5, hairC);
      p(-5, -3 + hy, 10, 1, shade(hairC, 0.2));
    }
    if (style === 'cachos') {
      p(-11, 1 + hy, 4, 4, hairC);
      p(7, 1 + hy, 4, 4, hairC);
      p(-6, -2 + hy, 5, 4, hairC);
      p(1, -2 + hy, 5, 4, hairC);
    }
  }

  function drawAccessory(hy: number, isBack: boolean): void {
    if (costumeKey === 'natal') return drawBeard(hy, isBack);
    if (costumeKey) return;

    const a = look.accessory;
    if (a === 'fone') {
      p(-11, 0 + hy, 22, 3, '#2b2f38');
      p(-11, 0 + hy, 22, 1, '#454b57');
      p(-12, 8 + hy, 4, 8, '#2b2f38');
      p(11, 8 + hy, 1, 8, '#2b2f38');
      p(-11, 10 + hy, 2, 4, topC);
      return;
    }
    if (a === 'cachecol') {
      p(-9, 20 + hy, 18, 4, '#c0392b');
      p(-9, 22 + hy, 18, 1, shade('#c0392b', -0.25));
      p(4, 23 + hy, 4, 9, '#c0392b');
      return;
    }
    if (isBack || a === 'nenhum') return;

    const ex = 2;
    if (a === 'mascara') {
      p(-8 + ex, 14 + hy, 15, 6, '#dfe7ef');
      p(-8 + ex, 14 + hy, 15, 1, '#b9c4cf');
      p(-9 + ex, 13 + hy, 2, 1, '#b9c4cf');
      return;
    }

    const lens = a === 'escuros' ? '#1c1c22' : '#bee1ff';
    const frame = a === 'escuros' ? '#0e0e12' : '#2b2b33';
    p(-7 + ex, 10 + hy, 6, 5, frame);
    p(0 + ex, 10 + hy, 6, 5, frame);
    p(-6 + ex, 11 + hy, 4, 3, lens);
    p(1 + ex, 11 + hy, 4, 3, lens);
    p(-1 + ex, 11 + hy, 1, 1, frame);
    p(-10 + ex, 11 + hy, 3, 1, frame);
  }

  // ---- fantasias ---------------------------------------------------------

  function drawStrawHat(hy: number, straw: string): void {
    const strawD = shade(straw, -0.22);
    const strawL = shade(straw, 0.18);
    p(-15, 6 + hy, 30, 3, straw);
    p(-15, 6 + hy, 30, 1, strawL);
    p(-15, 8 + hy, 30, 1, strawD);
    p(-8, -2 + hy, 16, 9, straw);
    p(-6, -5 + hy, 12, 4, straw);
    p(-8, -2 + hy, 16, 2, strawL);
    p(-8, 5 + hy, 16, 2, costumeKey === 'praia' ? '#26c2c9' : '#c0392b');
  }

  function drawSantaHat(hy: number): void {
    const red = hairC;
    const white = '#f4f4f4';
    p(-10, 4 + hy, 20, 4, white);
    p(-10, 4 + hy, 20, 1, shade(white, -0.15));
    p(-9, -6 + hy, 18, 11, red);
    p(-9, -6 + hy, 18, 2, shade(red, 0.15));
    p(6, -9 + hy, 8, 5, red);
    p(11, -10 + hy, 6, 5, red);
    p(14, -13 + hy, 6, 6, white);
  }

  function drawWitchHat(hy: number): void {
    const purple = '#4a2f7a';
    const purpleL = shade(purple, 0.2);
    p(-16, 5 + hy, 32, 3, purple);
    p(-16, 5 + hy, 32, 1, purpleL);
    p(-7, -1 + hy, 14, 7, purple);
    p(-5, -7 + hy, 10, 7, purple);
    p(-3, -12 + hy, 6, 6, purple);
    p(-7, 3 + hy, 14, 2, '#f07a1f');
  }

  function drawBeard(hy: number, isBack: boolean): void {
    if (isBack) return;
    const white = '#f4f4f4';
    p(-9, 13 + hy, 3, 6, white);
    p(6, 13 + hy, 3, 6, white);
    p(-6, 15 + hy, 12, 3, white);
    p(-8, 17 + hy, 16, 6, white);
    p(-8, 22 + hy, 16, 2, shade(white, -0.1));
  }

  function drawXadrez(y: number): void {
    const accent = COSTUME_PRESETS.saojoao.accentColor;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col) % 2 === 0) continue;
        p(-8 + col * 4, y + row * 5, 4, 5, accent);
      }
    }
  }

  function drawNeckerchief(y: number): void {
    const red = COSTUME_PRESETS.saojoao.accentColor;
    p(-5, y - 2, 10, 3, red);
    p(-3, y + 1, 6, 3, red);
    p(-1, y + 4, 2, 2, shade(red, -0.2));
  }

  function drawSantaTrim(y: number): void {
    p(-8, y, 16, 2, '#f4f4f4');
    p(-8, y + 13, 16, 2, '#f4f4f4');
    p(-8, y + 7, 16, 3, '#1c1c1c');
    p(-2, y + 7, 4, 3, '#d4af37');
  }

  function drawWitchTrim(y: number): void {
    const orange = COSTUME_PRESETS.halloween.accentColor;
    p(-8, y, 16, 2, orange);
    p(-8, y + 13, 16, 2, orange);
    p(-2, y + 4, 4, 4, orange);
    p(-1, y + 3, 2, 1, '#1b1530');
  }

  function drawBeachTrim(y: number): void {
    const sand = COSTUME_PRESETS.praia.accentColor;
    p(-8, y, 16, 3, sand);
    for (let i = 0; i < 3; i++) p(-8, y + 5 + i * 4, 16, 2, sand);
  }
}

// ---------------------------------------------------------------- folha

/**
 * Onde está a MÃO da frente, em pixels relativos aos pés do avatar.
 *
 * A xícara era desenhada num deslocamento fixo na altura do peito, então
 * ficava boiando ao lado do corpo. Como a mão muda de altura com o balanço
 * do passo, com o agachar da dança e com o lado para onde o avatar olha, a
 * posição precisa vir de quem desenha o braço — por isso mora aqui, ao lado
 * de `drawAvatar`, e não na cena.
 */
export function handOffset(dir: number, column: AvatarColumn, step: number): {
  x: number;
  y: number;
} {
  const mirror = dir === 0 || dir === 3;
  const wf = step & 3;
  const df = step % 8;

  const walking = column === 'walk';
  const dancing = column === 'dance';
  const clapping = column === 'clap';
  const waving = column === 'wave';

  const armSwing = walking ? [0, 1, 0, -1][wf]! : 0;
  const bobD = dancing ? [4, 0, 4, 0, 4, 0, 4, 0][df]! : 0;
  const lean = dancing ? [0, 2, 0, -2, 0, 3, 0, -3][df]! : 0;
  const armNear = dancing ? [2, 0, 2, -3, 2, 0, 2, -3][df]! : 0;
  const bob = dancing ? bobD : walking && (wf === 1 || wf === 3) ? -1 : column === 'sad' ? 2 : 0;

  const armX = 8 - armSwing;
  const shoulder = 24 + bob + armNear;

  let localX: number;
  let localY: number;

  if (waving) {
    // Braço erguido: manga e mão trocam de ponta (ver `drawArm`).
    const lift = step % 2 === 0 ? 0 : -3;
    localX = armX + 3;
    localY = shoulder - 17 + lift;
  } else if (dancing || clapping) {
    const clapOffset = clapping ? (step % 2 === 0 ? -2 : 0) : 0;
    localX = armX - 4 + clapOffset + 1.5;
    localY = shoulder + 8.5;
  } else {
    localX = armX + 1.5;
    localY = shoulder + 12.5;
  }

  return {
    // O tronco inteiro desliza com o gingado da dança; a mão vai junto.
    x: (mirror ? -1 : 1) * (localX + lean),
    y: localY - H,
  };
}

/** Xícara de café, desenhada como sprite próprio preso à mão do avatar. */
export function bakeCup(): HTMLCanvasElement {
  const canvas = createCanvas(9, 8);
  const ctx = context2d(canvas);
  fillRect(ctx, 1, 1, 6, 5, '#ffffff');
  fillRect(ctx, 1, 1, 6, 1, '#e6e2d8');
  fillRect(ctx, 2, 2, 4, 2, '#6b4a2b');
  fillRect(ctx, 7, 2, 1, 2, '#d8d4c8'); // asa
  fillRect(ctx, 1, 6, 6, 1, '#b9b2a4'); // sombra da base
  return canvas;
}

/** Sombra elíptica do avatar, como textura própria (desenhada sob o sprite). */
export function bakeShadow(): HTMLCanvasElement {
  const canvas = createCanvas(26, 14);
  const ctx = context2d(canvas);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(13, 7, 12, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/**
 * Gera a folha de sprites completa de uma aparência: 4 direções × 19 poses.
 * ~76 células de 56×78 — uma textura de 1064×312, gerada em poucos ms e
 * reaproveitada por todos os avatares que usem o mesmo look.
 */
export function bakeAvatarSheet(look: AvatarLook): HTMLCanvasElement {
  const canvas = createCanvas(CELL_W * COLUMNS_PER_DIR, CELL_H * 4);
  const ctx = context2d(canvas);

  for (let dir = 0; dir < 4; dir++) {
    for (const [name, spec] of Object.entries(COLUMNS) as Array<[AvatarColumn, { start: number; count: number }]>) {
      for (let step = 0; step < spec.count; step++) {
        const col = spec.start + step;
        ctx.save();
        ctx.translate(col * CELL_W + FEET_X, dir * CELL_H + FEET_Y);
        drawAvatar(ctx, look, { dir, column: name, step });
        ctx.restore();
      }
    }
  }

  return canvas;
}

/** Miniatura estática para o editor/roster, sem passar pelo Phaser. */
export function bakeAvatarPortrait(look: AvatarLook, scale = 2): HTMLCanvasElement {
  const canvas = createCanvas(CELL_W * scale, CELL_H * scale);
  const ctx = context2d(canvas);
  ctx.scale(scale, scale);
  ctx.translate(FEET_X, FEET_Y);
  drawAvatar(ctx, look, { dir: 1, column: 'idle', step: 0 });
  return canvas;
}
