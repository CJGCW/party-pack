import type { ArenaHostView, ArenaPlayerView } from '../arena';
import type { GameInfo } from '../protocol';

export const SKY_JOUST: GameInfo = {
  id: 'sky-joust',
  name: 'Sky Joust',
  description: 'Fly your mount round a cave: turn your phone to steer, tap to flap. Crash into a rival from above to knock them down; stay out of the lava. Three lives each. Last flyer wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Three lives; last flyer wins.' }],
};

// A shared arena game (see shared/arena.ts), scored by survival. The cave's 1600 × 900, wrapping
// round left to right; ledges to land on, lava at the bottom.

export const ROUND_MS = 90_000;
export const TICK_HZ = 30;
export const WORLD_W = 1600;
export const WORLD_H = 900;
export const LAVA_Y = 840;
export const RIDER_R = 30;
export const LIVES = 3;
export const GRAVITY = 1300;
/** A flap pushes you up this fast (or adds this much, up to it); steering pushes you sideways up to MAX_VX. */
export const FLAP_SPEED = 560;
export const STEER_ACCEL = 1600;
export const MAX_VX = 460;
export const AIR_DRAG = 0.8;
/** In a clash, you need to be at least this much higher to win it (else you just bounce apart). */
export const CLASH_MARGIN = 10;
/** After losing a life: back after RESPAWN_MS, and safe from clashes for SAFE_MS after that. */
export const RESPAWN_MS = 1_400;
export const SAFE_MS = 1_500;

/** The ledges: left edge, top, width (the cave wraps, so ones at the sides join up). */
export const LEDGES: [number, number, number][] = [
  [0, 230, 260],
  [1340, 230, 260],
  [600, 300, 400],
  [180, 480, 320],
  [1100, 480, 320],
  [640, 640, 320],
  [0, 760, 220],
  [1380, 760, 220],
];

/** Where riders come back in: on top of these ledges (by index). */
export const SPAWN_LEDGES = [2, 3, 4, 5, 0, 1, 6, 7];

// ---- Views ---------------------------------------------------------------------------------

export interface JousterView {
  playerId: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  lives: number;
  /** Knocked down, waiting to come back. */
  down: boolean;
  safe: boolean;
  /** Flapped just now (for the wings), counting up. */
  flaps: number;
  knocks: number;
}

export interface JoustWorld {
  riders: JousterView[];
}

export interface JoustPlayerState {
  lives: number;
  knocks: number;
}

export type JoustHostView = ArenaHostView<JoustWorld>;
export type JoustPlayerView = ArenaPlayerView<JoustPlayerState>;

export type JoustInput = { type: 'steer'; angle: number } | { type: 'flap' };
