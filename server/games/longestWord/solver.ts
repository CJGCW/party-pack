import allWords from 'an-array-of-english-words';
import { LETTER_COUNT, type LongestBest, type WordProblem } from '../../../shared/games/longestWord';
import { define, hasDefinition } from '../definitions';
import { isOffensive } from '../words';

/** Every word that nine letters could make (2 to 9 letters), uppercase, longest first. */
const WORDS = allWords
  .filter((w) => w.length >= 2 && w.length <= LETTER_COUNT && /^[a-z]+$/.test(w))
  .map((w) => w.toUpperCase())
  .sort((a, b) => b.length - a.length);
const WORD_SET = new Set(WORDS);

function counts(letters: Iterable<string>) {
  const c = new Map<string, number>();
  for (const l of letters) c.set(l, (c.get(l) ?? 0) + 1);
  return c;
}

/** Whether `word` uses only the letters given, each no more times than it's there. */
export function fits(word: string, letters: string[]) {
  const have = counts(letters);
  for (const [l, n] of counts(word)) if ((have.get(l) ?? 0) < n) return false;
  return true;
}

export function checkWord(word: string, letters: string[]): WordProblem {
  if (!fits(word, letters)) return 'bad-letters';
  return WORD_SET.has(word) ? null : 'not-a-word';
}

/**
 * The longest words the letters make. Scoring goes by the length; the words shown are the
 * familiar ones first (those with a definition), never anything offensive.
 */
export function longestWords(letters: string[]): LongestBest {
  let length = 0;
  const found: string[] = [];
  for (const w of WORDS) {
    if (w.length < length) break;
    if (fits(w, letters)) {
      length = w.length;
      found.push(w);
    }
  }
  const shown = found.filter((w) => !isOffensive(w.toLowerCase()));
  const words = [...shown.filter((w) => hasDefinition(w)), ...shown.filter((w) => !hasDefinition(w))].slice(0, 3);
  const meaning = words[0] ? define(words[0]) : null;
  return { length, words, definition: meaning && { word: words[0], ...meaning } };
}
