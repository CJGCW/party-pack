// Side-by-side boards: games where each player has their own real-time board (all built from the
// same seed, so everyone faces the same thing), shown side by side on the TV. The server runs
// every board (see server/games/boards.ts); each game adds what its boards hold.

import { FINISH_SHARE, PUZZLE_POINTS, puzzlePoints, racePoints } from './scoring';

/**
 * 'ready': a countdown, with everyone's board set up.
 * 'play': the round.
 * 'result': how everyone did, and the points.
 * 'gameEnd': round scores.
 */
export type BoardsPhase = 'ready' | 'play' | 'result' | 'gameEnd';

/**
 * How a round is scored:
 * 'survival': still going at the end scores the full 1,000; ending earlier scores up to 700 by how
 * long you lasted, so the last one standing beats everyone who went before them.
 * 'best': each player's board score as a share of the best that round (the best gets 1,000).
 * 'race': a run ends when it's finished; finishing scores 300 plus up to 700 for time left, and
 * anyone who doesn't finish scores up to 300 for how far they got.
 */
export type BoardsScoring = 'survival' | 'best' | 'race';

/** Going out early in a survival round still scores: up to this share, by how long you lasted. */
export const OUT_SHARE = 0.7;

export function survivalPoints(endedAtMs: number | null, roundMs: number) {
  return endedAtMs === null ? PUZZLE_POINTS : puzzlePoints((OUT_SHARE * endedAtMs) / roundMs);
}

export function bestPoints(score: number, best: number) {
  return best > 0 ? puzzlePoints(score / best) : 0;
}

/** `progress` is 0 to 1, for a run that didn't finish. */
export function finishPoints(finishedAtMs: number | null, roundMs: number, progress: number) {
  return finishedAtMs !== null ? racePoints(roundMs - finishedAtMs, roundMs, 0, 0) : puzzlePoints(FINISH_SHARE * progress);
}

/** One player's board on the TV: who it is, how it's going, and the game's own state (`S`). */
export interface BoardView<S> {
  playerId: string;
  name: string;
  color: string;
  /** When their run ended (ms into the round): crashed, out, or (racing) finished. Null while it's still going. */
  endedAtMs: number | null;
  /** The game's score for the board, for 'best' games (height, distance…). */
  boardScore: number;
  /** At the result: their place (1 for the best) and points. */
  place: number | null;
  points: number;
  state: S;
}

/** `R` is anything the whole round shares (e.g. Spiral Shot's track). */
export interface BoardsHostView<S, R = null> {
  phase: BoardsPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  msLeft: number;
  /** ms into the round (0 until it starts). */
  roundMs: number;
  /** The round's seed: every board is built from it, so the TV can draw what's shared. */
  seed: number;
  boards: BoardView<S>[];
  /** Round scores, for the 'gameEnd' screen. */
  gamePoints: Record<string, number>;
  round: R;
}

export interface BoardsPlayerView<P> {
  phase: BoardsPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  msLeft: number;
  roundMs: number;
  seed: number;
  /** False if they joined after the round started (they get a board next round). */
  hasBoard: boolean;
  endedAtMs: number | null;
  boardScore: number;
  /** How many are still going, out of how many. */
  going: number;
  playing: number;
  place: number | null;
  points: number;
  gamePoints: number;
  score: number;
  /** The game's own fields for the phone (null without a board). */
  state: P | null;
}
