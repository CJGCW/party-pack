import type { Recording, VolleyHostView, VolleyPlayerView } from '../volleys';

// Tank Yard's Gravity mode: a volleys game (see shared/volleys.ts) where everyone's tank sits on a
// planet in one shared bit of space. Everyone aims at once; then all the shells fly together,
// curving round the planets. Its views carry `asGame: GRAVITY_UI` so the TV and phones use its own
// screens. Units are TV-ish pixels: the space is SPACE_W × SPACE_H.

export const GRAVITY_UI = 'tank-gravity';
export const VOLLEYS = 4;
export const AIM_MS = 15_000;
export const SPACE_W = 1600;
export const SPACE_H = 900;
export const TANK_R = 22;
export const HP = 100;
/** Gravity's pull: a planet of radius r pulls G·r²/d² (with a little softening). */
export const G = 260;
/** Power 0 to 1 gives a speed between these. */
export const MIN_SPEED = 220;
export const MAX_SPEED = 720;
/** A shell flies at most this long. */
export const FLIGHT_S = 7;
/** A blast: its radius, and the damage at its middle (less further out); a direct hit adds more. */
export const BLAST_R = 70;
export const BLAST_DAMAGE = 35;
export const DIRECT_HIT = 30;

export interface Planet {
  x: number;
  y: number;
  r: number;
  color: number;
}

export interface GravityAim {
  /** Direction (radians, 0 right, clockwise) and power (0 to 1). */
  angle: number;
  power: number;
}

/** A tank: where it sits (its planet and the angle round it). */
export interface GravityTankView {
  x: number;
  y: number;
  /** Which way is up for it (radians). */
  up: number;
  hp: number;
  aim: GravityAim;
  dealt: number;
}

export interface GravityRound {
  planets: Planet[];
  /** While the shells fly: their recording (one track a shell), and the blasts (frame, x, y). */
  shot: Recording | null;
  blasts: number[];
}

export interface GravityPlayerState {
  hp: number;
  dealt: number;
  aim: GravityAim;
}

export type GravityHostView = VolleyHostView<GravityTankView, GravityRound>;
export type GravityPlayerView = VolleyPlayerView<GravityPlayerState>;

export type GravityInput = ({ type: 'aim' } | { type: 'fire' }) & GravityAim;

/** Gravity's pull at (x, y) from the planets. */
export function pull(planets: Planet[], x: number, y: number) {
  let ax = 0;
  let ay = 0;
  for (const p of planets) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy + 400;
    const a = (G * p.r * p.r) / d2;
    const d = Math.sqrt(d2);
    ax += (a * dx) / d;
    ay += (a * dy) / d;
  }
  return { ax, ay };
}

export const shellSpeed = (power: number) => MIN_SPEED + Math.max(0, Math.min(1, power)) * (MAX_SPEED - MIN_SPEED);
