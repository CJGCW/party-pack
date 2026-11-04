import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUND_MS, UNBLOCK_CAR, slide, solvePoints, solved, type Lot, type UnblockInput, type UnblockState } from '../../shared/games/unblockCar';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

/** The puzzle bank (made by scripts/makeUnblockPuzzles.ts): lots with the fewest slides each takes. */
export const PUZZLES: { lot: Lot; moves: number }[] = JSON.parse(readFileSync(join(import.meta.dirname, 'unblockCar', 'puzzles.json'), 'utf8'));
/** A round's chain: lots needing about this many slides, in order. */
const CHAIN = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14];

/** The round's chain of lots (the same for everyone), each the nearest the bank has to the difficulty wanted. */
export function chainFor(seed: number) {
  const random = seededRandom(seed);
  return CHAIN.map((want) => {
    const best = Math.min(...PUZZLES.map((p) => Math.abs(p.moves - want)));
    const options = PUZZLES.filter((p) => Math.abs(p.moves - want) === best);
    return options[Math.floor(random() * options.length)];
  });
}

export interface Garage {
  chain: { lot: Lot; moves: number }[];
  index: number;
  lot: Lot;
  moves: number;
  solved: number;
  points: number;
  slides: number;
  lastMoved: string;
}

export function newGarage(seed: number): Garage {
  const chain = chainFor(seed);
  return { chain, index: 0, lot: chain[0].lot, moves: 0, solved: 0, points: 0, slides: 0, lastMoved: '' };
}

/** A slide. Returns 'solved' if it got the red car out (and moves on to the next lot), true if it moved, false if not. */
export function slideIn(g: Garage, id: string, to: number): 'solved' | boolean {
  const next = slide(g.lot, id, to);
  if (!next) return false;
  g.lot = next;
  g.moves++;
  g.slides++;
  g.lastMoved = id;
  if (!solved(next)) return true;
  g.points += solvePoints(g.moves, g.chain[g.index].moves);
  g.solved++;
  g.index++;
  g.moves = 0;
  if (g.index < g.chain.length) g.lot = g.chain[g.index].lot;
  return 'solved';
}

class UnblockCar extends BoardsGame<Garage, UnblockState, UnblockState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: 0 });
  }

  protected newBoard(seed: number) {
    return newGarage(seed);
  }

  /** A slide (for the lot they're on); the run ends when the whole chain's solved. */
  protected boardInput(g: Garage, raw: unknown) {
    const input = raw as UnblockInput;
    if (input.type !== 'slide' || this.phase !== 'play' || input.number !== g.index + 1 || typeof input.id !== 'string') return false;
    const result = slideIn(g, input.id, input.to);
    if (result === 'solved' && g.index >= g.chain.length) return 'ended';
    return result !== false;
  }

  protected boardScore(g: Garage) {
    return g.points;
  }

  private state(g: Garage): UnblockState {
    const current = g.chain[Math.min(g.index, g.chain.length - 1)];
    return {
      lot: g.lot,
      number: Math.min(g.index + 1, g.chain.length),
      total: g.chain.length,
      moves: g.moves,
      fewest: current.moves,
      solved: g.solved,
      points: g.points,
      moved: g.slides ? { n: g.slides, id: g.lastMoved } : null,
    };
  }

  protected hostState(g: Garage) {
    return this.state(g);
  }

  protected playerState(g: Garage) {
    return this.state(g);
  }
}

export const unblockCar: MiniGameDefinition = {
  info: UNBLOCK_CAR,
  create: (ctx, _modeId, options) => new UnblockCar(ctx, options.puzzles),
};
