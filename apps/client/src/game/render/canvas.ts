/**
 * Utilidades de "assar" (bake) arte procedural em textura.
 *
 * A versão anterior redesenhava o mundo inteiro — piso, paredes, todos os
 * móveis e todos os avatares — num único `Phaser.Graphics` a cada frame.
 * Isso é ~2.000 chamadas de path por frame; num notebook passa, num celular
 * derruba para 20fps e esquenta o aparelho.
 *
 * Aqui cada peça é desenhada UMA vez num `<canvas>`, virada textura e depois
 * só posicionada. O trabalho por frame passa a ser mover sprites, que é o que
 * a GPU faz de graça.
 */

export interface BakedTexture {
  canvas: HTMLCanvasElement;
  /** Onde ficava a origem do desenho dentro da textura recortada. */
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
}

export type PaintFn = (ctx: CanvasRenderingContext2D) => void;

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/**
 * Desenha num canvas folgado, mede o que realmente foi pintado e recorta.
 *
 * Medir em vez de declarar bounds à mão evita a classe de bug em que alguém
 * acrescenta um detalhe ao móvel (uma antena, uma aba de chapéu) e ele
 * aparece cortado — o recorte passa a ser consequência do desenho.
 */
export function bake(paint: PaintFn, scratchSize = 320): BakedTexture {
  const scratch = createCanvas(scratchSize, scratchSize);
  const ctx = context2d(scratch);
  const originX = scratchSize / 2;
  const originY = scratchSize / 2;

  ctx.save();
  ctx.translate(originX, originY);
  paint(ctx);
  ctx.restore();

  const bounds = opaqueBounds(ctx, scratchSize, scratchSize);
  if (!bounds) {
    return { canvas: createCanvas(1, 1), anchorX: 0, anchorY: 0, width: 1, height: 1 };
  }

  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const cropped = createCanvas(width, height);
  context2d(cropped).drawImage(scratch, bounds.minX, bounds.minY, width, height, 0, 0, width, height);

  return {
    canvas: cropped,
    anchorX: originX - bounds.minX,
    anchorY: originY - bounds.minY,
    width,
    height,
  };
}

function opaqueBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3]! === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------- primitivas

export function fillRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function fillPolygon(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0], points[i]![1]);
  ctx.closePath();
  ctx.fill();
}

export function strokePolygon(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  color: string,
  width = 1,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0], points[i]![1]);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function fillCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function fillEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
