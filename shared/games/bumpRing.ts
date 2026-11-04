import type { ArenaHostView, ArenaPlayerView } from '../arena';
import type { GameInfo } from '../protocol';

export const BUMP_RING: GameInfo = {
  id: 'bump-ring',
  name: 'Bump Ring',
  description: 'Everyone rides a ball on a round platform. Tilt your phone to roll and ram your rivals off the edge. The edge crumbles away as time goes on. Last one on wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Last one on the platform wins.' }],
};

// A shared arena game (see shared/arena.ts), scored by survival: the round ends when only one is
// left on. The world's a 1000 × 1000 square with the platform in the middle.

export const ROUND_MS = 75_000;
export const TICK_HZ = 30;
export const WORLD = 1000;
export const CENTER = WORLD / 2;
/** The platform's radius: this at the start, crumbling from CRUMBLE_AT_MS down to MIN_RADIUS at the end. */
export const RADIUS = 440;
export const MIN_RADIUS = 170;
export const CRUMBLE_AT_MS = 35_000;
export const BALL_R = 42;
/** A full tilt pushes this hard (units/s²); rolling slows by this share a second; no faster than MAX_SPEED. */
export const ACCEL = 1300;
export const FRICTION = 0.9;
export const MAX_SPEED = 700;
/** Bumps bounce apart a bit harder than they hit (so they knock people about). */
export const BUMP = 1.25;
/** Tilt this small counts as level. */
export const DEAD_ZONE = 0.06;

/** The platform's radius `ms` into the round. */
export function radiusAt(ms: number) {
  if (ms <= CRUMBLE_AT_MS) return RADIUS;
  const f = Math.min(1, (ms - CRUMBLE_AT_MS) / (ROUND_MS - CRUMBLE_AT_MS));
  return RADIUS + (MIN_RADIUS - RADIUS) * f;
}

// ---- Views ---------------------------------------------------------------------------------

export interface BallView {
  playerId: string;
  color: string;
  x: number;
  y: number;
  /** Falling off: it shrinks away. */
  falling: boolean;
  on: boolean;
}

export interface RingWorld {
  balls: BallView[];
  radius: number;
}

export type RingHostView = ArenaHostView<RingWorld>;
export type RingPlayerView = ArenaPlayerView<Record<string, never>>;
