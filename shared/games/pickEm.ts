import type { GameInfo } from '../protocol';

/** Long-list trivia: pick every right answer from a dozen options. Each bank is a mode. */
export const PICK_EM: GameInfo = {
  id: 'pick-em',
  name: "Pick 'Em",
  description: 'A long list with several right answers. Tap every one you think is right: right picks score, wrong ones cost.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'general', name: 'General Knowledge', description: 'Planets, primes, dinosaurs, capitals and more.' }],
};

/** Points for each right pick, and taken off for each wrong one (a question never scores below 0). */
export const PICK_POINTS = 100;

/**
 * 'question': the question alone, so everyone can read it.
 * 'answering': the options are up; players toggle picks and lock in.
 * 'reveal': which were right, and what everyone scored.
 */
export type PickPhase = 'question' | 'answering' | 'reveal' | 'gameEnd';

export interface PickHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  gamePoints: number;
  answered: boolean;
  /** At the reveal: right and wrong picks, and the points they came to. */
  right: number;
  wrong: number;
  points: number;
}

export interface PickHostView {
  phase: PickPhase;
  packName: string;
  questionNumber: number;
  totalQuestions: number;
  topic: string;
  question: string;
  /** Empty during 'question', so nobody gets a head start. */
  options: string[];
  correctIndices: number[] | null;
  /** At the reveal: how many players picked each option. */
  counts: number[] | null;
  msLeft: number;
  players: PickHostPlayer[];
}

export interface PickPlayerView {
  phase: PickPhase;
  questionNumber: number;
  totalQuestions: number;
  topic: string;
  question: string;
  options: string[];
  /** What this player locked in (empty until they do). */
  myPicks: number[];
  correctIndices: number[] | null;
  right: number;
  wrong: number;
  points: number;
  gamePoints: number;
  score: number;
  msLeft: number;
}

export type PickInput = { type: 'answer'; indices: number[] };
