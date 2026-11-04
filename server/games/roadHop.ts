import {
  CELL,
  COLS,
  HOPPER_R,
  HOP_MS,
  RESPAWN_MS,
  ROAD_HOP,
  ROUND_MS,
  TICK_HZ,
  VIEW_W,
  lanesFor,
  movers,
  train,
  type Dir,
  type HopState,
  type Lane,
  type RoadInput,
  type RoadPlayerState,
} from '../../shared/games/roadHop';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Hopper {
  lanes: Lane[];
  x: number;
  row: number;
  best: number;
  facing: Dir;
  lastHopAt: number;
  /** Hit: back on the last grass at this time (ms into the round). */
  respawnAt: number | null;
}

const colX = (c: number) => (c + 0.5) * CELL;
const nearestCol = (x: number) => Math.max(0, Math.min(COLS - 1, Math.round(x / CELL - 0.5)));

export function newHopper(seed: number): Hopper {
  return { lanes: lanesFor(seed), x: colX((COLS - 1) / 2), row: 0, best: 0, facing: 'up', lastHopAt: -Infinity, respawnAt: null };
}

/** Whether the hopper's hit (by a car or a train) or in the water (off every log, or carried off the board). */
export function inDanger(h: Hopper, ms: number) {
  const lane = h.lanes[h.row];
  const left = h.x - HOPPER_R;
  const right = h.x + HOPPER_R;
  if (lane.kind === 'road') return movers(lane, ms).some((x) => right > x && left < x + lane.length);
  if (lane.kind === 'river') return h.x < 0 || h.x > VIEW_W || !movers(lane, ms).some((x) => h.x > x && h.x < x + lane.length);
  if (lane.kind === 'rail') return train(lane, ms, 0).passing;
  return false;
}

/** A hop (at most every HOP_MS). Trees block; the edges of the board block. */
export function hop(h: Hopper, dir: Dir, ms: number) {
  if (h.respawnAt !== null || ms - h.lastHopAt < HOP_MS) return;
  h.lastHopAt = ms;
  h.facing = dir;
  const row = h.row + (dir === 'up' ? 1 : dir === 'down' ? -1 : 0);
  if (row < 0 || row >= h.lanes.length) return;
  // Across: a column at a time. Up or down: the column you're nearest (unless it's onto a river, where you land where you are).
  let x = h.x;
  if (dir === 'left' || dir === 'right') x = colX(nearestCol(h.x) + (dir === 'left' ? -1 : 1));
  else if (h.lanes[row].kind !== 'river') x = colX(nearestCol(h.x));
  if (x < 0 || x > VIEW_W) return;
  const lane = h.lanes[row];
  if (lane.kind === 'grass' && lane.trees.includes(nearestCol(x))) return;
  h.x = x;
  h.row = row;
  h.best = Math.max(h.best, row);
}

/** Moves on by `dt` seconds, `roundMs` into the round: logs carry you; anything that hits you sends you back. */
export function hopOn(h: Hopper, dt: number, ms: number) {
  if (h.respawnAt !== null) {
    if (ms < h.respawnAt) return;
    // Back on the last grass at or behind where you were, in the middle.
    let row = h.row;
    while (row > 0 && h.lanes[row].kind !== 'grass') row--;
    h.row = row;
    h.x = colX((COLS - 1) / 2);
    h.respawnAt = null;
  }
  const lane = h.lanes[h.row];
  if (lane.kind === 'river') h.x += lane.dir * lane.speed * dt;
  if (inDanger(h, ms)) h.respawnAt = ms + RESPAWN_MS;
}

class RoadHop extends BoardsGame<Hopper, HopState, RoadPlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  protected newBoard(seed: number) {
    return newHopper(seed);
  }

  protected stepBoard(h: Hopper, dt: number, roundMs: number) {
    hopOn(h, dt, roundMs);
    return false;
  }

  protected boardInput(h: Hopper, raw: unknown) {
    const input = raw as RoadInput;
    if (input.type !== 'hop' || this.phase !== 'play' || !['up', 'down', 'left', 'right'].includes(input.dir)) return false;
    const row = h.best;
    hop(h, input.dir, this.roundMs());
    return h.best !== row;
  }

  protected boardScore(h: Hopper) {
    return h.best;
  }

  protected hostState(h: Hopper): HopState {
    return { x: Math.round(h.x), row: h.row, best: h.best, hit: h.respawnAt !== null, facing: h.facing };
  }

  protected playerState(h: Hopper): RoadPlayerState {
    return { best: h.best };
  }
}

export const roadHop: MiniGameDefinition = {
  info: ROAD_HOP,
  create: (ctx, _modeId, options) => new RoadHop(ctx, options.puzzles),
};
