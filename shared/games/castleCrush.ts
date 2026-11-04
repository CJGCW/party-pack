import type { GameInfo } from '../protocol';
import type { Recording, VolleyHostView, VolleyPlayerView } from '../volleys';

export const CASTLE_CRUSH: GameInfo = {
  id: 'castle-crush',
  name: 'Castle Crush',
  description: 'Everyone gets their own copy of the same castle and a catapult. Turn your phone to aim, pull back to set the power and let go to fire. Three shots a round: knock blocks down and topple the crowned guards. Most damage wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Three shots a round; most damage wins.' }],
};

// A volleys game (see shared/volleys.ts). The world's in metres, y up, WORLD_W × WORLD_H, with the
// ground at y = 0; the TV draws it PX pixels a metre (y down), so a board is BOARD_W × BOARD_H.

export const SHOTS = 3;
export const AIM_MS = 20_000;
export const WORLD_W = 32;
export const WORLD_H = 18;
export const PX = 30;
export const BOARD_W = WORLD_W * PX;
export const BOARD_H = WORLD_H * PX;
export const GRAVITY = 10;
/** Where stones leave the catapult. */
export const LAUNCH = { x: 3.2, y: 2.4 };
export const STONE_R = 0.35;
/** A hill between the catapult and the castle (its outline, world metres), so shots have to go over. */
export const HILL: [number, number][] = [
  [8.5, 0],
  [10.6, 3.4],
  [12.4, 3.4],
  [14.5, 0],
];
/** Aim: elevation between these (radians), and power 0 to 1 giving a speed between these (m/s). */
export const MIN_ELEVATION = 0.15;
export const MAX_ELEVATION = 1.35;
export const MIN_SPEED = 9;
export const MAX_SPEED = 25;
/** Full steering on the phone is this far round (radians) either way from the middle. */
export const STEER_FULL = 0.7;
/** A block knocked this far (metres) or turned this much (radians) from where it stood counts. */
export const KNOCK_MOVE = 0.5;
export const KNOCK_TURN = 0.35;
/** Points: each block knocked, each guard toppled. */
export const BLOCK_POINTS = 10;
export const GUARD_POINTS = 50;

export const launchSpeed = (power: number) => MIN_SPEED + Math.max(0, Math.min(1, power)) * (MAX_SPEED - MIN_SPEED);

/** Board pixels from world metres (y flips). */
export const toBoard = (x: number, y: number) => ({ x: x * PX, y: (WORLD_H - y) * PX });

/** Where a stone fired with this aim is `t` seconds out, before it hits anything (world metres). */
export function flightAt(elevation: number, power: number, t: number) {
  const v = launchSpeed(power);
  return { x: LAUNCH.x + Math.cos(elevation) * v * t, y: LAUNCH.y + Math.sin(elevation) * v * t - 0.5 * GRAVITY * t * t };
}

// ---- Views ---------------------------------------------------------------------------------

/** A thing on the board, where it stands now (board pixels, y down; angle in radians, clockwise). */
export interface Piece {
  id: number;
  kind: 'block' | 'slab' | 'guard' | 'stone';
  /** Half-width and half-height (a guard or stone: its radius twice). */
  hw: number;
  hh: number;
  x: number;
  y: number;
  a: number;
  /** Knocked (a block) or toppled (a guard). */
  down: boolean;
}

export interface CastleAim {
  elevation: number;
  power: number;
}

export interface CastleBoardState {
  pieces: Piece[];
  aim: CastleAim;
  shotsLeft: number;
  knocked: number;
  guardsDown: number;
  guards: number;
  /** While shots fly: this board's last shot. */
  shot: Recording | null;
}

export interface CastlePlayerState {
  aim: CastleAim;
  shotsLeft: number;
  knocked: number;
  guardsDown: number;
  guards: number;
}

export type CastleHostView = VolleyHostView<CastleBoardState>;
export type CastlePlayerView = VolleyPlayerView<CastlePlayerState>;

export type CastleInput = ({ type: 'aim' } | { type: 'fire' }) & CastleAim;
