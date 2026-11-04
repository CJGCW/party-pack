import {
  LANES_PER_S,
  ROUND_MS,
  TEMPEST_RUN,
  TICK_HZ,
  TUBES,
  hazardsFor,
  laneAt,
  targetPosition,
  type Hazard,
  type SteerInput,
  type TempestBoardState,
  type TempestRound,
  type Tube,
} from '../../shared/games/tempestRun';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Runner {
  tube: Tube;
  hazards: Hazard[];
  /** Where they are along the rim, and where their steering's taking them. */
  position: number;
  target: number;
  /** The next hazard (by arrival) that hasn't reached the rim yet. */
  next: number;
}

/** Moves toward the steering, the short way round on a closed tube, no faster than LANES_PER_S. */
export function slide(r: Runner, dt: number) {
  const { tube } = r;
  let diff = r.target - r.position;
  if (tube.closed) diff = ((((diff + tube.lanes / 2) % tube.lanes) + tube.lanes) % tube.lanes) - tube.lanes / 2;
  const step = Math.max(-LANES_PER_S * dt, Math.min(LANES_PER_S * dt, diff));
  r.position += step;
  if (tube.closed) r.position = ((r.position % tube.lanes) + tube.lanes) % tube.lanes;
}

/** Moves on to `roundMs`. Returns true if a hazard reached the rim in the runner's lane. */
export function runOn(r: Runner, dt: number, roundMs: number) {
  slide(r, dt);
  const lane = laneAt(r.tube, r.position);
  let hit = false;
  while (r.next < r.hazards.length && r.hazards[r.next].arriveMs <= roundMs) {
    if (r.hazards[r.next].lane === lane) hit = true;
    r.next++;
  }
  return hit;
}

export function newRunner(seed: number, tube: Tube): Runner {
  const hazards = hazardsFor(seed, tube).sort((a, b) => a.arriveMs - b.arriveMs);
  const start = targetPosition(tube, 0);
  return { tube, hazards, position: start, target: start, next: 0 };
}

class TempestRun extends BoardsGame<Runner, TempestBoardState, Record<string, never>, TempestRound> {
  private tube: Tube = TUBES[0];

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  /** Everyone's on the same tube, a different one from last round. */
  protected beforeRound() {
    const pool = this.puzzleIndex === 0 ? TUBES : TUBES.filter((t) => t !== this.tube);
    this.tube = pool[Math.floor(Math.random() * pool.length)];
  }

  protected newBoard(seed: number) {
    return newRunner(seed, this.tube);
  }

  protected stepBoard(r: Runner, dt: number, roundMs: number) {
    return runOn(r, dt, roundMs);
  }

  protected boardInput(r: Runner, raw: unknown) {
    const input = raw as SteerInput;
    if (input.type === 'steer' && Number.isFinite(input.angle)) r.target = targetPosition(r.tube, input.angle);
    return false;
  }

  protected roundState(): TempestRound {
    return { tubeId: this.tube.id };
  }

  protected hostState(r: Runner): TempestBoardState {
    return { position: Math.round(r.position * 100) / 100 };
  }

  protected playerState() {
    return {};
  }
}

export const tempestRun: MiniGameDefinition = {
  info: TEMPEST_RUN,
  create: (ctx, _modeId, options) => new TempestRun(ctx, options.puzzles),
};
