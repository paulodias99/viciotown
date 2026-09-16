import type { AvatarLook } from '@viciotown/shared';
import { useEffect, useRef } from 'react';
import { CELL_H, CELL_W, COLUMNS, FRAME_MS, bakeAvatarSheet } from '../game/render/avatar';

interface Props {
  look: AvatarLook;
  dir: number;
  /** Anima o passinho de dança na pré-visualização. */
  dancing?: boolean;
  scale?: number;
}

/**
 * Pré-visualização do avatar.
 *
 * A versão anterior subia uma SEGUNDA instância do Phaser só para mostrar o
 * bonequinho no editor — um game loop inteiro, WebGL e tudo, para desenhar
 * 40 retângulos. Aqui é um `<canvas>` 2D que recorta a folha de sprites já
 * gerada: mesma arte, custo quase zero, e funciona antes de o jogo carregar.
 */
export function AvatarPreview({ look, dir, dancing = false, scale = 3 }: Props): React.ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sheetRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const key = JSON.stringify(look);
    if (sheetRef.current?.key !== key) {
      sheetRef.current = { key, canvas: bakeAvatarSheet(look) };
    }
    const sheet = sheetRef.current.canvas;

    let raf = 0;
    let last = 0;

    const render = (time: number): void => {
      const column = dancing ? COLUMNS.dance : COLUMNS.idle;
      const interval = dancing ? FRAME_MS.dance : 400;
      if (time - last > interval) {
        last = time;
        frameRef.current = (frameRef.current + 1) % column.count;
      }

      const col = column.start + frameRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        sheet,
        col * CELL_W,
        (dir & 3) * CELL_H,
        CELL_W,
        CELL_H,
        0,
        0,
        CELL_W * scale,
        CELL_H * scale,
      );
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [look, dir, dancing, scale]);

  return (
    <canvas
      ref={canvasRef}
      width={CELL_W * scale}
      height={CELL_H * scale}
      className="mx-auto block [image-rendering:pixelated]"
      aria-label="Pré-visualização do seu avatar"
    />
  );
}
