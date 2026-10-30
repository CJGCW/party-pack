import type { GameInfo, GiveUpView } from '../protocol';

export const RACK_ATTACK: GameInfo = {
  id: 'rack-attack',
  name: 'Rack Attack',
  description: 'Everyone gets the same board and the same seven tiles. Make the best play you can in a minute.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'One minute per board.' }],
};

/** The board is SIZE x SIZE (smaller than the classic 15, so squares are big enough to tap on a phone). */
export const SIZE = 11;
export const RACK_SIZE = 7;
/** Bonus for using every tile on the rack. */
export const BINGO_BONUS = 50;

/** Bonus squares: T triple word, D double word, t triple letter, d double letter, * centre (double word). */
const LAYOUT = [
  'T..d...d..T',
  '.D...t...D.',
  '..D.d.d.D..',
  'd..D...D..d',
  '..d.....d..',
  '.t...*...t.',
  '..d.....d..',
  'd..D...D..d',
  '..D.d.d.D..',
  '.D...t...D.',
  'T..d...d..T',
];

export type Premium = 'TW' | 'DW' | 'TL' | 'DL' | 'STAR' | null;

export function premiumAt(row: number, col: number): Premium {
  switch (LAYOUT[row]?.[col]) {
    case 'T':
      return 'TW';
    case 'D':
      return 'DW';
    case 't':
      return 'TL';
    case 'd':
      return 'DL';
    case '*':
      return 'STAR';
    default:
      return null;
  }
}

export const CENTER = Math.floor(SIZE / 2);

/** Points per letter. */
export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

/** A tile on the board: row, column and letter. */
export interface Placement {
  row: number;
  col: number;
  letter: string;
}

/** A play, scored: every word it made and the total. */
export interface ScoredMove {
  tiles: Placement[];
  words: { word: string; score: number }[];
  score: number;
}

export type MoveCheck = ({ ok: true } & ScoredMove) | { ok: false; error: string };

/**
 * 'play': everyone builds a play on their phone, until they submit or time runs out.
 * 'reveal': each player's play, the best one possible, and the points.
 * 'gameEnd': round scores.
 */
export type RackPhase = 'play' | 'reveal' | 'gameEnd';

export interface RackHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  gamePoints: number;
  submitted: boolean;
  /** At the reveal: what they played (null for a pass), and the points it earned. */
  move: ScoredMove | null;
  points: number;
}

export interface RackHostView {
  phase: RackPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  /** SIZE rows of SIZE letters; '' is an empty square. */
  board: string[][];
  rack: string[];
  msLeft: number;
  players: RackHostPlayer[];
  /** At the reveal: the best play there was. */
  best: ScoredMove | null;
}

export interface RackPlayerView extends GiveUpView {
  phase: RackPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  board: string[][];
  rack: string[];
  msLeft: number;
  /** The check of this player's latest preview, tagged with the number they sent. */
  preview: { seq: number; check: MoveCheck } | null;
  /** Their locked-in play once submitted (score 0 and no tiles for a pass). */
  submitted: ScoredMove | null;
  /** Why the last submit was refused. */
  submitError: string | null;
  points: number;
  gamePoints: number;
  score: number;
  best: ScoredMove | null;
}

export type RackInput =
  /** Check a play without locking it in (the phone shows the score or the problem). */
  | { type: 'preview'; seq: number; tiles: Placement[] }
  /** Lock in a play. No tiles is a pass. */
  | { type: 'submit'; tiles: Placement[] };
