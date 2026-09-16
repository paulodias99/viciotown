import type { Point } from './types.js';

/**
 * Min-heap binário indexado por `f`. O A* original varria o open set inteiro a
 * cada iteração (O(n) por pop, O(n²) no total). Com salas maiores e um NPC
 * recalculando rota a cada poucos segundos isso vira o gargalo do tick, então
 * o open set vira um heap de verdade: O(log n) por operação.
 */
class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(value: number, key: number): void {
    this.keys.push(key);
    this.values.push(value);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= this.keys[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.values[0]!;
    const lastKey = this.keys.pop()!;
    const lastValue = this.values.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.values[0] = lastValue;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.keys.length && this.keys[l]! < this.keys[smallest]!) smallest = l;
        if (r < this.keys.length && this.keys[r]! < this.keys[smallest]!) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a]!;
    this.keys[a] = this.keys[b]!;
    this.keys[b] = k;
    const v = this.values[a]!;
    this.values[a] = this.values[b]!;
    this.values[b] = v;
  }
}

export interface GridQuery {
  readonly width: number;
  readonly height: number;
  isWalkable(x: number, y: number): boolean;
  /** Assentos são destinos válidos, mas nunca corredores. */
  isSeat(x: number, y: number): boolean;
  /** Tiles temporariamente bloqueados (outro jogador sentado, por exemplo). */
  isBlocked?(x: number, y: number): boolean;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const SQRT2 = Math.SQRT2;
/** Teto de nós expandidos: uma rota impossível não pode travar o tick do servidor. */
const MAX_EXPANSIONS = 8000;

/**
 * A* em grade, 8 direções, sem cortar quinas.
 * Retorna os tiles do caminho SEM o tile inicial, ou `[]` se não houver rota.
 */
export function findPath(grid: GridQuery, start: Point, goal: Point): Point[] {
  const { width, height } = grid;
  const passable = (x: number, y: number): boolean =>
    grid.isWalkable(x, y) && !(grid.isBlocked?.(x, y) ?? false);

  if (goal.x < 0 || goal.y < 0 || goal.x >= width || goal.y >= height) return [];
  if (!passable(goal.x, goal.y)) return [];
  if (start.x === goal.x && start.y === goal.y) return [];

  const size = width * height;
  const key = (x: number, y: number): number => y * width + x;
  const startKey = key(start.x, start.y);
  const goalKey = key(goal.x, goal.y);

  // Arrays densos em vez de Map: a grade é pequena e conhecida, e evitar o
  // hashing por nó é o que mantém o A* barato o bastante pra rodar no tick.
  const gScore = new Float64Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  const h = (x: number, y: number): number => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };

  const open = new MinHeap();
  gScore[startKey] = 0;
  open.push(startKey, h(start.x, start.y));

  let expansions = 0;

  while (open.size > 0) {
    const currentKey = open.pop();
    if (closed[currentKey] === 1) continue;
    closed[currentKey] = 1;

    if (currentKey === goalKey) {
      const path: Point[] = [];
      let k = currentKey;
      while (k !== startKey && k !== -1) {
        path.push({ x: k % width, y: (k / width) | 0 });
        k = cameFrom[k]!;
      }
      return path.reverse();
    }

    if (++expansions > MAX_EXPANSIONS) return [];

    const cx = currentKey % width;
    const cy = (currentKey / width) | 0;
    const cg = gScore[currentKey]!;

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!passable(nx, ny)) continue;
      // diagonal só passa se os dois ortogonais também passam (sem cortar quina)
      if (dx !== 0 && dy !== 0 && (!passable(cx + dx, cy) || !passable(cx, cy + dy))) continue;
      // assento é destino, nunca corredor
      if (grid.isSeat(nx, ny) && !(nx === goal.x && ny === goal.y)) continue;

      const nk = key(nx, ny);
      if (closed[nk] === 1) continue;

      const ng = cg + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
      if (ng < gScore[nk]!) {
        gScore[nk] = ng;
        cameFrom[nk] = currentKey;
        open.push(nk, ng + h(nx, ny));
      }
    }
  }

  return [];
}
