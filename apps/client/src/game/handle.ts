import type { Point } from '@viciotown/shared';

/**
 * Ponteiro para a cena, sem importar o Phaser.
 *
 * A UI (joystick, atalhos, botão de centralizar) precisa mandar comandos
 * para o mundo — mas se ela importasse `game/index.ts` diretamente, o Phaser
 * (1,5 MB) entraria no bundle inicial e a tela de criação de avatar esperaria
 * por ele. Este módulo é a fronteira: só tipos e um slot.
 */
export interface WorldHandle {
  recenter(): void;
  step(dx: number, dy: number): void;
  moveTo(tile: Point): boolean;
  fitCamera(): void;
}

let handle: WorldHandle | null = null;

export const worldScene = (): WorldHandle | null => handle;

export const setWorldHandle = (next: WorldHandle | null): void => {
  handle = next;
};
