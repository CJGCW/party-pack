import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Questions the VIP flagged for review: one JSON object per line, newest last.

export const FLAGS_FILE = join(import.meta.dirname, '..', 'flagged-questions.jsonl');

/** What's saved for a flagged question: where it came from, and the question with its answers. */
export interface FlagRecord {
  id: string;
  flaggedAt: string;
  game: string;
  mode: string;
  banner?: string;
  question: string;
  answers: string[];
  wrong?: string[];
}

export function saveFlag(record: FlagRecord) {
  try {
    appendFileSync(FLAGS_FILE, `${JSON.stringify(record)}\n`);
  } catch (err) {
    console.warn(`[flags] Couldn't write ${FLAGS_FILE}:`, err);
  }
}

/** Unflagged again: takes it back out. */
export function removeFlag(id: string) {
  try {
    if (!existsSync(FLAGS_FILE)) return;
    const kept = readFileSync(FLAGS_FILE, 'utf8')
      .split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        try {
          return (JSON.parse(line) as FlagRecord).id !== id;
        } catch {
          return true;
        }
      });
    writeFileSync(FLAGS_FILE, kept.length ? `${kept.join('\n')}\n` : '');
  } catch (err) {
    console.warn(`[flags] Couldn't update ${FLAGS_FILE}:`, err);
  }
}
