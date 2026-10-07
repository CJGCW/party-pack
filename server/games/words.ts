import allWords from 'an-array-of-english-words';
import { WORD_LENGTH } from '../../shared/games/wordleRace';

/**
 * Every 5-letter English word (~12,600). Used both to validate guesses and as the
 * pool of secret answers, so any real word can come up.
 */
const WORDS = allWords.filter((w) => w.length === WORD_LENGTH && /^[a-z]+$/.test(w)).map((w) => w.toUpperCase());
const WORD_SET = new Set(WORDS);

export function isValidGuess(word: string): boolean {
  return WORD_SET.has(word);
}

/** Picks `count` distinct random answers. */
export function pickAnswers(count: number): string[] {
  const picked = new Set<string>();
  while (picked.size < count) picked.add(WORDS[Math.floor(Math.random() * WORDS.length)]);
  return [...picked];
}
