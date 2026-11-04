import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const MINESWEEPER: GameInfo = {
  id: 'minesweeper',
  name: 'Mine Dash',
  description: 'Everyone clears the same minefield: tap to uncover, hold to flag. Numbers say how many mines touch a square. Hit a mine and you wait 10 seconds. First to clear it wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    { id: 'standard', name: 'Race', description: 'The same field for everyone; 90 seconds.' },
    { id: 'turns', name: 'Turns', description: 'One shared field on the TV. Take turns to tap it, and this time you want the mines: find one and go again, tap a safe square and the turn passes. Most mines wins. Best with two.' },
  ],
};

// A side-by-side boards game (see shared/boards.ts) with the board on the phone: the server holds
// the mines and checks every tap. Scored as a race. Everyone gets the same field, with the same
// opening already uncovered (so nobody's first tap is a gamble).

export const ROUND_MS = 90_000;
export const COLS = 9;
export const ROWS = 12;
export const MINES = 18;
/** Hitting a mine locks your board this long. */
export const MINE_LOCK_MS = 10_000;

/**
 * A square as a player sees it: HIDDEN, FLAGGED, BOOM (a mine they hit, or at the end any mine),
 * or 0–8 (uncovered, with that many mines touching it).
 */
export const HIDDEN = -1;
export const FLAGGED = -2;
export const BOOM = -3;

/** The squares touching `cell` (up to eight). */
export function neighbours(cell: number) {
  const r = Math.floor(cell / COLS);
  const c = cell % COLS;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) out.push(rr * COLS + cc);
    }
  return out;
}

// ---- Views ---------------------------------------------------------------------------------

/** One field, as the TV and its player's phone see it (no mines until they're hit, or the round's over). */
export interface MineState {
  /** Each square: HIDDEN, FLAGGED, BOOM or 0–8. */
  squares: number[];
  /** Locked after a mine until this much longer (ms). */
  lockedMs: number;
  /** Safe squares uncovered, out of how many there are. */
  uncovered: number;
  safe: number;
  booms: number;
}

export type MineHostView = BoardsHostView<MineState>;
export type MinePlayerView = BoardsPlayerView<MineState>;

export type MineInput = { type: 'reveal'; cell: number } | { type: 'flag'; cell: number };
