import {
  GEM_RUSH,
  GEM_TYPES,
  ROUND_MS,
  SIZE,
  STONE,
  STONE_POINTS,
  linePoints,
  lineStones,
  linesOn,
  movesOn,
  type GemBoardState,
  type GemInput,
  type GemPlayerState,
} from '../../shared/games/gemRush';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

export interface Gems {
  /** New gems falling in, and shuffles: the same sequence for everyone. */
  random: () => number;
  grid: number[];
  score: number;
  moveId: number;
  steps: string[];
  cleared: number[][];
  gained: number;
  rejected: [number, number] | null;
  stonesSent: number;
}

const encode = (grid: number[]) => grid.map((g) => (g === STONE ? 'S' : String(g))).join('');
const gem = (random: () => number) => Math.floor(random() * GEM_TYPES);

/** Shuffles the gems (stones stay put) until there's a move and nothing's already lined up. */
function shuffle(g: Gems) {
  const cells = g.grid.map((v, i) => (v === STONE ? -1 : i)).filter((i) => i >= 0);
  for (let tries = 0; tries < 200; tries++) {
    for (const c of cells) g.grid[c] = gem(g.random);
    if (!linesOn(g.grid).length && movesOn(g.grid).length) return;
  }
}

/** Everyone's board: the same from the seed, with a move to make and nothing lined up yet. */
export function newGems(seed: number): Gems {
  const g: Gems = { random: seededRandom(seed), grid: new Array(SIZE * SIZE).fill(0), score: 0, moveId: 0, steps: [], cleared: [], gained: 0, rejected: null, stonesSent: 0 };
  shuffle(g);
  return g;
}

/** Turns `n` random gems near the top into stones (fewer if the board's full of them). */
export function addStones(g: Gems, n: number) {
  for (let k = 0; k < n; k++) {
    const options = g.grid.map((v, i) => (v !== STONE && i < SIZE * 3 ? i : -1)).filter((i) => i >= 0);
    if (!options.length) break;
    g.grid[options[Math.floor(g.random() * options.length)]] = STONE;
  }
  if (!movesOn(g.grid).length) shuffle(g);
}

/**
 * Swaps two neighbouring gems. If that makes a line, it clears (with any stones beside it), the
 * gems above fall, new ones drop in, and so on while lines keep forming. Returns the stones it
 * sends (battle), or null if the swap made no line (it's put back).
 */
export function swapGems(g: Gems, a: number, b: number): number | null {
  g.moveId++;
  g.steps = [];
  g.cleared = [];
  g.gained = 0;
  g.rejected = null;
  const adjacent = (Math.abs(a - b) === 1 && Math.floor(a / SIZE) === Math.floor(b / SIZE)) || Math.abs(a - b) === SIZE;
  if (!adjacent || a < 0 || b < 0 || a >= SIZE * SIZE || b >= SIZE * SIZE || g.grid[a] === STONE || g.grid[b] === STONE) return null;
  [g.grid[a], g.grid[b]] = [g.grid[b], g.grid[a]];
  if (!linesOn(g.grid).length) {
    [g.grid[a], g.grid[b]] = [g.grid[b], g.grid[a]];
    g.rejected = [a, b];
    return null;
  }
  g.steps.push(encode(g.grid));
  let stones = 0;
  for (let chain = 1; ; chain++) {
    const lines = linesOn(g.grid);
    if (!lines.length) break;
    const gone = new Set<number>();
    for (const line of lines) {
      g.gained += linePoints(line.length, chain);
      stones += lineStones(line.length, chain);
      for (const c of line) gone.add(c);
    }
    // Stones beside a cleared gem break too.
    for (const c of [...gone]) {
      for (const o of [c - SIZE, c + SIZE, c % SIZE ? c - 1 : -1, c % SIZE < SIZE - 1 ? c + 1 : -1]) {
        if (o < 0 || o >= SIZE * SIZE || g.grid[o] !== STONE || gone.has(o)) continue;
        gone.add(o);
        g.gained += STONE_POINTS;
      }
    }
    g.cleared.push([...gone].sort((x, y) => x - y));
    // Everything above falls into the gaps; new gems drop in at the top.
    for (let col = 0; col < SIZE; col++) {
      const kept: number[] = [];
      for (let row = SIZE - 1; row >= 0; row--) if (!gone.has(row * SIZE + col)) kept.push(g.grid[row * SIZE + col]);
      for (let row = SIZE - 1, k = 0; row >= 0; row--, k++) g.grid[row * SIZE + col] = k < kept.length ? kept[k] : gem(g.random);
    }
    g.steps.push(encode(g.grid));
  }
  if (!movesOn(g.grid).length) {
    shuffle(g);
    g.steps.push(encode(g.grid));
  }
  g.score += g.gained;
  return stones;
}

class GemRush extends BoardsGame<Gems, GemBoardState, GemPlayerState> {
  constructor(
    ctx: GameContext,
    totalPuzzles: number,
    private readonly battle: boolean,
  ) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: 0 });
  }

  protected newBoard(seed: number) {
    return newGems(seed);
  }

  protected boardInput(g: Gems, raw: unknown) {
    const input = raw as GemInput;
    if (input.type !== 'swap' || this.phase !== 'play' || !Number.isInteger(input.a) || !Number.isInteger(input.b)) return false;
    const stones = swapGems(g, input.a, input.b);
    if (this.battle && stones && this.sendGarbage(g, stones)) g.stonesSent += stones;
    return true;
  }

  protected receiveGarbage(g: Gems, amount: number) {
    addStones(g, amount);
    // Not a move of theirs: nothing to play through, just the new board.
    g.moveId++;
    g.steps = [];
    g.cleared = [];
    g.gained = 0;
    g.rejected = null;
  }

  protected boardScore(g: Gems) {
    return g.score;
  }

  protected hostState(g: Gems): GemBoardState {
    return { grid: encode(g.grid), score: g.score, stonesSent: g.stonesSent };
  }

  protected playerState(g: Gems): GemPlayerState {
    return {
      grid: encode(g.grid),
      score: g.score,
      moveId: g.moveId,
      steps: g.steps,
      cleared: g.cleared,
      gained: g.gained,
      rejected: g.rejected,
      battle: this.battle,
      stonesSent: g.stonesSent,
    };
  }
}

export const gemRush: MiniGameDefinition = {
  info: GEM_RUSH,
  create: (ctx, modeId, options) => new GemRush(ctx, options.puzzles, modeId === 'battle'),
};
