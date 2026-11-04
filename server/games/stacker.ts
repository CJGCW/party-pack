import {
  COLS,
  ROUND_MS,
  STACKER,
  START_WIDTH,
  slidePosition,
  stepMsFor,
  type Row,
  type StackInput,
  type StackState,
} from '../../shared/games/stacker';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

/** A drop counts where the phone saw the row if it was there within this long before the server heard (taps take a moment to arrive). */
const DROP_WINDOW_MS = 500;
/** Otherwise, it's where the row was this long before the server heard. */
const DROP_LAG_MS = 120;

export interface Tower {
  rows: Row[];
  /** When the sliding row started (ms into the round). */
  startedAt: number;
  fell: StackState['fell'];
}

/** The sliding row's width and speed (the row it'll become is rows.length). */
function sliding(t: Tower) {
  const below = t.rows[t.rows.length - 1];
  return { width: below[1], stepMs: stepMsFor(t.rows.length) };
}

/**
 * Drops the sliding row at `col` (as of `roundMs`). Whatever's over the row below stays; the rest
 * falls off. Returns false if none of it landed, which ends the tower.
 */
export function dropRow(t: Tower, col: number, roundMs: number) {
  const below = t.rows[t.rows.length - 1];
  const { width } = sliding(t);
  const from = Math.max(col, below[0]);
  const to = Math.min(col + width, below[0] + below[1]);
  const kept = Math.max(0, to - from);
  // The overhang (at most one side of it, since the row's no wider than the one below).
  const fellCol = col < below[0] ? col : to;
  const fellWidth = width - kept;
  if (fellWidth > 0) t.fell = { n: (t.fell?.n ?? 0) + 1, row: t.rows.length, col: kept ? fellCol : col, width: fellWidth };
  if (kept === 0) return false;
  t.rows.push([from, kept]);
  t.startedAt = roundMs;
  return true;
}

/** Every column the row could have been on between `fromMs` and `toMs` of sliding. */
export function positionsBetween(width: number, stepMs: number, fromMs: number, toMs: number) {
  const seen = new Set<number>();
  for (let k = Math.floor(Math.max(0, fromMs) / stepMs); k <= Math.floor(Math.max(0, toMs) / stepMs); k++) seen.add(slidePosition(width, stepMs, k * stepMs));
  return seen;
}

class Stacker extends BoardsGame<Tower, StackState, StackState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    // Nothing moves on the server: the sliding row is worked out from when it started.
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: 0 });
  }

  /** The base row, in the middle. */
  protected newBoard(): Tower {
    return { rows: [[Math.floor((COLS - START_WIDTH) / 2), START_WIDTH]], startedAt: 0, fell: null };
  }

  protected boardInput(t: Tower, raw: unknown) {
    const input = raw as StackInput;
    if (input.type !== 'drop' || this.phase !== 'play' || input.row !== t.rows.length) return false;
    const now = this.roundMs();
    const { width, stepMs } = sliding(t);
    const ms = now - t.startedAt;
    const col = Number.isInteger(input.col) && positionsBetween(width, stepMs, ms - DROP_WINDOW_MS, ms).has(input.col) ? input.col : slidePosition(width, stepMs, ms - DROP_LAG_MS);
    return dropRow(t, col, now) ? true : 'ended';
  }

  /** How many rows high (not counting the base). */
  protected boardScore(t: Tower) {
    return t.rows.length - 1;
  }

  private state(t: Tower): StackState {
    const done = this.phase !== 'ready' && this.phase !== 'play';
    const { width, stepMs } = sliding(t);
    return { rows: t.rows, sliding: done ? null : { width, stepMs, ms: Math.max(0, this.roundMs() - t.startedAt) }, fell: t.fell };
  }

  protected hostState(t: Tower) {
    return this.state(t);
  }

  protected playerState(t: Tower) {
    return this.state(t);
  }
}

export const stacker: MiniGameDefinition = {
  info: STACKER,
  create: (ctx, _modeId, options) => new Stacker(ctx, options.puzzles),
};
