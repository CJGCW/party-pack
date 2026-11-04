import {
  BALL_COUNT,
  BOXES,
  FEEL_MS,
  MAX_BALLS,
  REVEAL_MS,
  ballsFor,
  guessPoints,
  type CountAim,
  type CountBoardState,
  type CountInput,
  type CountPlayerState,
} from '../../shared/games/ballCount';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { VolleyGame } from './volleys';

export interface Counter {
  points: number;
  /** The last box's guess and answer (shown at its reveal). */
  guess: number | null;
  actual: number | null;
}

class BallCount extends VolleyGame<Counter, CountBoardState, CountPlayerState, CountAim> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { volleys: BOXES, aimMs: FEEL_MS, freshAims: true });
  }

  protected newBoard(): Counter {
    return { points: 0, guess: null, actual: null };
  }

  protected beforeVolley(c: Counter) {
    c.guess = c.actual = null;
  }

  protected defaultAim(): CountAim {
    return { guess: null };
  }

  protected readAim(raw: unknown): CountAim | null {
    const input = raw as CountInput;
    if (input.type !== 'fire' || !Number.isInteger(input.guess)) return null;
    return { guess: Math.max(0, Math.min(MAX_BALLS * 3, input.guess)) };
  }

  protected shoot(shots: { board: Counter; aim: CountAim }[]) {
    const actual = ballsFor(this.seed, this.volleyIndex);
    for (const { board, aim } of shots) {
      board.guess = aim.guess;
      board.actual = actual;
      board.points += aim.guess === null ? 0 : guessPoints(aim.guess, actual);
    }
    return REVEAL_MS;
  }

  protected boardScore(c: Counter) {
    return c.points;
  }

  protected hostState(c: Counter, aim: CountAim): CountBoardState {
    const reveal = this.phase !== 'aim';
    return { guessed: aim.guess !== null, guess: reveal ? c.guess : null, actual: reveal ? c.actual : null };
  }

  protected playerState(c: Counter): CountPlayerState {
    const reveal = this.phase !== 'aim';
    return { balls: ballsFor(this.seed, this.volleyIndex), box: this.volleyIndex, guess: reveal ? c.guess : null, actual: reveal ? c.actual : null };
  }
}

export const ballCount: MiniGameDefinition = {
  info: BALL_COUNT,
  create: (ctx, _modeId, options) => new BallCount(ctx, options.puzzles),
};
