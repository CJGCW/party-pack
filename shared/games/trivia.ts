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
    { id: 'scrubs', name: 'Scrubs', description: 'Sacred Heart Hospital, seasons 1 to 8.' },
    { id: 'brooklyn-99', name: 'Brooklyn Nine-Nine', description: 'The detectives of the 99th Precinct.' },
    { id: 'parks-and-rec', name: 'Parks and Recreation', description: 'The Pawnee Parks Department.' },
  ],
};

/** Co-op trivia: the party fights monsters together, with the same question banks as modes. */
export const TRIVIA_QUEST: GameInfo = {
  id: 'trivia-quest',
  name: 'Trivia Quest',
  description: 'Co-op! Right answers hit the monster; wrong ones cost you a heart. Beat every monster before the whole party falls.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: TRIVIA.modes,
};

/** Hearts each player starts a quest with. */
export const MAX_HEARTS = 3;

/**
 * What one answer did in a quest: a hit on the monster (all right), a glancing blow
 * (partly right on select-all: no hit, no harm), hurt (wrong or no answer: lose a
 * heart), revived (a ghost answered right and is back with one heart) or ghost
 * (a ghost answered wrong, which costs nothing).
 */
export type QuestResult = 'hit' | 'glance' | 'hurt' | 'revived' | 'ghost';

export interface QuestMonster {
  name: string;
  emoji: string;
  /** Hits still needed, and the total. */
  hp: number;
  maxHp: number;
  /** Which monster this is (from 1), of how many. */
  number: number;
  total: number;
  boss: boolean;
}

export interface QuestState {
  monster: QuestMonster;
  /** Set when the quest is over. */
  outcome: 'victory' | 'defeat' | null;
  /** At the reveal: this question finished the monster off. */
  defeatedNow: boolean;
  /** Hits the party landed this question (at the reveal). */
  hitsNow: number;
}

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
  /** Trivia Quest only: hearts left (0 is a ghost), and what their answer did at the reveal. */
  hearts?: number;
  questResult?: QuestResult | null;
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
  /** Trivia Quest only. */
  quest?: QuestState;
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
  /** Trivia Quest only. */
  quest?: QuestState;
  hearts?: number;
  questResult?: QuestResult | null;
}

/** The chosen answers: exactly one for a normal question, one or more for select-all. */
export type TriviaInput = { type: 'answer'; indices: number[] };
