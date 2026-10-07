import allWords from 'an-array-of-english-words';
import naughtyWords from 'naughty-words';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import { WORD_LENGTH } from '../../shared/games/wordleRace';

/** Every 5-letter English word (~12,600), used to validate guesses. */
const DICTIONARY = allWords.filter((w) => w.length === WORD_LENGTH && /^[a-z]+$/.test(w));
const WORD_SET = new Set(DICTIONARY.map((w) => w.toUpperCase()));

// ---- Offensive word filter -------------------------------------------------
// Secret words are revealed in big letters on the TV, so slurs and obscenities are
// kept out of the answer pool. Two maintained lists are combined because each
// misses words the other catches. (Players can still *guess* any real word.)

/** Words either list flags by mistake. These are fine as answers. */
const ALLOWED = new Set(['annal', 'assez', 'assot', 'cumec', 'cumin', 'fagin', 'fanal', 'rappe', 'scatt']);

/** Words neither list catches. Add anything inappropriate that comes up here. */
const EXTRA_BLOCKED = new Set<string>([]);

const obscenity = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/** The "naughty words" list holds base forms; also block simple plurals and past tenses. */
const naughtyForms = new Set(
  naughtyWords.en
    .map((w) => w.toLowerCase())
    .filter((w) => /^[a-z]+$/.test(w))
    .flatMap((w) => [w, `${w}s`, `${w}es`, `${w}ed`]),
);

function isOffensive(word: string): boolean {
  if (ALLOWED.has(word)) return false;
  return EXTRA_BLOCKED.has(word) || naughtyForms.has(word) || obscenity.hasMatch(word);
}

/** Every 5-letter word that is safe to reveal as a secret answer. */
const ANSWERS = DICTIONARY.filter((w) => !isOffensive(w)).map((w) => w.toUpperCase());

export function isValidGuess(word: string): boolean {
  return WORD_SET.has(word);
}

/** Picks `count` distinct random answers. */
export function pickAnswers(count: number): string[] {
  const picked = new Set<string>();
  while (picked.size < count) picked.add(ANSWERS[Math.floor(Math.random() * ANSWERS.length)]);
  return [...picked];
}
