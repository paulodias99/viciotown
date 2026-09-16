import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { worldScene } from './game/handle';
import { connection } from './net/client';
import { useGame } from './store/game';
import { useProfile } from './store/profile';
import './styles.css';

/**
 * Console de depuração: `__viciotown` no DevTools.
 *
 * Não abre nada que já não fosse possível pelo console — o servidor valida
 * toda mensagem que chega, independentemente de quem a enviou. Em troca, dá
 * para inspecionar o estado e reproduzir situações ("ande até o tile 8,2")
 * sem depender de acertar um clique no lugar certo.
 */
declare global {
  interface Window {
    __viciotown: {
      connection: typeof connection;
      scene: typeof worldScene;
      game: typeof useGame;
      profile: typeof useProfile;
    };
  }
}
window.__viciotown = { connection, scene: worldScene, game: useGame, profile: useProfile };

const host = document.getElementById('root');
if (!host) throw new Error('#root não encontrado');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
