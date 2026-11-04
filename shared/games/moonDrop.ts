import type { ArenaHostView, ArenaPlayerView } from '../arena';
import type { GameInfo } from '../protocol';

export const MOON_DROP: GameInfo = {
  id: 'moon-drop',
  name: 'Moon Drop',
  description: 'Everyone drops onto the same moon at once. Turn your phone to tilt your lander and hold THRUST to slow down. Touch down on a pad, slowly and upright: the smaller the pad, the more it is worth, and fuel left counts too. Crash and you score nothing.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Best landing wins.' }],
};

// A shared arena game (see shared/arena.ts), scored by best score; the landers pass through each
// other. The moon's surface comes from the round's seed (the TV works it out too). World units are
// TV-ish pixels, y down.

export const ROUND_MS = 60_000;
export const TICK_HZ = 30;
export const WORLD_W = 1600;
export const WORLD_H = 900;
export const GRAVITY = 40;
export const THRUST = 105;
/** Fuel: seconds of thrust. */
export const FUEL_S = 14;
export const LANDER_R = 18;
/** A landing this slow (and this upright) is safe. */
export const SAFE_VY = 55;
export const SAFE_VX = 35;
export const SAFE_TILT = 0.3;
/** Full steering is this far round (radians); it tilts the lander up to MAX_TILT. */
export const STEER_FULL = 1.1;
export const MAX_TILT = 1.4;
export const START = { x: 140, y: 90, vx: 55, vy: 0 };

export interface Pad {
  x0: number;
  x1: number;
  y: number;
  mult: number;
}

/** The surface: points across (x, y), and the pads (flat stretches) in it. */
export function moonFor(seed: number): { points: [number, number][]; pads: Pad[] } {
  let s = seed >>> 0 || 1;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  // Three pads: wide (x2), middling (x3), narrow (x5), in some order across the right two thirds.
  const widths = [150, 100, 60];
  const mults = [2, 3, 5];
  const order = [0, 1, 2].sort(() => random() - 0.5);
  const slots = [520, 900, 1280];
  const pads: Pad[] = order.map((k, i) => {
    const x0 = slots[i] + random() * 120;
    return { x0, x1: x0 + widths[k], y: 600 + random() * 200, mult: mults[k] };
  });
  const points: [number, number][] = [[0, 520 + random() * 120]];
  let x = 0;
  for (const p of [...pads].sort((a, b) => a.x0 - b.x0)) {
    while (x + 80 < p.x0 - 30) {
      x += 50 + random() * 60;
      points.push([x, 420 + random() * 420]);
    }
    points.push([p.x0, p.y], [p.x1, p.y]);
    x = p.x1;
  }
  while (x < WORLD_W) {
    x = Math.min(WORLD_W, x + 50 + random() * 60);
    points.push([x, 420 + random() * 420]);
  }
  return { points, pads };
}

/** The surface's height under x. */
export function groundAt(points: [number, number][], x: number) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    if (x <= bx) return ay + ((by - ay) * (x - ax)) / Math.max(1e-6, bx - ax);
  }
  return points[points.length - 1][1];
}

/** A landing's score: pad multiplier times (100, plus up to 100 for softness, plus up to 60 for fuel left). */
export function landingScore(speed: number, fuel: number, mult: number) {
  const soft = Math.max(0, 1 - speed / Math.hypot(SAFE_VX, SAFE_VY));
  return Math.round(mult * (100 + 100 * soft + 60 * (fuel / FUEL_S)));
}

export interface LanderView {
  playerId: string;
  color: string;
  x: number;
  y: number;
  angle: number;
  thrusting: boolean;
  fuel: number;
  /** 'flying', or how it ended. */
  status: 'flying' | 'landed' | 'crashed';
  score: number;
}

export interface MoonWorld {
  landers: LanderView[];
}

export interface MoonPlayerState {
  fuel: number;
  status: LanderView['status'];
  score: number;
  speed: number;
}

export type MoonHostView = ArenaHostView<MoonWorld>;
export type MoonPlayerView = ArenaPlayerView<MoonPlayerState>;

export type MoonInput = { type: 'steer'; angle: number } | { type: 'thrust'; on: boolean };
