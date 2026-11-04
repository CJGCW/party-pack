import type { GameInfo } from '../protocol';
import type { VolleyHostView, VolleyPlayerView } from '../volleys';

export const BALL_COUNT: GameInfo = {
  id: 'ball-count',
  name: 'Ball Count',
  description: 'There are balls rolling about inside your phone. Tilt it and feel them knock against the sides (a buzz for each bump), then guess how many there are. Three boxes a round; the closest guesses win.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Three boxes a round; closest guesses win.' }],
};

// A volleys game (see shared/volleys.ts): each volley's a box with some balls in (the same for
// everyone, from the seed). The phone rolls them about itself (from its tilt) and buzzes for each
// knock; the guess is the aim. The reveal opens the box on the TV.

export const BOXES = 3;
export const FEEL_MS = 25_000;
export const REVEAL_MS = 4_500;
export const MIN_BALLS = 3;
export const MAX_BALLS = 14;

export const ballsFor = (seed: number, box: number) => {
  let s = (seed + box * 104_729) >>> 0 || 1;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  return MIN_BALLS + Math.floor((s / 2 ** 32) * (MAX_BALLS - MIN_BALLS + 1));
};

/** A guess's points: 100 spot on, less for every ball off (in proportion), never below 0. */
export const guessPoints = (guess: number, actual: number) => Math.max(0, Math.round(100 * (1 - Math.abs(guess - actual) / actual)));

export interface CountAim {
  guess: number | null;
}

export interface CountBoardState {
  guessed: boolean;
  /** At the reveal: the guess, and the answer. */
  guess: number | null;
  actual: number | null;
}

export interface CountPlayerState {
  /** The balls in this box (the phone needs them to roll them about). */
  balls: number;
  box: number;
  guess: number | null;
  actual: number | null;
}

export type CountHostView = VolleyHostView<CountBoardState>;
export type CountPlayerView = VolleyPlayerView<CountPlayerState>;

export type CountInput = { type: 'fire'; guess: number };
