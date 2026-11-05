import { TILE_OPTIONS, type Piece, type Traits } from '../../../shared/critters';
import { STEPPING_STONES, STONES_LEVELS, type StonesState } from '../../../shared/games/critterGames';
import { critterGame, pickOne, randInt, shuffled, type Board } from './engine';

/** One beat of the hidden pattern: what a stone must have. */
export interface StonesBeat {
  trait: number;
  value: number;
}
export interface StonesPuzzle {
  rows: number;
  cols: number;
  /** By cell: the stone as it starts, or null for a rock. */
  tiles: (Traits | null)[];
  /** The board with the stones out of place put back: the route holds on this one. */
  solved: (Traits | null)[];
  /** Repeats across the board: the first stone fits the first beat, and so on. */
  pattern: StonesBeat[];
  /** A way across that fits, left to right (on `solved`). */
  route: number[];
  swaps: number;
}
interface StonesBoard extends Board {
  path: number[];
  /** By step: stones already tried there that didn't hold. */
  missed: number[][];
  /** This player's board, once they've swapped anything. */
  tiles: (Traits | null)[] | null;
  swapsLeft: number;
}

const randomTile = (): Traits => [randInt(TILE_OPTIONS), randInt(TILE_OPTIONS), randInt(TILE_OPTIONS)];

/** A wiggly way across the board, left to right. */
function wiggle(rows: number, cols: number) {
  const route: number[] = [];
  let row = randInt(rows);
  for (let col = 0; col < cols; col++) {
    route.push(row * cols + col);
    if (col === cols - 1) break;
    const side = row + (Math.random() < 0.5 ? -1 : 1);
    if (Math.random() < 0.6 && side >= 0 && side < rows) {
      row = side;
      route.push(row * cols + col);
    }
  }
  return route;
}

/** Whether a stone holds as the step-th of a crossing. */
export function fitsPattern(pattern: StonesBeat[], step: number, tile: Traits) {
  const beat = pattern[step % pattern.length];
  return tile[beat.trait] === beat.value;
}

/** Are two cells side by side, or one above the other? */
function touching(a: number, b: number, cols: number) {
  return Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs((a % cols) - (b % cols)) === 1;
}

/** Swaps `count` route stones with a neighbour off the route, so the way across needs the wand. */
function scramble(tiles: (Traits | null)[], pattern: StonesBeat[], route: number[], cols: number, count: number) {
  const out = [...tiles];
  let left = count;
  for (const step of shuffled(route.map((_, i) => i).slice(1))) {
    if (!left) break;
    const cell = route[step];
    const beside = tiles.map((_, c) => c).filter((c) => touching(c, cell, cols) && !route.includes(c) && out[c] === tiles[c] && out[c] && !fitsPattern(pattern, step, out[c]!));
    if (!beside.length || out[cell] !== tiles[cell]) continue;
    const other = pickOne(beside);
    [out[cell], out[other]] = [out[other], out[cell]];
    left--;
  }
  return out;
}

export function makeStones(level: number): StonesPuzzle {
  const { rows, cols, beats, mixed, rocks, swaps } = STONES_LEVELS[level - 1];
  const traits = shuffled([0, 1, 2]);
  const values = shuffled(Array.from({ length: TILE_OPTIONS }, (_, i) => i));
  const pattern = Array.from({ length: beats }, (_, i) => ({ trait: mixed ? traits[i] : traits[0], value: values[i] }));
  const tiles: (Traits | null)[] = Array.from({ length: rows * cols }, randomTile);
  const route = wiggle(rows, cols);
  route.forEach((cell, step) => {
    const tile = randomTile();
    const beat = pattern[step % beats];
    tile[beat.trait] = beat.value;
    tiles[cell] = tile;
  });
  const free = shuffled(tiles.map((_, i) => i).filter((c) => !route.includes(c)));
  for (const cell of free.slice(0, rocks)) tiles[cell] = null;
  const scrambled = scramble(tiles, pattern, route, cols, swaps);
  // Now and then a route has no stones to swap with: deal again.
  if (scrambled.filter((t, c) => t !== tiles[c]).length !== swaps * 2) return makeStones(level);
  return { rows, cols, tiles: scrambled, solved: tiles, pattern, route, swaps };
}

/** Progress: how many columns the crossing has reached. */
const reached = (z: StonesPuzzle, path: number[]) => (path.length ? (path[path.length - 1] % z.cols) + 1 : 0);

export const steppingStones = critterGame<StonesPuzzle, StonesBoard>({
  info: STEPPING_STONES,
  levels: STONES_LEVELS,
  make: makeStones,
  board: (z) => ({ got: 0, goal: z.cols, path: [], missed: [], tiles: null, swapsLeft: z.swaps }),
  input(z, b, raw) {
    const input = raw as { type?: string; cell?: number; a?: number; b?: number };
    const onBoard = (c: unknown) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < z.tiles.length;
    if (input.type === 'swap') {
      const [p, q] = [input.a!, input.b!];
      const tiles = b.tiles ?? [...z.tiles];
      if (!b.swapsLeft || !onBoard(p) || !onBoard(q) || !touching(p, q, z.cols) || !tiles[p] || !tiles[q] || b.path.includes(p) || b.path.includes(q)) return false;
      [tiles[p], tiles[q]] = [tiles[q], tiles[p]];
      b.tiles = tiles;
      b.swapsLeft--;
      // They're different stones now, so anything learned about those two is off.
      b.missed = b.missed.map((list) => list.filter((c) => c !== p && c !== q));
      b.note = null;
      return true;
    }
    if (input.type === 'back') {
      if (!b.path.length) return false;
      b.path.pop();
      b.got = reached(z, b.path);
      b.note = null;
      return true;
    }
    const { cell } = input;
    if (input.type !== 'step' || !onBoard(cell)) return false;
    const tile = (b.tiles ?? z.tiles)[cell!];
    const step = b.path.length;
    if (!tile || b.path.includes(cell!) || b.missed[step]?.includes(cell!)) return false;
    const last = b.path[step - 1];
    if (last === undefined) {
      if (cell! % z.cols !== 0) {
        b.note = { text: 'Start on the left.', kind: 'bad' };
        return true;
      }
    } else {
      const down = Math.abs(Math.floor(cell! / z.cols) - Math.floor(last / z.cols));
      const right = (cell! % z.cols) - (last % z.cols);
      if (down + Math.abs(right) !== 1 || right < 0) {
        b.note = { text: 'One stone at a time, heading right.', kind: 'bad' };
        return true;
      }
    }
    if (!fitsPattern(z.pattern, step, tile)) {
      b.triesLeft--;
      (b.missed[step] ??= []).push(cell!);
      b.note = { text: "That stone didn't hold.", kind: 'bad' };
      return true;
    }
    b.path.push(cell!);
    b.got = reached(z, b.path);
    b.note = b.got === z.cols ? { text: 'Across!', kind: 'good' } : null;
    return true;
  },
  phone(z, b, reveal): StonesState {
    return { rows: z.rows, cols: z.cols, tiles: reveal ? z.solved : (b.tiles ?? z.tiles), path: b.path, wrong: b.missed[b.path.length] ?? [], swapsLeft: b.swapsLeft, swaps: z.swaps, answer: reveal ? z.route : null };
  },
  stage(z, reveal) {
    return [{ pieces: (reveal ? z.solved : z.tiles).map((t, i): Piece => (t ? { k: 't', t, on: reveal && z.route.includes(i) } : { k: 'x' })), cols: z.cols }];
  },
});
