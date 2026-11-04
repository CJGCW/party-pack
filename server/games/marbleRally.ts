import {
  ACCEL,
  BALL_R,
  COURSES,
  DEAD_ZONE,
  FALL_MS,
  FRICTION,
  MARBLE_RALLY,
  MAX_SPEED,
  ROUND_MS,
  SLOPE,
  TICK_HZ,
  marks,
  onTrack,
  tileAt,
  type MarbleState,
} from '../../shared/games/marbleRally';
import type { TiltInput } from '../../shared/games/tileTilt';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

const SLOPES: Record<string, [number, number]> = { '>': [1, 0], '<': [-1, 0], v: [0, 1], '^': [0, -1] };

export interface Marble {
  course: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tilt: { x: number; y: number };
  respawn: { x: number; y: number };
  /** Checkpoints reached (by position, so they're not counted twice). */
  reached: Set<string>;
  fallingUntil: number;
  falls: number;
}

export function newMarble(course: number): Marble {
  const at = course % COURSES.length;
  const start = marks(COURSES[at].rows, 'S')[0];
  return { course: at, ...start, vx: 0, vy: 0, tilt: { x: 0, y: 0 }, respawn: start, reached: new Set(), fallingUntil: 0, falls: 0 };
}

/** Rolls the marble on by `dt` seconds, `ms` into the round. Returns true at the finish. */
export function rollMarble(m: Marble, dt: number, ms: number): boolean {
  const rows = COURSES[m.course].rows;
  if (m.fallingUntil) {
    if (ms < m.fallingUntil) return false;
    m.fallingUntil = 0;
    Object.assign(m, { ...m.respawn, vx: 0, vy: 0 });
  }
  const dead = (v: number) => (Math.abs(v) < DEAD_ZONE ? 0 : v);
  const slope = SLOPES[tileAt(rows, m.x, m.y)] ?? [0, 0];
  m.vx += (dead(m.tilt.x) * ACCEL + slope[0] * SLOPE) * dt;
  m.vy += (dead(m.tilt.y) * ACCEL + slope[1] * SLOPE) * dt;
  const keep = Math.exp(-FRICTION * dt);
  m.vx *= keep;
  m.vy *= keep;
  const speed = Math.hypot(m.vx, m.vy);
  if (speed > MAX_SPEED) [m.vx, m.vy] = [(m.vx * MAX_SPEED) / speed, (m.vy * MAX_SPEED) / speed];
  m.x += m.vx * dt;
  m.y += m.vy * dt;
  const here = tileAt(rows, m.x, m.y);
  // Off the edge (its middle over nothing, past a little give): it falls.
  if (!onTrack(here)) {
    const margin = BALL_R * 0.5;
    const near = [
      [m.x - margin, m.y],
      [m.x + margin, m.y],
      [m.x, m.y - margin],
      [m.x, m.y + margin],
    ].filter(([x, y]) => onTrack(tileAt(rows, x, y))).length;
    if (near < 2) {
      m.falls++;
      m.fallingUntil = ms + FALL_MS;
      return false;
    }
  }
  if (here === 'C') {
    const key = `${Math.floor(m.x)},${Math.floor(m.y)}`;
    m.reached.add(key);
    m.respawn = { x: Math.floor(m.x) + 0.5, y: Math.floor(m.y) + 0.5 };
  }
  return here === 'G';
}

class MarbleRally extends BoardsGame<Marble, MarbleState, MarbleState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'race', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  protected newBoard() {
    return newMarble(this.puzzleIndex);
  }

  protected stepBoard(m: Marble, dt: number, roundMs: number) {
    return rollMarble(m, dt, roundMs);
  }

  protected boardInput(m: Marble, raw: unknown) {
    const input = raw as TiltInput;
    if (input.type === 'tilt' && Number.isFinite(input.x) && Number.isFinite(input.y)) m.tilt = { x: Math.max(-1, Math.min(1, input.x)), y: Math.max(-1, Math.min(1, input.y)) };
    return false;
  }

  protected boardProgress(m: Marble) {
    return m.reached.size / Math.max(1, marks(COURSES[m.course].rows, 'C').length + 1);
  }

  protected boardScore(m: Marble) {
    return m.falls;
  }

  protected hostState(m: Marble): MarbleState {
    const falling = m.fallingUntil ? Math.min(1, 1 - (m.fallingUntil - this.roundMs()) / FALL_MS) : 0;
    return { course: m.course, x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100, falling: Math.round(falling * 10) / 10, checkpoints: m.reached.size, falls: m.falls };
  }

  protected playerState(m: Marble): MarbleState {
    return { ...this.hostState(m), x: 0, y: 0, falling: m.fallingUntil ? 1 : 0 };
  }
}

export const marbleRally: MiniGameDefinition = {
  info: MARBLE_RALLY,
  create: (ctx, _modeId, options) => new MarbleRally(ctx, options.puzzles),
};
