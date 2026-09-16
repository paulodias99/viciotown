import { WALK_MS_PER_DIAGONAL, WALK_MS_PER_TILE } from './constants.js';
import type { Point } from './types.js';

/**
 * Rota em trânsito.
 *
 * Na versão anterior o caminho era um `broadcast('path', ...)` avulso: quem
 * entrava no meio do trajeto de outra pessoa via o avatar parado no último
 * tile de repouso e depois "teleportando". Aqui a rota mora no schema, como
 * uma string compacta + o instante em que começou — então ela sincroniza
 * sozinha para quem chega no meio, e servidor e cliente amostram a MESMA
 * função para saber onde o avatar está.
 */

export interface RouteSample {
  x: number;
  y: number;
  /** 0 = sudoeste, 1 = sudeste, 2 = nordeste, 3 = noroeste. */
  dir: number;
  moving: boolean;
  /** Índice do passo atual (para escolher o frame da animação). */
  stepIndex: number;
  /** Tile inteiro em que o avatar está (ou para onde está indo). */
  tile: Point;
  /** true quando o tempo já passou do fim da rota. */
  finished: boolean;
}

export function encodeRoute(path: readonly Point[]): string {
  if (path.length === 0) return '';
  let out = '';
  for (let i = 0; i < path.length; i++) {
    if (i > 0) out += ';';
    out += `${path[i]!.x},${path[i]!.y}`;
  }
  return out;
}

export function decodeRoute(route: string): Point[] {
  if (!route) return [];
  const parts = route.split(';');
  const out: Point[] = new Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const comma = parts[i]!.indexOf(',');
    out[i] = {
      x: Number(parts[i]!.slice(0, comma)),
      y: Number(parts[i]!.slice(comma + 1)),
    };
  }
  return out;
}

/** Duração de um passo: diagonal é mais longa, senão o avatar acelera na diagonal. */
export function stepDuration(from: Point, to: Point): number {
  return from.x !== to.x && from.y !== to.y ? WALK_MS_PER_DIAGONAL : WALK_MS_PER_TILE;
}

export function routeDuration(origin: Point, path: readonly Point[]): number {
  let total = 0;
  let prev = origin;
  for (const step of path) {
    total += stepDuration(prev, step);
    prev = step;
  }
  return total;
}

export interface RouteProgress {
  /** Índice do passo em andamento dentro do path. */
  stepIndex: number;
  /** Tile de onde o passo atual saiu. */
  from: Point;
  /** Tile para onde o passo atual está indo — o próximo ponto "firme". */
  to: Point;
  /** Tempo já gasto DENTRO do passo atual. */
  elapsedInStep: number;
}

/**
 * Onde a rota está, em termos de passos — não de posição interpolada.
 *
 * Serve para replanejar no meio do caminho sem teleporte: quem clica num
 * novo destino enquanto anda tem o passo atual PRESERVADO (o avatar termina
 * de chegar no tile para onde já estava indo) e a rota nova começa dali.
 * Arredondar a posição fracionária, como antes, fazia o avatar pular meio
 * tile para trás ou para frente a cada clique.
 *
 * Retorna `null` quando não há passo em andamento (parado ou rota acabada).
 */
export function routeProgress(
  origin: Point,
  path: readonly Point[],
  elapsedMs: number,
): RouteProgress | null {
  if (path.length === 0) return null;

  let remaining = Math.max(0, elapsedMs);
  let from = origin;

  for (let i = 0; i < path.length; i++) {
    const to = path[i]!;
    const duration = stepDuration(from, to);
    if (remaining < duration) {
      return { stepIndex: i, from, to, elapsedInStep: remaining };
    }
    remaining -= duration;
    from = to;
  }

  return null;
}

/**
 * Direção isométrica a partir de um delta na grade. Converte para os eixos de
 * tela primeiro (`sdx = dx - dy`, `sdy = dx + dy`) porque "para a direita na
 * grade" e "para a direita na tela" não são a mesma coisa num mapa isométrico.
 */
export function directionFromDelta(dx: number, dy: number): number {
  const sdx = dx - dy;
  const sdy = dx + dy;
  if (sdy >= 0) return sdx >= 0 ? 1 : 0;
  return sdx >= 0 ? 2 : 3;
}

/**
 * Onde o avatar está em `elapsed` ms de rota. Interpola entre tiles —
 * é o mesmo cálculo no servidor (para gravar a posição de repouso e detectar
 * portas) e no cliente (para desenhar), o que elimina a classe inteira de
 * bugs de "o servidor acha que estou num tile e a tela mostra outro".
 */
export function sampleRoute(
  origin: Point,
  path: readonly Point[],
  elapsedMs: number,
  fallbackDir = 1,
): RouteSample {
  if (path.length === 0) {
    return {
      x: origin.x,
      y: origin.y,
      dir: fallbackDir,
      moving: false,
      stepIndex: 0,
      tile: { x: origin.x, y: origin.y },
      finished: true,
    };
  }

  let remaining = Math.max(0, elapsedMs);
  let from = origin;

  for (let i = 0; i < path.length; i++) {
    const to = path[i]!;
    const duration = stepDuration(from, to);
    if (remaining < duration) {
      const f = duration === 0 ? 1 : remaining / duration;
      return {
        x: from.x + (to.x - from.x) * f,
        y: from.y + (to.y - from.y) * f,
        dir: directionFromDelta(to.x - from.x, to.y - from.y),
        moving: true,
        stepIndex: i,
        tile: to,
        finished: false,
      };
    }
    remaining -= duration;
    from = to;
  }

  const last = path[path.length - 1]!;
  const prev = path.length > 1 ? path[path.length - 2]! : origin;
  return {
    x: last.x,
    y: last.y,
    dir: directionFromDelta(last.x - prev.x, last.y - prev.y),
    moving: false,
    stepIndex: path.length - 1,
    tile: { x: last.x, y: last.y },
    finished: true,
  };
}
