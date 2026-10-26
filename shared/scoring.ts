// One scale for every game, so no game outweighs another on the wheel. Each puzzle (a question,
// word, list, board, stage…) is worth up to PUZZLE_POINTS to the best player, and an ordinary
// good result lands around half of that.

export const PUZZLE_POINTS = 1000;

/** A share (0 to 1) of a puzzle's points, rounded to the nearest 10. */
export function puzzlePoints(share: number) {
  return Math.round((Math.max(0, Math.min(1, share)) * PUZZLE_POINTS) / 10) * 10;
}

/** In a race, finishing at all earns this share; the rest goes by time left, less a cost per guess. */
export const FINISH_SHARE = 0.3;

/**
 * Points for finishing a race (Word Rush, Concentration): 300 for finishing, plus up to 700 for
 * the time left on the clock, minus `guessCostMs` of it for every guess.
 */
export function racePoints(msLeft: number, roundMs: number, guesses: number, guessCostMs: number) {
  const speed = Math.max(0, msLeft - guesses * guessCostMs) / roundMs;
  return puzzlePoints(FINISH_SHARE + (1 - FINISH_SHARE) * speed);
}
