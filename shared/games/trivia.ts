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

/** Colours and shapes for answers A-D, matched on the TV and phones. */
export const ANSWER_STYLES = [
  { color: '#e5484d', shape: '▲' },
  { color: '#3e7bfa', shape: '◆' },
  { color: '#e0a526', shape: '●' },
  { color: '#30a46c', shape: '■' },
];

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
  /** At the reveal: did they get it right, and what did it earn. */
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
  /** Only at the reveal. */
  correctIndex: number | null;
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
  myAnswer: number | null;
  correctIndex: number | null;
  questionPoints: number;
  gamePoints: number;
  score: number;
  msLeft: number;
}

export type TriviaInput = { type: 'answer'; index: number };
