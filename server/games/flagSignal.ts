import { DIRS, FLAG_SIGNAL, ROUND_MS, TICK_HZ, levelAt, sequenceFor, type Dir, type FlagInput, type FlagState } from '../../shared/games/flagSignal';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Signaller {
  sequence: Dir[];
  level: number;
  stage: FlagState['stage'];
  done: number;
  last: Dir | null;
  wrong: boolean;
  /** Levels answered in full. */
  cleared: number;
}

export function newSignaller(seed: number): Signaller {
  return { sequence: sequenceFor(seed), level: 1, stage: 'rest', done: 0, last: null, wrong: false, cleared: 0 };
}

/** Moves on to `ms` into the round. Returns true if the player's out (an answer not finished in time). */
export function stepSignaller(s: Signaller, ms: number): boolean {
  const at = levelAt(ms);
  if (at.k !== s.level) {
    // A level's gone by: it had to be answered in full.
    if (s.done < s.level) return true;
    s.level = at.k;
    s.done = 0;
    s.last = null;
  }
  s.stage = at.stage;
  return false;
}

/** A swipe. Returns false if it was wrong (out). */
export function swipe(s: Signaller, dir: Dir): boolean {
  if (s.stage !== 'answer' || s.done >= s.level) return true;
  s.last = dir;
  if (s.sequence[s.done] !== dir) {
    s.wrong = true;
    return false;
  }
  s.done++;
  if (s.done === s.level) s.cleared++;
  return true;
}

class FlagSignal extends BoardsGame<Signaller, FlagState, FlagState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 2, lastOneStanding: true });
  }

  protected newBoard(seed: number) {
    return newSignaller(seed);
  }

  protected stepBoard(s: Signaller, _dt: number, roundMs: number) {
    return stepSignaller(s, roundMs);
  }

  protected boardInput(s: Signaller, raw: unknown) {
    const input = raw as FlagInput;
    if (input.type !== 'swipe' || !DIRS.includes(input.dir) || this.phase !== 'play') return false;
    stepSignaller(s, this.roundMs());
    return swipe(s, input.dir) ? true : 'ended';
  }

  protected boardScore(s: Signaller) {
    return s.cleared;
  }

  protected hostState(s: Signaller): FlagState {
    return { level: s.level, stage: s.stage, done: s.done, need: s.level, last: s.last, wrong: s.wrong };
  }

  protected playerState(s: Signaller) {
    return this.hostState(s);
  }
}

export const flagSignal: MiniGameDefinition = {
  info: FLAG_SIGNAL,
  create: (ctx, _modeId, options) => new FlagSignal(ctx, options.puzzles),
};
