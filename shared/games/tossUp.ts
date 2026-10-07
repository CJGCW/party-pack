import type { GameInfo } from '../protocol';

export const TOSS_UP: GameInfo = {
  id: 'toss-up',
  name: 'Letter Drop',
  description: 'Letters appear one by one. Buzz in and solve the puzzle first!',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Play', description: '5 puzzles worth 1,000 to 3,000 points each.' }],
};

/** The puzzle board is 4 rows of 14 tiles. */
export const BOARD_ROWS = 4;
export const BOARD_COLS = 14;

/** Shown on the board in place of a letter that hasn't been revealed yet. */
export const HIDDEN = '_';

export type TossUpPhase = 'intro' | 'revealing' | 'buzzed' | 'solved' | 'unsolved' | 'gameEnd';

export interface TossUpPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  lockedOut: boolean;
}

export interface TossUpGuess {
  playerId: string;
  name: string;
  text: string;
  correct: boolean;
}

export interface TossUpHostView {
  phase: TossUpPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  value: number;
  category: string;
  /**
   * Puzzle lines (not padded to the board). Letters not yet revealed are HIDDEN;
   * spaces and punctuation are shown as-is.
   */
  lines: string[];
  /** The player currently answering, during 'buzzed'. */
  buzzerId: string | null;
  /** Milliseconds left in the current phase (e.g. time to answer). */
  msLeft: number;
  /** Most recent answer attempt, so screens can show right/wrong. */
  lastGuess: TossUpGuess | null;
  players: TossUpPlayer[];
  /** Who solved it, once solved. */
  solvedBy: string | null;
}

export interface TossUpPlayerView {
  phase: TossUpPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  value: number;
  category: string;
  lines: string[];
  msLeft: number;
  score: number;
  canBuzz: boolean;
  /** This player is the one answering. */
  answering: boolean;
  lockedOut: boolean;
  buzzerName: string | null;
  lastGuess: TossUpGuess | null;
  solvedByName: string | null;
}

export type TossUpInput = { type: 'buzz' } | { type: 'answer'; text: string };

/** Compares answers on letters only, so spacing, punctuation and "&" vs "AND" don't matter. */
export function normalizeAnswer(text: string): string {
  return text
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z]/g, '');
}

/**
 * Wraps a puzzle into board lines of at most BOARD_COLS characters, breaking
 * between words. Returns null if it doesn't fit on the board.
 */
export function layoutPuzzle(text: string): string[] | null {
  const lines: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    if (word.length > BOARD_COLS) return null;
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= BOARD_COLS) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines.length <= BOARD_ROWS ? lines : null;
}
