import { DRAIN, HEARTS, RECHARGE, ROCK_SOLID, ROUND_MS, TICK_HZ, rocksFor, type Rock, type RockInput, type RockState } from '../../shared/games/rockSolid';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Blob {
  rocks: Rock[];
  /** The next rock to land. */
  next: number;
  holding: boolean;
  /** Out of energy: soft until the button's let go. */
  spent: boolean;
  energy: number;
  hearts: number;
  blocked: number;
  hits: number;
}

export function newBlob(seed: number): Blob {
  return { rocks: rocksFor(seed), next: 0, holding: false, spent: false, energy: 1, hearts: HEARTS, blocked: 0, hits: 0 };
}

export const isHard = (b: Blob) => b.holding && !b.spent && b.energy > 0;

export function hold(b: Blob, down: boolean) {
  b.holding = down;
  if (!down) b.spent = false;
}

/** Moves a blob on by `dt` seconds to `ms` into the round. Returns true when its last heart's gone. */
export function stepBlob(b: Blob, dt: number, ms: number): boolean {
  if (isHard(b)) {
    b.energy = Math.max(0, b.energy - DRAIN * dt);
    if (b.energy === 0) b.spent = true;
  } else b.energy = Math.min(1, b.energy + RECHARGE * dt);
  while (b.next < b.rocks.length && b.rocks[b.next].at <= ms) {
    b.next++;
    if (isHard(b)) b.blocked++;
    else {
      b.hearts--;
      b.hits++;
    }
  }
  return b.hearts <= 0;
}

class RockSolid extends BoardsGame<Blob, RockState, RockState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 1, lastOneStanding: true });
  }

  protected newBoard(seed: number) {
    return newBlob(seed);
  }

  protected stepBoard(b: Blob, dt: number, roundMs: number) {
    return stepBlob(b, dt, roundMs);
  }

  protected boardInput(b: Blob, raw: unknown) {
    const input = raw as RockInput;
    if (input.type !== 'hold') return false;
    hold(b, !!input.down);
    return false;
  }

  protected boardScore(b: Blob) {
    return b.blocked;
  }

  protected hostState(b: Blob): RockState {
    return { hard: isHard(b), energy: Math.round(b.energy * 100) / 100, hearts: b.hearts, blocked: b.blocked, hits: b.hits };
  }

  protected playerState(b: Blob) {
    return this.hostState(b);
  }
}

export const rockSolid: MiniGameDefinition = {
  info: ROCK_SOLID,
  create: (ctx, _modeId, options) => new RockSolid(ctx, options.puzzles),
};
