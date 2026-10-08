// Screen lengths shared by every game, so all of them pace the same way.

/** After each puzzle (Letter Drop puzzle, Word Rush word): the answer and who got it. */
export const PUZZLE_RESULT_MS = 8_000;

/** After a game's last puzzle: the points each player earned in this round. */
export const ROUND_SCORES_MS = 8_000;

/** Between rounds of a session: running totals counting up and re-ranking. */
export const STANDINGS_MS = 8_000;
