import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const BRICK_BASH: GameInfo = {
  id: 'brick-bash',
  name: 'Brick Bash',
  description: 'Everyone gets the same wall of bricks. Turn your phone to slide your paddle and keep the ball in play; every brick it smashes counts. Lose the ball and you wait 3 seconds for another. Most bricks in 90 seconds wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    { id: 'standard', name: 'Standard', description: 'Most bricks in 90 seconds wins; clear the wall for a time bonus.' },
    { id: 'garbage', name: 'Garbage', description: 'Every 5 bricks you smash adds a row to a rival’s wall. A wall that reaches the line ends that run.' },
  ],
};

// A side-by-side boards game (see shared/boards.ts), scored by best score (bricks smashed). Board
// units: BOARD_W × BOARD_H. The wall's rows of COLS bricks hang from WALL_Y; a garbage row pushes
// the whole wall down one.

export const ROUND_MS = 90_000;
export const TICK_HZ = 30;
export const BOARD_W = 480;
export const BOARD_H = 680;
/** A strip across the top for the player's name. */
export const TOP = 44;
export const COLS = 10;
export const BRICK_W = BOARD_W / COLS;
export const BRICK_H = 24;
export const WALL_Y = TOP + 40;
export const START_ROWS = 7;
/** A brick reaching down past this ends the run (garbage mode). */
export const DANGER_Y = 470;
export const PADDLE_Y = BOARD_H - 50;
export const PADDLE_W = 96;
export const PADDLE_H = 16;
export const BALL_R = 9;
/** The ball starts at BALL_SPEED and speeds up by this much a second, to MAX_BALL_SPEED. */
export const BALL_SPEED = 430;
export const BALL_SPEEDUP = 2.5;
export const MAX_BALL_SPEED = 680;
/** Losing the ball: a new one after this long. */
export const SERVE_MS = 3_000;
/** Garbage mode: this many bricks smashed sends a row. */
export const BRICKS_PER_ROW = 5;
/** Full steering is this far round (radians). */
export const STEER_FULL = 0.8;
/** The ball comes off the paddle at up to this angle from straight up, by where it hits. */
export const MAX_BOUNCE = 1.05;

/** Bricks' colours by how tough they are: one hit, two hits, and a garbage brick. */
export const BRICK_COLORS: Record<string, string> = { '1': '#5ec8f2', '2': '#b48cff', g: '#9a93b8' };

// ---- Views ---------------------------------------------------------------------------------

export interface BashBoardState {
  /** The wall, row by row from the top, COLS a row: '.' gone, '1'/'2' hits left, 'g' garbage. */
  wall: string;
  paddle: number;
  ball: [number, number] | null;
  /** Waiting for a new ball: how long to go (ms), else 0. */
  serveIn: number;
  smashed: number;
  /** Rows on their way here (garbage mode). */
  incoming: number;
  cleared: boolean;
}

export interface BashPlayerState {
  smashed: number;
  lost: number;
  sent: number;
  garbage: boolean;
}

export type BashHostView = BoardsHostView<BashBoardState>;
export type BashPlayerView = BoardsPlayerView<BashPlayerState>;

export type BashInput = { type: 'steer'; angle: number };
