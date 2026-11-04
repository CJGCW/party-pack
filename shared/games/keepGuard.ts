import type { ArenaHostView, ArenaPlayerView } from '../arena';
import type { GameInfo } from '../protocol';

export const KEEP_GUARD: GameInfo = {
  id: 'keep-guard',
  name: 'Keep Guard',
  description: 'Everyone has a keep on the edge of the arena, walled in by bricks, with a shield to swing round it. Turn your phone to move the shield and bat the balls away. A ball that reaches your keep knocks you out. More balls join as time goes on. Last keep standing wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Last keep standing wins.' }],
};

// A shared arena game (see shared/arena.ts), scored by survival. The arena's a circle in a
// 1000 × 1000 world; the keeps sit evenly round its rim (two face each other). Each keep's laid
// out in its own polar coordinates: angle 0 points into the arena, ±90° along the rim.

export const ROUND_MS = 90_000;
export const TICK_HZ = 30;
export const WORLD = 1000;
export const CENTER = WORLD / 2;
export const ARENA_R = 440;
export const BALL_R = 12;
/** The keep (hit it and you're out), the two rings of bricks round it, and where the shield swings. */
export const CORE_R = 46;
export const BRICK_RINGS: [number, number][] = [
  [64, 90],
  [90, 116],
];
export const BRICKS_PER_RING = 7;
export const SHIELD_R = 150;
/** Half the shield's width (radians), and how far either way it can swing. */
export const SHIELD_HALF = 0.28;
export const SHIELD_SWING = Math.PI / 2 - 0.2;
/** A fallen keep's left as a mound of rubble this big, which balls bounce off. */
export const RUBBLE_R = 116;
/** Balls start at BALL_SPEED and speed up by this much a second, to MAX_BALL_SPEED. */
export const BALL_SPEED = 420;
export const BALL_SPEEDUP = 5;
export const MAX_BALL_SPEED = 720;
/** When each ball comes in (ms into the round). */
export const BALL_TIMES = [0, 15_000, 30_000, 45_000, 60_000];
/** Full steering is this far round (radians), as on Spiral Shot. */
export const STEER_FULL = 1.1;

/** Where keep `i` of `n` sits on the rim (its angle from the centre). Two face each other left and right. */
export function keepAngle(i: number, n: number) {
  return Math.PI + (i / n) * Math.PI * 2;
}

/** The middle of keep `i` of `n`. */
export function keepCenter(i: number, n: number) {
  const a = keepAngle(i, n);
  return { x: CENTER + Math.cos(a) * ARENA_R, y: CENTER + Math.sin(a) * ARENA_R };
}

/** A keep's "into the arena" direction (radians, screen angle). */
export function keepFacing(i: number, n: number) {
  return keepAngle(i, n) + Math.PI;
}

// ---- Views ---------------------------------------------------------------------------------

export interface KeepView {
  playerId: string;
  color: string;
  /** The shield's angle from the keep's facing (radians). */
  shield: number;
  /** Bricks standing, ring by ring ('1' standing, '0' gone). */
  bricks: string;
  alive: boolean;
}

export interface GuardWorld {
  keeps: KeepView[];
  balls: { id: number; x: number; y: number }[];
}

export interface GuardPlayerState {
  bricks: number;
  balls: number;
}

export type GuardHostView = ArenaHostView<GuardWorld>;
export type GuardPlayerView = ArenaPlayerView<GuardPlayerState>;

export type GuardInput = { type: 'steer'; angle: number };
