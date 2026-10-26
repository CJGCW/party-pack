import type { GameInfo } from '../protocol';

/**
 * Cards per side of the board: GRID_SIZE x GRID_SIZE. Change this to resize every board
 * (2 to 10). With an odd size the centre square is left empty, so the cards pair up.
 */
export const GRID_SIZE = 4;

export const CONCENTRATION: GameInfo = {
  id: 'concentration',
  name: 'Concentration',
  description: 'Everyone gets the same face-down cards. Race to find every pair; every guess costs points.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: `A ${GRID_SIZE} by ${GRID_SIZE} board of playing cards.` }],
};

export type ConcentrationPhase = 'countdown' | 'playing' | 'roundEnd' | 'gameEnd';

/**
 * One square of a player's board. `card` (an id from shared/cards, e.g. "QH") is only sent
 * while it's face up: open, matched, or at the end of the round.
 */
export interface ConcentrationCell {
  state: 'down' | 'open' | 'matched' | 'blank';
  card: string | null;
}

/** A pair that didn't match: shown face up briefly, then turned back over. */
export interface ConcentrationMiss {
  seq: number;
  cells: [number, number];
  cards: [string, string];
}

interface ViewBase {
  phase: ConcentrationPhase;
  size: number;
  round: number;
  totalRounds: number;
  msLeft: number;
  /** Seconds of points each guess (a pair of flips) costs. */
  guessCostSeconds: number;
  totalPairs: number;
}

export interface ConcentrationHostPlayer {
  id: string;
  name: string;
  color: string;
  /** Which squares they've matched (the TV never shows the cards themselves). */
  matched: boolean[];
  pairsFound: number;
  guesses: number;
  finishRank: number | null;
  roundPoints: number;
  gamePoints: number;
  score: number;
}

export interface ConcentrationHostView extends ViewBase {
  /** The empty centre square on odd-sized boards, or null. */
  blank: number | null;
  players: ConcentrationHostPlayer[];
}

export interface ConcentrationPlayerView extends ViewBase {
  cells: ConcentrationCell[];
  lastMiss: ConcentrationMiss | null;
  pairsFound: number;
  guesses: number;
  finishRank: number | null;
  roundPoints: number;
  gamePoints: number;
  score: number;
}

export type ConcentrationInput = { type: 'flip'; index: number };
