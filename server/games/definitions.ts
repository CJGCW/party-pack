import { closeSync, openSync, readFileSync, readSync } from 'node:fs';
import { join } from 'node:path';
import wordnet from 'wordnet-db';
import type { WordDefinition } from '../../shared/games/wordleRace';

// Offline definitions from WordNet (Princeton's lexical database), so the game
// still works on a LAN without internet. WordNet covers roughly half of the
// 5-letter dictionary; very obscure words simply have no definition.

type Pos = 'noun' | 'verb' | 'adj' | 'adv';
const POS_LIST: Pos[] = ['noun', 'verb', 'adj', 'adv'];
const POS_LABEL: Record<Pos, string> = { noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb' };

/** Only short lemmas matter: every answer is 5 letters, and its base form is no longer. */
const MAX_LEMMA_LENGTH = 5;

interface IndexEntry {
  /** How often this word is used in this part of speech (WordNet "tagsense_cnt"). */
  frequency: number;
  /** Byte offset of the most common sense in the data file. */
  offset: number;
}

/** lemma -> part of speech -> most common sense. */
const index = new Map<string, Partial<Record<Pos, IndexEntry>>>();

for (const pos of POS_LIST) {
  for (const line of readFileSync(join(wordnet.path, `index.${pos}`), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue; // license header
    const parts = line.trim().split(' ');
    const lemma = parts[0];
    if (lemma.length > MAX_LEMMA_LENGTH || !/^[a-z]+$/.test(lemma)) continue;
    // lemma pos synset_cnt p_cnt [ptr_symbol x p_cnt] sense_cnt tagsense_cnt offset...
    const pointerCount = Number(parts[3]);
    const tagsenseCount = Number(parts[5 + pointerCount]);
    const firstOffset = Number(parts[6 + pointerCount]);
    const entry = index.get(lemma) ?? {};
    entry[pos] = { frequency: tagsenseCount, offset: firstOffset };
    index.set(lemma, entry);
  }
}

/** Reads one synset line from a WordNet data file at a byte offset and returns its gloss. */
function readGloss(pos: Pos, offset: number): string {
  const fd = openSync(join(wordnet.path, `data.${pos}`), 'r');
  try {
    const buf = Buffer.alloc(4096);
    const bytes = readSync(fd, buf, 0, buf.length, offset);
    const line = buf.toString('utf8', 0, bytes).split('\n')[0];
    const gloss = line.split(' | ')[1] ?? '';
    // A gloss is "definition; more definition; "example sentence"". Keep only the definition.
    return gloss.split(/;\s*"/)[0].trim();
  } finally {
    closeSync(fd);
  }
}

/** Possible base forms of an inflected word, e.g. FAYED -> fay (verb), PONIES -> pony. */
function baseForms(word: string): { lemma: string; pos: Pos[] }[] {
  const forms: { lemma: string; pos: Pos[] }[] = [];
  const add = (suffix: string, replacement: string, pos: Pos[]) => {
    if (word.endsWith(suffix) && word.length > suffix.length + 1) {
      forms.push({ lemma: word.slice(0, -suffix.length) + replacement, pos });
    }
  };
  add('ies', 'y', ['noun', 'verb']);
  add('es', '', ['noun', 'verb']);
  add('s', '', ['noun', 'verb']);
  add('ied', 'y', ['verb']);
  add('ed', '', ['verb']);
  add('ed', 'e', ['verb']);
  // Only NICE -> NICER style comparatives: a general "-er" rule mislabels words
  // like FARER (a traveller) as "more far". A wrong definition is worse than none.
  add('er', 'e', ['adj']);
  return forms;
}

/** The most commonly used sense among the given parts of speech, if any. */
function bestSense(lemma: string, allowed: Pos[]) {
  const entry = index.get(lemma);
  if (!entry) return null;
  let best: { pos: Pos; sense: IndexEntry } | null = null;
  for (const pos of allowed) {
    const sense = entry[pos];
    // POS_LIST order (noun first) breaks ties.
    if (sense && (!best || sense.frequency > best.sense.frequency)) best = { pos, sense };
  }
  return best;
}

export function define(word: string): WordDefinition | null {
  const lower = word.toLowerCase();

  // Weigh the word itself against its possible base forms and keep the most used
  // meaning: NEEDS is a rare adverb in WordNet, but far more often the plural of NEED.
  // The word itself comes first, so it wins ties.
  const candidates = [{ lemma: lower, pos: POS_LIST }, ...baseForms(lower)];
  let best: { lemma: string; pos: Pos; sense: IndexEntry } | null = null;
  for (const { lemma, pos } of candidates) {
    const found = bestSense(lemma, pos);
    if (found && (!best || found.sense.frequency > best.sense.frequency)) best = { lemma, ...found };
  }
  if (!best) return null;

  return {
    partOfSpeech: POS_LABEL[best.pos],
    text: readGloss(best.pos, best.sense.offset),
    baseWord: best.lemma === lower ? null : best.lemma.toUpperCase(),
  };
}
