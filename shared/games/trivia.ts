import type { GameInfo, GiveUpView } from '../protocol';

/** Each question bank is a mode: a topic the VIP can choose under the Trivia slice on the wheel. */
export const TRIVIA: GameInfo = {
  id: 'trivia',
  name: 'Trivia',
  description: 'Multiple choice. Everyone answers on their phone; right and fast scores the most.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    { id: 'general', name: 'General Knowledge', description: 'Geography, science, history, nature, sport and more.' },
    {
      id: 'disney-pixar',
      name: 'Disney & Pixar',
      description: 'Characters, stories and voice actors from Disney and Pixar animated films.',
    },
    { id: 'scrubs', name: 'Scrubs', description: 'Sacred Heart Hospital, seasons 1 to 8.' },
    { id: 'brooklyn-99', name: 'Brooklyn Nine-Nine', description: 'The detectives of the 99th Precinct.' },
    { id: 'parks-and-rec', name: 'Parks and Recreation', description: 'The Pawnee Parks Department.' },
  ],
};

/**
 * Co-op trivia, with the same question banks as modes. The team works through stages:
 * each needs a number of correct answers between them. Wrong answers cost lives.
 * (The id is from its first name, Trivia Quest.)
 */
export const TRIVIA_QUEST: GameInfo = {
  id: 'trivia-quest',
  name: 'Team Trivia',
  description: 'Co-op. Correct answers clear stages for the whole team; wrong ones cost a life. Clear every stage before everyone is out.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: TRIVIA.modes,
};

/** Lives each player starts Team Trivia with. */
export const MAX_LIVES = 3;

/**
 * What one answer did in Team Trivia: correct (counts toward the stage), partial
 * (partly right on select-all: doesn't count, costs nothing), wrong (wrong or no
 * answer: lose a life), back (an out player answered right and is back in with one
 * life) or out (an out player answered wrong, which costs nothing more).
 */
export type TeamResult = 'correct' | 'partial' | 'wrong' | 'back' | 'out';

export interface TeamStage {
  /** Which stage (from 1), of how many. */
  number: number;
  total: number;
  /** Correct answers the stage needs, and how many the team has so far. */
  needed: number;
  correct: number;
  /** The last stage, which needs more. */
  final: boolean;
}

export interface TeamState {
  stage: TeamStage;
  /** Set when the challenge is over. */
  outcome: 'complete' | 'failed' | null;
  /** At the reveal: this question cleared the stage. */
  clearedNow: boolean;
  /** Correct answers the team got on this question (at the reveal). */
  correctNow: number;
}

export const ANSWER_COUNT = 4;

/** Labels for the four answers, matched on the TV and phones. */
export const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

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
  /** Team Trivia only: lives left (0 is out), and what their answer did at the reveal. */
  lives?: number;
  teamResult?: TeamResult | null;
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
  /** Team Trivia only. */
  team?: TeamState;
}

export interface TriviaPlayerView extends GiveUpView {
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
  /** Team Trivia only. */
  team?: TeamState;
  lives?: number;
  teamResult?: TeamResult | null;
}

/** The chosen answers: exactly one for a normal question, one or more for select-all. */
export type TriviaInput = { type: 'answer'; indices: number[] };
