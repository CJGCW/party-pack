import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const FLAG_SIGNAL: GameInfo = {
  id: 'flag-signal',
  name: 'Flag Signal',
  description: 'Watch the referee on the TV wave the flags: up, down, left, right. Then swipe the same signals on your phone, in order, before time runs out. Each time the sequence gets one longer and quicker. One wrong swipe and you are out. Last one standing wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Last one standing wins.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by survival, with everyone in step:
// level k shows the first k signals of the round's sequence (from its seed), then everyone has a
// set time to swipe them back. The TV works the schedule out from the seed.

export const ROUND_MS = 120_000;
export const TICK_HZ = 10;
export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
/** The countdown before level 1 is part of the round. */
export const FIRST_MS = 1_500;
/** Pause between showing and answering, and after answering. */
export const GAP_MS = 500;
export const REST_MS = 900;

/** Each signal's on show this long at level k, and there's this long a signal to answer. */
export const showMs = (k: number) => Math.max(380, 820 - k * 40);
export const answerMs = (k: number) => Math.max(650, 1_700 - k * 60);

/** The round's sequence (as long as it'll ever need to be). */
export function sequenceFor(seed: number): Dir[] {
  let s = seed >>> 0 || 1;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: 60 }, () => DIRS[Math.floor(random() * 4)]);
}

/** Level k's times (ms into the round): showing from `show`, answering from `answer` until `end`. */
export function levelTimes(k: number) {
  let t = FIRST_MS;
  for (let j = 1; j < k; j++) t += j * showMs(j) + GAP_MS + j * answerMs(j) + REST_MS;
  const answer = t + k * showMs(k) + GAP_MS;
  return { show: t, answer, end: answer + k * answerMs(k) };
}

/** Which level's on `ms` into the round, and what's happening: showing (and which signal), answering, or resting after. */
export function levelAt(ms: number): { k: number; stage: 'show' | 'answer' | 'rest'; signal: number } {
  for (let k = 1; ; k++) {
    const t = levelTimes(k);
    const next = levelTimes(k + 1).show;
    if (ms >= next) continue;
    if (ms < t.show) return { k, stage: 'rest', signal: -1 };
    if (ms < t.answer) return { k, stage: 'show', signal: Math.min(k - 1, Math.floor((ms - t.show) / showMs(k))) };
    if (ms < t.end) return { k, stage: 'answer', signal: -1 };
    return { k, stage: 'rest', signal: -1 };
  }
}

export interface FlagState {
  level: number;
  stage: 'show' | 'answer' | 'rest';
  /** Swipes done this level, of how many. */
  done: number;
  need: number;
  /** The last swipe, right or wrong (for the phone to show). */
  last: Dir | null;
  wrong: boolean;
}

export type FlagHostView = BoardsHostView<FlagState>;
export type FlagPlayerView = BoardsPlayerView<FlagState>;

export type FlagInput = { type: 'swipe'; dir: Dir };
