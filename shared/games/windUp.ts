import type { GameInfo } from '../protocol';
import type { VolleyHostView, VolleyPlayerView } from '../volleys';

export const WIND_UP: GameInfo = {
  id: 'wind-up',
  name: 'Wind-Up Race',
  description: 'Wind up your toy: circle your finger round the key on your phone, as fast as you can, for 10 seconds. Faster circles store more. Then all the toys let go and walk. Farthest wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Farthest walk wins.' }],
};

// A volleys game (see shared/volleys.ts) with one volley a round: the aiming is the winding (the
// phone counts it up and sends it), and the shot is the walk, worked out from it.

export const WIND_MS = 10_000;
/** The walk plays for this long on the TV. */
export const WALK_MS = 6_000;
/** Winding: a radian round the key stores this much, up to twice as much going fast (FAST rad/s or more). */
export const FAST = 14;
/** Nobody can wind faster than this (rad/s); the server caps what a phone claims. */
export const MAX_RATE = 40;
/** Metres walked per unit of energy. */
export const METRES_PER_ENERGY = 0.12;
/** Lane size (board units). */
export const BOARD_W = 1400;
export const BOARD_H = 150;

/** Energy from turning `dTheta` radians at `rate` rad/s. */
export const windEnergy = (dTheta: number, rate: number) => Math.abs(dTheta) * (1 + Math.min(1, rate / FAST));

/** How far a toy's gone `t` of the way (0 to 1) through its walk: quick at first, winding down. */
export const walked = (distance: number, t: number) => distance * (1 - (1 - Math.min(1, t)) ** 2);

export interface WindAim {
  energy: number;
}

export interface WindBoardState {
  energy: number;
  /** After the walk: how far (metres). */
  distance: number;
  walking: boolean;
}

export interface WindPlayerState {
  energy: number;
  distance: number;
}

export type WindHostView = VolleyHostView<WindBoardState>;
export type WindPlayerView = VolleyPlayerView<WindPlayerState>;

export type WindInput = { type: 'aim' | 'fire'; energy: number };
