// Shared arenas: games where everyone's in one real-time world on the TV (as opposed to a board
// each, see ./boards). The server runs the world (see server/games/arena.ts); each game adds what
// its world holds. Phones get the same view as a boards game (BoardsPlayerView), so their helpers
// (client/play/boards.ts) work for both.

import type { BoardsPhase, BoardsPlayerView, BoardsScoring } from './boards';

export type ArenaPhase = BoardsPhase;
/** 'survival' or 'best' (see BoardsScoring); a race doesn't suit a shared arena. */
export type ArenaScoring = Exclude<BoardsScoring, 'race'>;

/** One player in the arena, as the TV lists them. */
export interface ArenaEntry {
  playerId: string;
  name: string;
  color: string;
  /** When they went out (ms into the round), or null while they're still in. */
  endedAtMs: number | null;
  /** The game's score for them, for 'best' games (and shown on the TV). */
  score: number;
  place: number | null;
  points: number;
}

export interface ArenaHostView<W> {
  phase: ArenaPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  msLeft: number;
  roundMs: number;
  seed: number;
  players: ArenaEntry[];
  /** The world, as the game describes it. */
  world: W;
  gamePoints: Record<string, number>;
}

export type ArenaPlayerView<P> = BoardsPlayerView<P>;
