import { useEffect, useRef, useState } from 'react';

/**
 * Hospeda o canvas do Phaser.
 *
 * O motor entra por `import()` dinâmico: são ~1,5 MB que a tela de criação de
 * avatar não usa para nada. Carregar sob demanda tira esse peso do primeiro
 * carregamento — que numa rede móvel é a diferença entre abrir em 2s e em 8s.
 */
export function GameCanvas(): React.ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void import('../game')
      .then(({ startGame }) => {
        if (cancelled || !hostRef.current) return;
        startGame(hostRef.current);
        setLoading(false);
      })
      .catch((error: unknown) => {
        console.error('[game] falha ao carregar o motor', error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      // Em dev o React monta duas vezes (StrictMode) e `startGame` é
      // idempotente; destruir aqui derrubaria o jogo na segunda montagem.
      if (import.meta.env.PROD) void import('../game').then(({ stopGame }) => stopGame());
    };
  }, []);

  return (
    <div ref={hostRef} className="absolute inset-0" aria-label="Mundo do VicioTown">
      {loading || failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-ink-400">
          {failed ? (
            <>
              <span className="text-2xl">⚠️</span>
              <p>Não consegui carregar o mundo. Recarregue a página.</p>
            </>
          ) : (
            <>
              <span className="size-8 animate-spin rounded-full border-2 border-ink-600 border-t-grape-400" />
              <p>Montando o escritório…</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
