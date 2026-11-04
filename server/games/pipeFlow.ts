import {
  COLS,
  CROSS,
  NO_PIECE,
  PIPE_FLOW,
  QUEUE_SHOWN,
  REPLACE_MS,
  ROUND_MS,
  ROWS,
  TICK_HZ,
  WATER_START_MS,
  across,
  flowMsAt,
  flowThrough,
  opposite,
  pieceAt,
  sourceFor,
  type PipeInput,
  type PipeState,
  type Side,
} from '../../shared/games/pipeFlow';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Plumbing {
  seed: number;
  pieces: number[];
  source: { cell: number; out: Side };
  filled: { cell: number; in: Side }[];
  /** The next piece in the queue (its number), and when the water fills its next square (ms into the round). */
  next: number;
  nextFlowAt: number;
  /** Where the water's heading: out of this square, by this side. */
  head: { cell: number; out: Side };
  lockedUntil: number;
}

export function newPlumbing(seed: number): Plumbing {
  const source = sourceFor(seed);
  return { seed, pieces: new Array(COLS * ROWS).fill(NO_PIECE), source, filled: [], next: 0, nextFlowAt: WATER_START_MS, head: { cell: source.cell, out: source.out }, lockedUntil: 0 };
}

/** Lays the next piece on `cell`, `ms` into the round. Not on the tap or on water; over a dry piece it swaps, but locks the board a moment. */
export function lay(p: Plumbing, cell: number, ms: number) {
  if (ms < p.lockedUntil || cell === p.source.cell || p.filled.some((f) => f.cell === cell)) return false;
  if (p.pieces[cell] !== NO_PIECE) p.lockedUntil = ms + REPLACE_MS;
  p.pieces[cell] = pieceAt(p.seed, p.next++);
  return true;
}

/** Runs the water on to `ms`. Returns true when it spills (off the grid, or into a square that doesn't take it). */
export function flowOn(p: Plumbing, ms: number) {
  while (ms >= p.nextFlowAt) {
    const into = across(p.head.cell, p.head.out);
    const inSide = opposite(p.head.out);
    // A square fills once, but a crossing fills once each way.
    const visits = p.filled.filter((f) => f.cell === into);
    const full = visits.length > 0 && (p.pieces[into] !== CROSS || visits.some((f) => f.in === inSide || f.in === opposite(inSide)));
    const out = into < 0 || full ? null : flowThrough(p.pieces[into], inSide);
    if (out === null) return true;
    p.filled.push({ cell: into, in: inSide });
    p.head = { cell: into, out };
    p.nextFlowAt += flowMsAt(p.nextFlowAt);
  }
  return false;
}

class PipeFlow extends BoardsGame<Plumbing, PipeState, PipeState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 2 });
  }

  protected newBoard(seed: number) {
    return newPlumbing(seed);
  }

  protected stepBoard(p: Plumbing, _dt: number, roundMs: number) {
    return flowOn(p, roundMs);
  }

  protected boardInput(p: Plumbing, raw: unknown) {
    const input = raw as PipeInput;
    if (input.type !== 'lay' || this.phase !== 'play' || !Number.isInteger(input.cell) || input.cell < 0 || input.cell >= COLS * ROWS) return false;
    const laid = lay(p, input.cell, this.roundMs());
    // The TV hears with the next tick.
    if (laid) this.syncHost();
    return laid;
  }

  /** How far the water's got. */
  protected boardScore(p: Plumbing) {
    return p.filled.length;
  }

  private state(p: Plumbing): PipeState {
    const ms = this.roundMs();
    return {
      pieces: p.pieces,
      source: p.source,
      filled: p.filled,
      queue: Array.from({ length: QUEUE_SHOWN }, (_, k) => pieceAt(p.seed, p.next + k)),
      waterMs: Math.max(0, p.nextFlowAt - ms),
      lockedMs: Math.max(0, p.lockedUntil - ms),
    };
  }

  protected hostState(p: Plumbing) {
    return this.state(p);
  }

  protected playerState(p: Plumbing) {
    return this.state(p);
  }
}

export const pipeFlow: MiniGameDefinition = {
  info: PIPE_FLOW,
  create: (ctx, _modeId, options) => new PipeFlow(ctx, options.puzzles),
};
