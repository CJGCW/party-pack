import { TILE_OPTIONS, type Piece, type Traits } from '../../../shared/critters';
import { STEPPING_STONES, STONES_LEVELS, type StonesState } from '../../../shared/games/critterGames';
import { critterGame, randInt, shuffled, type Board } from './engine';

export interface StonesPuzzle {
  rows: number;
  cols: number;
  stick: boolean;
  /** By cell: the stone, or null for a rock. */
  tiles: (Traits | null)[];
  /** Routes that work, bottom to top. */
  routes: number[][];
}
interface StonesBoard extends Board {
  path: number[];
  crumbled: number[];
}

const randomTile = (): Traits => [randInt(TILE_OPTIONS), randInt(TILE_OPTIONS), randInt(TILE_OPTIONS)];

/** A wiggly way up the board, inside these columns. */
function wiggle(rows: number, cols: number, from: number, to: number) {
  const route: number[] = [];
  let col = from + randInt(to - from + 1);
  for (let row = rows - 1; row >= 0; row--) {
    route.push(row * cols + col);
    if (row === 0) break;
    const side = col + (Math.random() < 0.5 ? -1 : 1);
    if (Math.random() < 0.6 && side >= from && side <= to) {
      col = side;
      route.push(row * cols + col);
    }
  }
  return route;
}

/** Whether a stone can come next on a crossing. */
export function canStep(z: { stick: boolean }, path: Traits[], next: Traits) {
  if (!path.length) return true;
  if (z.stick) return [0, 1, 2].some((trait) => path.every((t) => t[trait] === next[trait]));
  return [0, 1, 2].some((trait) => path[path.length - 1][trait] === next[trait]);
}

export function makeStones(level: number): StonesPuzzle {
  const { rows, cols, walkers, rocks, stick } = STONES_LEVELS[level - 1];
  const tiles: (Traits | null)[] = Array.from({ length: rows * cols }, randomTile);
  const bands: [number, number][] = walkers === 1 ? [[0, cols - 1]] : [[0, 1], [cols - 2, cols - 1]];
  const routes = bands.map(([from, to]) => wiggle(rows, cols, from, to));
  // Each route keeps to its own trait, or they'd make one big easy patch.
  const traits = shuffled([0, 1, 2]);
  routes.forEach((route, r) => {
    const trait = traits[r];
    const value = randInt(TILE_OPTIONS);
    let last: Traits | null = null;
    for (const cell of route) {
      const t = randomTile();
      if (stick) t[trait] = value;
      else if (last) {
        const keep = randInt(3);
        t[keep] = last[keep];
      }
      tiles[cell] = t;
      last = t;
    }
  });
  const onRoute = routes.flat();
  const free = shuffled(tiles.map((_, i) => i).filter((c) => !onRoute.includes(c)));
  for (const cell of free.slice(0, rocks)) tiles[cell] = null;
  return { rows, cols, stick, tiles, routes };
}

export const steppingStones = critterGame<StonesPuzzle, StonesBoard>({
  info: STEPPING_STONES,
  levels: STONES_LEVELS,
  make: makeStones,
  board: (_z, level) => ({ got: 0, goal: STONES_LEVELS[level - 1].walkers, path: [], crumbled: [] }),
  input(z, b, raw) {
    const input = raw as { type?: string; cell?: number };
    if (input.type === 'back') {
      if (!b.path.length) return false;
      b.path.pop();
      b.note = null;
      return true;
    }
    if (input.type === 'restart') {
      // Never the last try: that would end the puzzle with nothing to show for it.
      if (b.triesLeft <= 1 || (!b.path.length && !b.crumbled.length)) return false;
      b.triesLeft--;
      b.path = [];
      b.crumbled = [];
      b.got = 0;
      b.note = { text: 'Fresh stones.', kind: '' };
      return true;
    }
    const { cell } = input;
    if (input.type !== 'step' || !Number.isInteger(cell) || cell! < 0 || cell! >= z.tiles.length) return false;
    const tile = z.tiles[cell!];
    if (!tile || b.path.includes(cell!) || b.crumbled.includes(cell!)) return false;
    const last = b.path[b.path.length - 1];
    if (last === undefined) {
      if (cell! < (z.rows - 1) * z.cols) {
        b.note = { text: 'Start on the bottom row.', kind: 'bad' };
        return true;
      }
    } else {
      const apart = Math.abs(Math.floor(cell! / z.cols) - Math.floor(last / z.cols)) + Math.abs((cell! % z.cols) - (last % z.cols));
      if (apart !== 1) {
        b.note = { text: 'One stone at a time.', kind: 'bad' };
        return true;
      }
    }
    if (!canStep(z, b.path.map((c) => z.tiles[c]!), tile)) {
      b.note = { text: "That stone doesn't match.", kind: 'bad' };
      return true;
    }
    b.path.push(cell!);
    b.note = null;
    if (cell! < z.cols) {
      b.crumbled.push(...b.path);
      b.path = [];
      b.got++;
      b.note = { text: 'Across!', kind: 'good' };
    }
    return true;
  },
  phone(z, b, reveal): StonesState {
    return { rows: z.rows, cols: z.cols, tiles: z.tiles, crumbled: b.crumbled, path: b.path, stick: z.stick, answer: reveal ? z.routes : null };
  },
  stage(z, reveal) {
    const onRoute = z.routes.flat();
    return [{ pieces: z.tiles.map((t, i): Piece => (t ? { k: 't', t, on: reveal && onRoute.includes(i) } : { k: 'x' })), cols: z.cols }];
  },
});
