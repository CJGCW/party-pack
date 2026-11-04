import type { ArenaHostView, ArenaPlayerView } from '../arena';
import type { GameInfo } from '../protocol';

export const LIGHT_TRAILS: GameInfo = {
  id: 'light-trails',
  name: 'Light Trails',
  description: 'Everyone rides a light cycle that leaves a wall behind it. Swipe to turn. Hit any wall and you are out. Last one riding wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Last one riding wins; the walls close in after 50 seconds.' }],
};

// A shared arena game (see shared/arena.ts), scored by survival: the round ends when only one is
// left riding. The arena's a grid; each rider moves a cell a tick.

export const ROUND_MS = 90_000;
export const TICK_HZ = 14;
export const GRID_W = 120;
export const GRID_H = 68;
/** After this long, the walls close in a cell every SHRINK_EVERY_MS (on every side). */
export const SHRINK_AT_MS = 50_000;
export const SHRINK_EVERY_MS = 1_300;
/** Riders start this far in from the walls. */
export const START_INSET = 8;

export type Dir = 'up' | 'down' | 'left' | 'right';
export const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const REVERSE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** How far in the walls have closed `ms` into the round. */
export function insetAt(ms: number) {
  return ms < SHRINK_AT_MS ? 0 : 1 + Math.floor((ms - SHRINK_AT_MS) / SHRINK_EVERY_MS);
}

/**
 * Where `n` riders start: spread round a ring inside the walls, each heading along the ring
 * (clockwise), so nobody starts facing anyone.
 */
export function startsFor(n: number): { x: number; y: number; dir: Dir }[] {
  const x0 = START_INSET;
  const y0 = START_INSET;
  const x1 = GRID_W - 1 - START_INSET;
  const y1 = GRID_H - 1 - START_INSET;
  const w = x1 - x0;
  const h = y1 - y0;
  const perimeter = 2 * (w + h);
  return Array.from({ length: n }, (_, i) => {
    let d = Math.floor((i / n) * perimeter);
    if (d < w) return { x: x0 + d, y: y0, dir: 'right' as Dir };
    d -= w;
    if (d < h) return { x: x1, y: y0 + d, dir: 'down' as Dir };
    d -= h;
    if (d < w) return { x: x1 - d, y: y1, dir: 'left' as Dir };
    d -= w;
    return { x: x0, y: y1 - d, dir: 'up' as Dir };
  });
}

// ---- Views ---------------------------------------------------------------------------------

export interface RiderView {
  playerId: string;
  color: string;
  /** The trail's corners, then the head: x0, y0, x1, y1, … (cells). */
  trail: number[];
  dir: Dir;
  alive: boolean;
}

export interface TrailsWorld {
  riders: RiderView[];
  inset: number;
}

export interface TrailsPlayerState {
  dir: Dir;
  color: string;
}

export type TrailsHostView = ArenaHostView<TrailsWorld>;
export type TrailsPlayerView = ArenaPlayerView<TrailsPlayerState>;

export type TrailsInput = { type: 'turn'; dir: Dir };
