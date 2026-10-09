import allWords from 'an-array-of-english-words';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import wordnet from 'wordnet-db';
import { SIZE } from '../../../shared/games/rackAttack';
import { isOffensive } from '../words';

/** Every word that fits on the board (2 to SIZE letters), uppercase. Any of these is a legal play. */
const WORDS = allWords.filter((w) => w.length >= 2 && w.length <= SIZE && /^[a-z]+$/.test(w)).map((w) => w.toUpperCase());
const WORD_SET = new Set(WORDS);

export function isWord(word: string): boolean {
  return WORD_SET.has(word);
}

/**
 * Words familiar enough to put on a generated board: WordNet base forms in common use
 * (any part of speech) and their plurals, three letters or more, minus anything offensive. Players can still play any
 * word in the dictionary; this only keeps the starting boards readable.
 */
const LEMMAS = new Set<string>();
for (const pos of ['noun', 'verb', 'adj', 'adv']) {
  for (const line of readFileSync(join(wordnet.path, `index.${pos}`), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue; // license header
    // lemma pos synset_cnt p_cnt [ptr_symbol x p_cnt] sense_cnt tagsense_cnt ...
    const parts = line.trim().split(' ');
    const lemma = parts[0];
    // Only words WordNet saw used in its sample texts (tagsense_cnt > 0): skips the obscure ones.
    const tagsenseCount = Number(parts[5 + Number(parts[3])]);
    if (/^[a-z]+$/.test(lemma) && tagsenseCount > 0) LEMMAS.add(lemma.toUpperCase());
  }
}

export function isBoardWord(word: string): boolean {
  if (word.length < 3 || isOffensive(word.toLowerCase())) return false;
  return LEMMAS.has(word) || (word.endsWith('S') && LEMMAS.has(word.slice(0, -1)));
}

// ---- Letter tree for finding plays ----------------------------------------------
// A trie stored in flat arrays (first child, next sibling, letter, end-of-word),
// which keeps ~200k words in a few megabytes.

let capacity = 1 << 20;
let first = new Int32Array(capacity).fill(-1);
let next = new Int32Array(capacity).fill(-1);
let letter = new Uint8Array(capacity);
let end = new Uint8Array(capacity);
let nodes = 1; // node 0 is the root

function grow() {
  const resize = <T extends Int32Array | Uint8Array>(a: T, fill?: number): T => {
    const b = new (a.constructor as new (n: number) => T)(capacity * 2);
    if (fill !== undefined) b.fill(fill);
    b.set(a);
    return b;
  };
  first = resize(first, -1);
  next = resize(next, -1);
  letter = resize(letter);
  end = resize(end);
  capacity *= 2;
}

/** The child of `node` for letter code `c` (0-25), or -1. */
export function child(node: number, c: number): number {
  for (let n = first[node]; n !== -1; n = next[n]) if (letter[n] === c) return n;
  return -1;
}

export function isEnd(node: number): boolean {
  return end[node] === 1;
}

/** Calls fn for each child of `node` with its letter code. */
export function eachChild(node: number, fn: (c: number, child: number) => void) {
  for (let n = first[node]; n !== -1; n = next[n]) fn(letter[n], n);
}

for (const word of WORDS) {
  let node = 0;
  for (let i = 0; i < word.length; i++) {
    const c = word.charCodeAt(i) - 65;
    let n = child(node, c);
    if (n === -1) {
      if (nodes >= capacity) grow();
      n = nodes++;
      letter[n] = c;
      next[n] = first[node];
      first[node] = n;
    }
    node = n;
  }
  end[node] = 1;
}

export const ROOT = 0;
