import type { GameInfo } from '../protocol';

/** Each question bank is a mode, so it shows up as its own slice on the wheel. */
export const TRIVIA: GameInfo = {
  id: 'trivia',
  name: 'Trivia',
  description: 'Multiple choice. Everyone answers on their phone; right and fast scores the most.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    {
      id: 'disney-pixar',
      name: 'Disney & Pixar',
      description: 'Characters, stories and voice actors from Disney and Pixar animated films.',
    },
  ],
};

export const ANSWER_COUNT = 4;

/**
 * Shapes for answers A-D, matched on the TV and phones. The tiles themselves use
 * the game's usual purple panel colour; the right answers turn green at the reveal.
 */
export const ANSWER_STYLES = [{ shape: '▲' }, { shape: '◆' }, { shape: '●' }, { shape: '■' }];

/**
 * 'question': the question alone, so everyone can read it.
 * 'answering': the four answers are up and phones can pick one.
 * 'reveal': the right answer and who got it.
 */
export type TriviaPhase = 'question' | 'answering' | 'reveal' | 'gameEnd';

export interface TriviaHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  gamePoints: number;
  /** Has locked in an answer to the current question. */
  answered: boolean;
  /** At the reveal: did they score anything, and what did it earn. */
  correct: boolean | null;
  questionPoints: number;
}

export interface TriviaHostView {
  phase: TriviaPhase;
  packName: string;
  questionNumber: number;
  totalQuestions: number;
  /** The film the question is about, shown like a category. */
  film: string;
  question: string;
  /** Empty during 'question', so nobody gets a head start. */
  answers: string[];
  /** Select-all-that-apply: any number of the answers may be right. */
  multi: boolean;
  /** Only at the reveal: every right answer. */
  correctIndices: number[] | null;
  /** At the reveal: how many players picked each answer. */
  counts: number[] | null;
  msLeft: number;
  players: TriviaHostPlayer[];
}

export interface TriviaPlayerView {
  phase: TriviaPhase;
  questionNumber: number;
  totalQuestions: number;
  film: string;
  question: string;
  answers: string[];
  multi: boolean;
  /** What this player locked in (empty until they do). */
  myAnswers: number[];
  correctIndices: number[] | null;
  questionPoints: number;
  gamePoints: number;
  score: number;
  msLeft: number;
}

/** The chosen answers: exactly one for a normal question, one or more for select-all. */
export type TriviaInput = { type: 'answer'; indices: number[] };
