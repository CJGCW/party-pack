import type { ArenaHostView, ArenaPlayerView } from '../arena';
import type { GameInfo } from '../protocol';

export const FRUIT_RUSH: GameInfo = {
  id: 'fruit-rush',
  name: 'Fruit Rush',
  description: 'Fruit falls into the yard: tilt your phone to roll about and grab it. Golden fruit is worth five. Ram the others to make them drop theirs. Most fruit in 60 seconds wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Most fruit in 60 seconds wins.' }],
};

// A shared arena game (see shared/arena.ts), scored by the best. Fruit lands at the same places
// and times for everyone (from the round's seed).

export const ROUND_MS = 60_000;
export const TICK_HZ = 30;
export const WORLD = 1000;
export const PLAYER_R = 38;
export const FRUIT_R = 22;
export const ACCEL = 1400;
export const FRICTION = 1.1;
export const MAX_SPEED = 680;
export const DEAD_ZONE = 0.06;
/** Bumps bounce apart a bit harder than they hit; one this hard (closing speed) knocks fruit loose. */
export const BUMP = 1.2;
export const KNOCK_SPEED = 380;
/** Fruit lands every FRUIT_EVERY_MS, after falling (a growing shadow) for FALL_MS; one in GOLD_EVERY is golden. */
export const FRUIT_EVERY_MS = 450;
export const FALL_MS = 900;
export const GOLD_EVERY = 9;
export const GOLD_POINTS = 5;

// ---- Views ---------------------------------------------------------------------------------

export interface FruitView {
  id: number;
  x: number;
  y: number;
  gold: boolean;
  /** Still falling: 0 just appeared to 1 landing. */
  falling: number;
}

export interface FruitWorld {
  fruit: FruitView[];
  players: { playerId: string; color: string; x: number; y: number; score: number }[];
}

export type FruitHostView = ArenaHostView<FruitWorld>;
export type FruitPlayerView = ArenaPlayerView<{ score: number }>;
