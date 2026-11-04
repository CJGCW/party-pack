import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const GLIDE_DROP: GameInfo = {
  id: 'glide-drop',
  name: 'Glide Drop',
  description: 'Launch off the ramp and glide out to sea. Turn your phone to tip your glider up (slower, flatter) or down (faster, steeper), and tap to fold your wings and drop. Land on the floating target: the middle scores most. Three flights each.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Three flights; best total wins.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by best score. Seen from the side, in
// metres (x out to sea, y up); each flight's target comes from the round's seed, so everyone flies
// to the same ones. The TV draws BOARD_PX pixels a metre.

export const ROUND_MS = 75_000;
export const TICK_HZ = 30;
export const FLIGHTS = 3;
export const WORLD_W = 1300;
export const WORLD_H = 320;
export const BOARD_PX = 0.5;
export const BOARD_W = WORLD_W * BOARD_PX;
export const BOARD_H = WORLD_H * BOARD_PX + 40 + 30;
export const GRAVITY = 9.8;
/** Drag (so a glide settles to a speed), the speed under which it stalls (and the nose drops), and launch. */
export const DRAG = 0.0006;
export const STALL = 18;
export const LAUNCH = { x: 20, y: 250, v: 42, angle: -0.25 };
/** Pitch: full steering tips it this far (radians) up or down from level. */
export const MAX_PITCH = 0.7;
export const STEER_FULL = 0.8;
/** The target's rings (radius in metres) and what landing inside each scores. */
export const RINGS: [number, number][] = [
  [10, 100],
  [25, 50],
  [45, 25],
  [70, 10],
];
/** A flight ends this long after landing; then the next one launches. */
export const BETWEEN_MS = 2_000;

/** Where flight `n`'s target floats (its middle, along the sea). */
export function targetFor(seed: number, n: number) {
  let s = (seed + n * 2_654_435) >>> 0 || 1;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  return 520 + (s / 2 ** 32) * 620;
}

export const ringScore = (dx: number) => RINGS.find(([r]) => Math.abs(dx) <= r)?.[1] ?? 0;

export interface GlideState {
  flight: number;
  x: number;
  y: number;
  angle: number;
  open: boolean;
  /** 'flying', 'landed' (with what it scored), or 'waiting' for the next launch. */
  status: 'flying' | 'landed' | 'done';
  last: number | null;
  scores: number[];
}

export type GlideHostView = BoardsHostView<GlideState>;
export type GlidePlayerView = BoardsPlayerView<GlideState>;

export type GlideInput = { type: 'steer'; angle: number } | { type: 'fold' };
