import {
  GRID_H,
  GRID_W,
  LIGHT_TRAILS,
  REVERSE,
  ROUND_MS,
  STEP,
  TICK_HZ,
  insetAt,
  startsFor,
  type Dir,
  type TrailsInput,
  type TrailsPlayerState,
  type TrailsWorld,
} from '../../shared/games/lightTrails';
import { ArenaGame } from './arena';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Rider {
  playerId: string;
  x: number;
  y: number;
  dir: Dir;
  /** Turns swiped but not taken yet, one a step (two can wait, so a quick double swipe isn't lost). */
  queued: Dir[];
  corners: number[];
  alive: boolean;
}

export interface Grid {
  riders: Rider[];
  /** Which cells have a wall in them (anyone's trail). */
  taken: Uint8Array;
  inset: number;
}

export function newGrid(playerIds: string[]): Grid {
  const starts = startsFor(playerIds.length);
  const taken = new Uint8Array(GRID_W * GRID_H);
  const riders = playerIds.map((playerId, i) => {
    const s = starts[i];
    taken[s.y * GRID_W + s.x] = 1;
    return { playerId, x: s.x, y: s.y, dir: s.dir, queued: [] as Dir[], corners: [s.x, s.y], alive: true };
  });
  return { riders, taken, inset: 0 };
}

/** A swipe: turn that way at the next step (never straight back the way it's going by then). */
export function turn(r: Rider, dir: Dir) {
  const after = r.queued[r.queued.length - 1] ?? r.dir;
  if (dir === after || dir === REVERSE[after] || r.queued.length >= 2) return;
  r.queued.push(dir);
}

/** Moves every rider a cell, `roundMs` into the round. Returns those who crashed. */
export function ride(g: Grid, roundMs: number): string[] {
  g.inset = insetAt(roundMs);
  const alive = g.riders.filter((r) => r.alive);
  for (const r of alive) {
    const dir = r.queued.shift();
    if (dir) {
      r.corners.push(r.x, r.y);
      r.dir = dir;
    }
  }
  const next = alive.map((r) => ({ r, x: r.x + STEP[r.dir][0], y: r.y + STEP[r.dir][1] }));
  const lo = g.inset;
  const crashed = new Set<Rider>();
  for (const n of next) {
    const offGrid = n.x < lo || n.y < lo || n.x > GRID_W - 1 - lo || n.y > GRID_H - 1 - lo;
    if (offGrid || g.taken[n.y * GRID_W + n.x]) crashed.add(n.r);
    // Two riders into the same cell: both crash.
    if (next.some((o) => o !== n && o.x === n.x && o.y === n.y)) crashed.add(n.r);
  }
  for (const n of next) {
    n.r.x = n.x;
    n.r.y = n.y;
    if (crashed.has(n.r)) n.r.alive = false;
    else g.taken[n.y * GRID_W + n.x] = 1;
  }
  return [...crashed].map((r) => r.playerId);
}

class LightTrails extends ArenaGame<Grid, TrailsWorld, TrailsPlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, lastOneStanding: true });
  }

  protected newWorld(_seed: number, playerIds: string[]) {
    return newGrid(playerIds);
  }

  protected stepWorld(g: Grid, _dt: number, roundMs: number) {
    return ride(g, roundMs);
  }

  protected worldInput(g: Grid, playerId: string, raw: unknown) {
    const input = raw as TrailsInput;
    const r = g.riders.find((o) => o.playerId === playerId);
    if (!r || input.type !== 'turn' || !(input.dir in STEP)) return false;
    turn(r, input.dir);
    return false;
  }

  private colorOf(playerId: string) {
    return this.ctx.players().find((p) => p.id === playerId)?.color ?? '#ffffff';
  }

  protected hostState(g: Grid): TrailsWorld {
    return {
      riders: g.riders.map((r) => ({ playerId: r.playerId, color: this.colorOf(r.playerId), trail: [...r.corners, r.x, r.y], dir: r.dir, alive: r.alive })),
      inset: g.inset,
    };
  }

  protected playerState(g: Grid, playerId: string): TrailsPlayerState {
    const r = g.riders.find((o) => o.playerId === playerId);
    return { dir: r?.dir ?? 'up', color: this.colorOf(playerId) };
  }
}

export const lightTrails: MiniGameDefinition = {
  info: LIGHT_TRAILS,
  create: (ctx, _modeId, options) => new LightTrails(ctx, options.puzzles),
};
