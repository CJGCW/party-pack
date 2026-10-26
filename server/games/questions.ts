import { readFileSync } from 'node:fs';

// Question files, shared by Trivia (./trivia) and Pick 'Em (./pickem).
//
// Each file is one bank (one mode). Questions are blocks like:
//
//   FILM: The Lion King
//
//   Q: Who voices adult Simba?
//   A: Matthew Broderick
//   W: Jonathan Taylor Thomas
//   W: Nathan Lane
//   W: Jeremy Irons
//
// A "FILM:" (or "TOPIC:") line is the banner for every question after it. A is a right answer and
// each W is a wrong one: four in total for Trivia, 9 or 12 for Pick 'Em. More than one A makes
// it a select-all-that-apply question. Lines starting with # are comments.
//
// Pick 'Em also has typed lists: no A/W lines, but an L line per answer, with other
// accepted ways to write it after | (e.g. "L: Paris | Count Paris").

export interface Question {
  film: string;
  question: string;
  correct: string[];
  wrong: string[];
  /** Typed lists (Pick 'Em): each answer's accepted forms, the first being how it's shown. */
  list: string[][];
}

/**
 * Reads a question file in the format above. `valid` decides which questions to keep
 * (trivia wants exactly four options; Pick 'Em wants long lists).
 */
export function loadQuestionFile(path: string, valid: (q: Question) => boolean, tag = 'trivia'): Question[] {
  const questions: Question[] = [];
  let film = '';
  let current: Question | null = null;
  const finish = () => {
    if (!current) return;
    if (!valid(current)) {
      console.warn(`[${tag}] Skipping malformed question in ${path}: ${current.question}`);
    } else {
      questions.push(current);
    }
    current = null;
  };

  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(FILM|TOPIC|Q|A|W|L):\s*(.+)$/.exec(line);
    if (!match) {
      console.warn(`[${tag}] Ignoring line in ${path}: ${line}`);
      continue;
    }
    const [, key, value] = match;
    // TOPIC is FILM by another name, for banks that aren't about films (e.g. TV shows).
    if (key === 'FILM' || key === 'TOPIC') {
      finish();
      film = value;
    } else if (key === 'Q') {
      finish();
      current = { film, question: value, correct: [], wrong: [], list: [] };
    } else if (current && key === 'A') {
      current.correct.push(value);
    } else if (current && key === 'W') {
      current.wrong.push(value);
    } else if (current && key === 'L') {
      // "L: Paris | Count Paris": one answer to a typed list, with other ways to write it.
      current.list.push(value.split('|').map((form) => form.trim()).filter(Boolean));
    }
  }
  finish();
  return questions;
}

export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
