import type { GameInfo, GiveUpView } from '../protocol';
import type { WordDefinition } from './wordleRace';

export const LONGEST_WORD: GameInfo = {
  id: 'longest-word',
  name: 'Longest Word',
  description: 'Take turns picking nine letters, vowel or consonant. Then everyone has 30 seconds to make the longest word they can.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '30 seconds per word.' }],
};

/** Letters picked per round. */
export const LETTER_COUNT = 9;
/** The picker has to take at least this many vowels, and at least this many consonants. */
export const MIN_VOWELS = 3;
export const MIN_CONSONANTS = 4;
export const VOWELS = 'AEIOU';

export type LetterKind = 'vowel' | 'consonant';

/** Whether the picker may take another of this kind, leaving room for the minimum of the other. */
export function canPick(letters: string[], kind: LetterKind) {
  if (letters.length >= LETTER_COUNT) return false;
  const vowels = letters.filter((l) => VOWELS.includes(l)).length;
  const consonants = letters.length - vowels;
  return kind === 'vowel' ? vowels < LETTER_COUNT - MIN_CONSONANTS : consonants < LETTER_COUNT - MIN_VOWELS;
}

/**
 * 'pick': one player picks the nine letters, vowel or consonant, one at a time.
 * 'solve': everyone makes the longest word they can from them, against the clock.
 * 'reveal': everyone's word, whether it counts, and the longest there was.
 * 'gameEnd': round scores.
 */
export type LongestPhase = 'pick' | 'solve' | 'reveal' | 'gameEnd';

/** Why a word didn't count (null if it did). */
export type WordProblem = 'not-a-word' | 'bad-letters' | null;

/** At the reveal: the longest words the letters made, and what the first one means. */
export interface LongestBest {
  length: number;
  words: string[];
  definition: (WordDefinition & { word: string }) | null;
}

export interface LongestHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  gamePoints: number;
  /** Locked in (or gave up). */
  locked: boolean;
  /** At the reveal: their word ('' for none), what was wrong with it, and the points it earned. */
  word: string | null;
  problem: WordProblem;
  points: number;
}

export interface LongestHostView {
  phase: LongestPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  /** The letters picked so far (all nine once solving starts). */
  letters: string[];
  pickerName: string;
  msLeft: number;
  /** The whole length of this phase, for the clock. */
  phaseMs: number;
  players: LongestHostPlayer[];
  best: LongestBest | null;
}

export interface LongestPlayerView extends GiveUpView {
  phase: LongestPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  letters: string[];
  /** This player is picking the letters. */
  isPicker: boolean;
  pickerName: string;
  msLeft: number;
  /** The word the server has for them (their latest draft, or what they locked in). */
  word: string;
  locked: boolean;
  /** At the reveal: what was wrong with their word. */
  problem: WordProblem;
  points: number;
  gamePoints: number;
  score: number;
  best: LongestBest | null;
}

export type LongestInput =
  /** The picker takes the next letter. */
  | { type: 'pick'; kind: LetterKind }
  /** The word as it stands; `lock` locks it in. Drafts count when time runs out. */
  | { type: 'word'; word: string; lock: boolean };
