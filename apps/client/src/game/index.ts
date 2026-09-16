import Phaser from 'phaser';
import { setWorldHandle } from './handle';
import { WorldScene } from './scenes/WorldScene';

let game: Phaser.Game | null = null;
let scene: WorldScene | null = null;

/**
 * Cria a instância do Phaser dentro do `parent`.
 *
 * `pixelArt` + `antialias: false` mantêm a arte nítida; ficar no DPR 1 (o
 * padrão do Phaser) é deliberado — dobrar a resolução num celular quadruplica
 * os pixels desenhados e não muda nada visualmente numa arte de pixel.
 */
export function startGame(parent: HTMLElement): Phaser.Game {
  if (game) return game;

  const worldScene = new WorldScene();
  scene = worldScene;
  setWorldHandle(worldScene);

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    backgroundColor: '#14161c',
    render: { pixelArt: true, antialias: false, powerPreference: 'high-performance' },
    // O jogo é orientado a eventos e sem física: 60fps de teto já é folgado, e
    // `forceSetTimeOut: false` deixa o navegador pausar a aba em background.
    fps: { target: 60, forceSetTimeOut: false },
    input: { activePointers: 3 },
    scene: [worldScene],
  });

  return game;
}

export function stopGame(): void {
  game?.destroy(true);
  game = null;
  scene = null;
  setWorldHandle(null);
}
