import type { GameInfo } from '../protocol';

/** Long-list trivia: pick, or type, every right answer. Each bank is a mode. */
export const PICK_EM: GameInfo = {
  id: 'pick-em',
  name: "Pick 'Em",
  description: 'Lists with lots of right answers: tap every one you think is right, or type as many as you can name.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'general', name: 'General Knowledge', description: 'Planets, primes, dinosaurs, capitals and more.' }],
};

/**
 * Points per right answer. For tap lists the same is taken off for each wrong pick
 * (a list never scores below 0); for typed lists wrong guesses cost nothing.
 */
export const PICK_POINTS = 100;

/**
 * 'choice': tap every right answer from a list of options, then lock in.
 * 'typed': type as many right answers as you can name.
 */
export type PickKind = 'choice' | 'typed';

/**
 * 'question': the question alone, so everyone can read it.
 * 'answering': players pick (or type) answers.
 * 'reveal': the right answers, and what everyone scored.
 */
export type PickPhase = 'question' | 'answering' | 'reveal' | 'gameEnd';

export interface PickHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  gamePoints: number;
  /** Locked in (tap lists) or said they're done (typed lists). */
  answered: boolean;
  /** Typed lists: how many they've found so far (shown as a count only, never which). */
  found: number;
  /** At the reveal: right and wrong picks, and the points they came to. */
  right: number;
  wrong: number;
  points: number;
}

export interface PickHostView {
  phase: PickPhase;
  kind: PickKind;
  packName: string;
  questionNumber: number;
  totalQuestions: number;
  topic: string;
  question: string;
  /** Tap lists: the options (empty during 'question', so nobody gets a head start). */
  options: string[];
  correctIndices: number[] | null;
  /** At the reveal: how many players picked each option. */
  counts: number[] | null;
  /** Typed lists: how many answers there are, and at the reveal what they were and who found each. */
  slots: number;
  answers: string[] | null;
  foundBy: string[][] | null;
  msLeft: number;
  players: PickHostPlayer[];
}

/** The result of a typed guess, tagged with the number the phone sent it with. */
export interface PickGuessResult {
  seq: number;
  text: string;
  result: 'right' | 'wrong' | 'repeat';
  /** The answer it matched (for right and repeat). */
  answer: string | null;
}

export interface PickPlayerView {
  phase: PickPhase;
  kind: PickKind;
  questionNumber: number;
  totalQuestions: number;
  topic: string;
  question: string;
  options: string[];
  /** Tap lists: what this player locked in (empty until they do). */
  myPicks: number[];
  correctIndices: number[] | null;
  /** Typed lists: how many answers there are, the ones this player has found, and their last guess. */
  slots: number;
  found: string[];
  lastGuess: PickGuessResult | null;
  done: boolean;
  /** At the reveal (typed lists): every answer. */
  answers: string[] | null;
  right: number;
  wrong: number;
  points: number;
  gamePoints: number;
  score: number;
  msLeft: number;
}

export type PickInput =
  /** Tap lists: lock in these options. */
  | { type: 'answer'; indices: number[] }
  /** Typed lists: one guess. */
  | { type: 'guess'; seq: number; text: string }
  /** Typed lists: finished early. */
  | { type: 'done' };
