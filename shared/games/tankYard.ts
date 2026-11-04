import type { ArenaHostView, ArenaPlayerView } from '../arena';
import type { GameInfo } from '../protocol';
import type { StickInput } from './blastGrid';

export const TANK_YARD: GameInfo = {
  id: 'tank-yard',
  name: 'Tank Yard',
  description: 'Top-down tanks in a walled yard. Drag to drive (your tank turns to face the way you push) and tap to fire straight ahead. Shells bounce once off walls, so watch your own! Three hits and you are out. Last tank rolling wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    { id: 'arena', name: 'Arena', description: 'Three hits and you are out; last tank wins.' },
    { id: 'gravity', name: 'Gravity', description: 'Tanks on planets: everyone aims at once, then all the shells fly together, curving round the planets. Most damage wins.' },
    { id: 'both', name: 'Both', description: 'Arena and Gravity, turn about.' },
  ],
};

// A shared arena game (see shared/arena.ts), scored by survival. The yard's 1600 × 900, laid out
// on a 16 × 9 grid of 100-unit blocks, picked from LAYOUTS by the round's seed.

export const ROUND_MS = 90_000;
export const TICK_HZ = 30;
export const WORLD_W = 1600;
export const WORLD_H = 900;
export const BLOCK = 100;
export const TANK_R = 32;
export const HITS = 3;
/** Driving: top speed, and how fast a tank turns to face the stick (radians a second). */
export const TANK_SPEED = 260;
export const TURN_RATE = 4.2;
/** Shells: speed, how many a tank can have out at once, and the wait between shots. */
export const SHELL_SPEED = 620;
export const SHELL_R = 8;
export const MAX_SHELLS = 3;
export const RELOAD_MS = 450;
/** After a hit, a tank can't be hit again for this long. */
export const HIT_SAFE_MS = 900;

/**
 * The yards: '#' a wall block, '1'–'8' where tanks start (in that order), '.' open. Each is
 * 16 × 9 and has walls all round.
 */
export const LAYOUTS: string[][] = [
  [
    '################',
    '#1.....5#.....3#',
    '#.##........##.#',
    '#.#...#..#...#.#',
    '#7.#........#.8#',
    '#.#...#..#...#.#',
    '#.##........##.#',
    '#4.....#6.....2#',
    '################',
  ],
  [
    '################',
    '#1....#5.#....3#',
    '#..##......##..#',
    '#..#...##...#..#',
    '#7.#........#.8#',
    '#..#...##...#..#',
    '#..##......##..#',
    '#4....#.6#....2#',
    '################',
  ],
  [
    '################',
    '#1......#5....3#',
    '#.####.....##..#',
    '#......##......#',
    '#7..#......#..8#',
    '#......##......#',
    '#..##.....####.#',
    '#4....6#......2#',
    '################',
  ],
];

// ---- Views ---------------------------------------------------------------------------------

export interface TankView {
  playerId: string;
  color: string;
  x: number;
  y: number;
  heading: number;
  hits: number;
  alive: boolean;
  /** Just hit: it flashes. */
  safe: boolean;
}

export interface TankWorld {
  layout: number;
  tanks: TankView[];
  shells: { id: number; x: number; y: number; color: string }[];
  /** Shells that went off this update (where), for a puff on the TV. */
  bursts: { x: number; y: number }[];
}

export interface TankPlayerState {
  hitsLeft: number;
  shellsReady: number;
}

export type TankHostView = ArenaHostView<TankWorld>;
export type TankPlayerView = ArenaPlayerView<TankPlayerState>;

export type TankInput = StickInput | { type: 'fire' };
