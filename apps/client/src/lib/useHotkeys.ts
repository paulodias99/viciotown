import { useEffect } from 'react';
import { worldScene } from '../game/handle';
import { connection } from '../net/client';
import { useGame } from '../store/game';

const STEPS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

/**
 * Atalhos de teclado (desktop).
 *
 * As setas andam na GRADE, não na tela: num mapa isométrico, "cima na tela" é
 * diagonal na grade, e andar em diagonal com as setas confunde mais do que
 * ajuda quando o objetivo é chegar numa porta.
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;

      const game = useGame.getState();

      if (event.key === 'Escape') {
        if (game.modal !== 'none') game.setModal('none');
        else if (game.panel !== 'none') game.setPanel(game.panel);
        return;
      }

      if (typing) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        game.setPanel('chat');
        // O painel precisa existir antes de focar o campo.
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>('[data-chat-input]')?.focus();
        });
        return;
      }

      if (game.locked) return;

      const step = STEPS[event.key];
      if (step) {
        event.preventDefault();
        worldScene()?.step(step[0], step[1]);
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'e':
          game.setModal(game.modal === 'emotes' ? 'none' : 'emotes');
          break;
        case 'm':
          game.setPanel('map');
          break;
        case 'p':
          game.setPanel('roster');
          break;
        case 'f':
          // Interage com a estação em que você está parado.
          if (game.stationPrompt && !game.stationPrompt.needsText) {
            connection.send('interact', { station: game.stationPrompt.station });
          }
          break;
        case 'c':
          worldScene()?.recenter();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
