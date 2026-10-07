import type { GameInfo } from '../protocol';

export const WORDLE_RACE: GameInfo = {
  id: 'wordle-race',
  name: 'Word Rush',
  description: 'Everyone gets the same secret word. First to crack it wins the most points!',
  minPlayers: 1,
  maxPlayers: 8,
};

export const WORD_LENGTH = 5;

export type LetterResult = 'correct' | 'present' | 'absent';

export type WordlePhase = 'countdown' | 'playing' | 'roundEnd' | 'gameEnd';

export interface WordleHostPlayer {
  id: string;
  name: string;
  color: string;
  /** Only colours are shown on the big screen, never letters. One row per guess, oldest first. */
  rows: LetterResult[][];
  solved: boolean;
  finishRank: number | null;
  roundPoints: number;
  score: number;
}

export interface WordleHostView {
  phase: WordlePhase;
  round: number;
  totalRounds: number;
  /** Milliseconds until the current phase ends (relative, so clock skew doesn't matter). */
  msLeft: number;
  players: WordleHostPlayer[];
  answer: string | null;
}

export interface WordleGuess {
  word: string;
  result: LetterResult[];
}

export interface WordlePlayerView {
  phase: WordlePhase;
  round: number;
  totalRounds: number;
  msLeft: number;
  guesses: WordleGuess[];
  solved: boolean;
  finishRank: number | null;
  roundPoints: number;
  score: number;
  answer: string | null;
  /** Set when the last guess was rejected (e.g. not a word). */
  error: string | null;
}

export type WordleInput = { type: 'guess'; word: string };

/** Standard Wordle scoring, including correct handling of repeated letters. */
export function scoreGuess(guess: string, answer: string): LetterResult[] {
  const result: LetterResult[] = Array(guess.length).fill('absent');
  const remaining = new Map<string, number>();

  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) {
      result[i] = 'correct';
    } else {
      remaining.set(answer[i], (remaining.get(answer[i]) ?? 0) + 1);
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] === 'correct') continue;
    const left = remaining.get(guess[i]) ?? 0;
    if (left > 0) {
      result[i] = 'present';
      remaining.set(guess[i], left - 1);
    }
  }
  return result;
}
