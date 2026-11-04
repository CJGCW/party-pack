import { MAX_RATE, METRES_PER_ENERGY, WALK_MS, WIND_MS, WIND_UP, windEnergy, type WindAim, type WindBoardState, type WindInput, type WindPlayerState } from '../../shared/games/windUp';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';
import { VolleyGame } from './volleys';

export interface Toy {
  /** A little luck in each toy's legs (0.95 to 1.05), from the round's seed. */
  legs: number;
  energy: number;
  distance: number;
  walking: boolean;
}

/** The most a phone can honestly have wound in the time. */
export const maxEnergy = (ms: number) => windEnergy((MAX_RATE * ms) / 1000, MAX_RATE);

class WindUp extends VolleyGame<Toy, WindBoardState, WindPlayerState, WindAim> {
  private windStartedAt = 0;

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { volleys: 1, aimMs: WIND_MS });
  }

  protected newBoard(seed: number, index: number): Toy {
    const random = seededRandom(seed + index * 7919);
    this.windStartedAt = Date.now();
    return { legs: 0.95 + random() * 0.1, energy: 0, distance: 0, walking: false };
  }

  protected defaultAim(): WindAim {
    return { energy: 0 };
  }

  protected readAim(raw: unknown): WindAim | null {
    const input = raw as WindInput;
    if ((input.type !== 'aim' && input.type !== 'fire') || !Number.isFinite(input.energy)) return null;
    return { energy: Math.max(0, Math.min(maxEnergy(Date.now() - this.windStartedAt + 500), input.energy)) };
  }

  protected shoot(shots: { board: Toy; aim: WindAim }[]) {
    for (const { board, aim } of shots) {
      board.energy = aim.energy;
      board.distance = Math.round(aim.energy * METRES_PER_ENERGY * board.legs * 10) / 10;
      board.walking = true;
    }
    return WALK_MS;
  }

  protected boardScore(t: Toy) {
    return t.distance;
  }

  protected hostState(t: Toy, aim: WindAim): WindBoardState {
    return { energy: Math.round(this.phase === 'aim' ? aim.energy : t.energy), distance: t.distance, walking: this.phase === 'fly' };
  }

  protected playerState(t: Toy, aim: WindAim): WindPlayerState {
    return { energy: Math.round(this.phase === 'aim' ? aim.energy : t.energy), distance: t.distance };
  }
}

export const windUp: MiniGameDefinition = {
  info: WIND_UP,
  create: (ctx, _modeId, options) => new WindUp(ctx, options.puzzles),
};
