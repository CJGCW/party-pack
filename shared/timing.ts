// Screen lengths shared by every game, so all of them pace the same way.

/** After each puzzle (Letter Drop puzzle, Word Rush word): the answer and who got it. */
export const PUZZLE_RESULT_MS = 4_000;

/** After a game's last puzzle: the points each player earned in this round.
 * Skipped when a round has only one puzzle, since the puzzle result already shows it. */
export const ROUND_SCORES_MS = 4_000;

/** Between rounds of a session: running totals counting up and re-ranking. */
export const STANDINGS_MS = 4_000;
