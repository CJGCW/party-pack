import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const TILE_TILT: GameInfo = {
  id: 'tile-tilt',
  name: 'Tile Tilt',
  description: 'Tilt your phone like a tray to slide your shell over every tile in the frame. Each one flips to show part of a hidden picture. First to flip them all wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '60 seconds a round.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored as a race. Everyone gets the same
// picture and the same start; the server rolls every shell.

export const ROUND_MS = 60_000;
export const TICK_HZ = 30;

// ---- The board, in its own units (a 1000 × 1000 square) -----------------------------------

export const BOARD_SIZE = 1000;
/** The frame's inside, and its tiles: GRID across and down. */
export const FRAME = { x: 80, y: 80, size: 840 };
export const GRID = 8;
export const TILE = FRAME.size / GRID;
export const SHELL_R = 34;
/** A full tilt pushes the shell this hard (units/s²); it slows by this share a second; it bounces back off the frame this much. */
export const ACCEL = 1600;
export const FRICTION = 1.4;
export const MAX_SPEED = 950;
export const BOUNCE = 0.45;
/** Tilt this small (0 to 1) counts as level, so a hand's tremble doesn't creep the shell about. */
export const DEAD_ZONE = 0.06;

export const PICTURES = ['sun', 'fish', 'rocket', 'flower', 'cat'] as const;
export type Picture = (typeof PICTURES)[number];

/** The round's picture, from its seed. */
export function pictureFor(seed: number): Picture {
  return PICTURES[seed % PICTURES.length];
}

export interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Rolls the shell on by `dt` seconds with the frame tipped by `tilt` (each way -1 to 1). */
export function rollShell(s: Shell, tilt: { x: number; y: number }, dt: number) {
  const dead = (v: number) => (Math.abs(v) < DEAD_ZONE ? 0 : v);
  s.vx += dead(tilt.x) * ACCEL * dt;
  s.vy += dead(tilt.y) * ACCEL * dt;
  const keep = Math.exp(-FRICTION * dt);
  s.vx *= keep;
  s.vy *= keep;
  const speed = Math.hypot(s.vx, s.vy);
  if (speed > MAX_SPEED) {
    s.vx *= MAX_SPEED / speed;
    s.vy *= MAX_SPEED / speed;
  }
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  // Off the frame's sides.
  const lo = FRAME.x + SHELL_R;
  const hi = FRAME.x + FRAME.size - SHELL_R;
  if (s.x < lo) [s.x, s.vx] = [lo, -s.vx * BOUNCE];
  if (s.x > hi) [s.x, s.vx] = [hi, -s.vx * BOUNCE];
  if (s.y < lo) [s.y, s.vy] = [lo, -s.vy * BOUNCE];
  if (s.y > hi) [s.y, s.vy] = [hi, -s.vy * BOUNCE];
}

/** The tile under a point (row * GRID + col). */
export function tileAt(x: number, y: number) {
  const col = Math.max(0, Math.min(GRID - 1, Math.floor((x - FRAME.x) / TILE)));
  const row = Math.max(0, Math.min(GRID - 1, Math.floor((y - FRAME.y) / TILE)));
  return row * GRID + col;
}

// ---- Views ---------------------------------------------------------------------------------

/** One frame, as the TV draws it. */
export interface TiltBoardState {
  x: number;
  y: number;
  /** Which tiles are face up: a number per row, a bit per column. */
  flipped: number[];
}

/** What a player's phone gets. */
export interface TiltPlayerState {
  /** Tiles flipped, out of GRID × GRID. */
  flipped: number;
}

export interface TiltRound {
  picture: Picture;
}

export type TiltHostView = BoardsHostView<TiltBoardState, TiltRound>;
export type TiltPlayerView = BoardsPlayerView<TiltPlayerState>;

/** How the phone's tipped: each way -1 to 1 (x right, y toward the player). */
export type TiltInput = { type: 'tilt'; x: number; y: number };
