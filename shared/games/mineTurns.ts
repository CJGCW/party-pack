// Mine Dash's Turns mode: one shared field on the TV, and turns to tap it. The aim's to find the
// mines: a mine's yours and you go again; a safe square hands the turn on. Its views carry
// `asGame: TURNS_UI` so the TV and phones use its own screens. The field's made as in Mine Dash
// (shared/games/minesweeper.ts), with more mines.

export const TURNS_UI = 'mine-turns';
/** Odd, so that two players can't tie by finding them all. */
export const TURN_MINES = 21;
/** A turn: tap something by then or it passes. */
export const TURN_MS = 15_000;
/** The most a round can last. */
export const TURNS_ROUND_MS = 240_000;

export type TurnsPhase = 'play' | 'result' | 'gameEnd';

export interface TurnsPlayer {
  id: string;
  name: string;
  color: string;
  /** Mines found this round. */
  found: number;
  points: number;
  gamePoints: number;
}

export interface TurnsView {
  asGame: typeof TURNS_UI;
  phase: TurnsPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  /** Each square: HIDDEN, BOOM (a mine that's found, or any mine once the round's over) or 0–8. */
  squares: number[];
  /** Who found each found mine. */
  mines: { cell: number; by: string }[];
  /** Mines not found yet. */
  left: number;
  players: TurnsPlayer[];
  /** Whose turn it is, and how long they've got. */
  turn: string | null;
  turnMs: number;
  /** The last square tapped. */
  last: number | null;
  /** What the last tap did, counting up so a repeat still shows. */
  taps: number;
  lastHit: boolean;
  msLeft: number;
  you?: string;
}

export type TurnsInput = { type: 'reveal'; cell: number };
