import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const BUBBLE_BRAWL: GameInfo = {
  id: 'bubble-brawl',
  name: 'Bubble Brawl',
  description: 'Everyone gets the same cluster of bubbles. Turn your phone to aim, tap FIRE to shoot: three or more of a colour pop, and anything left hanging drops onto a rival. The ceiling comes down every 15 seconds. Bubbles past the line and you are out. Last one standing wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Last one standing wins; dropped bubbles land on your rivals.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by survival. Bubbles sit on a hex grid
// hanging from the ceiling: even rows hold COLS bubbles, odd rows (shifted half a bubble right)
// one fewer. Board units: the board's BOARD_W × BOARD_H, bubbles BUBBLE_D across.

export const ROUND_MS = 120_000;
export const TICK_HZ = 30;
export const COLS = 8;
export const BUBBLE_D = 48;
export const BUBBLE_R = BUBBLE_D / 2;
export const ROW_H = BUBBLE_D * (Math.sqrt(3) / 2);
export const BOARD_W = COLS * BUBBLE_D;
/** A strip across the top for the player's name; the ceiling starts below it. */
export const TOP = 44;
/** Rows a board has room for: a bubble in this row (counting the ceiling's drops) is over the line. */
export const DEAD_ROW = 14;
export const BOARD_H = 730 + TOP;
/** Where shots leave from. */
export const SHOOTER_X = BOARD_W / 2;
export const SHOOTER_Y = BOARD_H - 44;
export const SHOT_SPEED = 1500;
/** Aim's limited to this far either side of straight up (radians). */
export const MAX_AIM = 1.35;
export const COLOR_COUNT = 5;
export const COLORS = ['#ff5d73', '#ffd166', '#4cd37a', '#5ec8f2', '#b48cff'];
/** Rows filled at the start; the ceiling comes down a row every this often. */
export const START_ROWS = 5;
export const CEILING_EVERY_MS = 15_000;
/** Matches this big pop. */
export const MATCH = 3;

export const rowLength = (row: number) => (row % 2 ? COLS - 1 : COLS);

/** The middle of the bubble at (row, col), `drops` rows down from the top. */
export function cellCenter(row: number, col: number, drops = 0) {
  return { x: BUBBLE_R + col * BUBBLE_D + (row % 2 ? BUBBLE_R : 0), y: TOP + BUBBLE_R + (row + drops) * ROW_H };
}

/** The cells touching (row, col). */
export function neighbours(row: number, col: number): [number, number][] {
  const odd = row % 2 === 1;
  const out: [number, number][] = [
    [row, col - 1],
    [row, col + 1],
    [row - 1, odd ? col : col - 1],
    [row - 1, odd ? col + 1 : col],
    [row + 1, odd ? col : col - 1],
    [row + 1, odd ? col + 1 : col],
  ];
  return out.filter(([r, c]) => r >= 0 && c >= 0 && c < rowLength(r));
}

// ---- Views ---------------------------------------------------------------------------------

export interface BubbleBoardState {
  /** The grid, row by row from the top, rows joined: a colour index per cell, '.' for empty. */
  grid: string;
  rows: number;
  drops: number;
  aim: number;
  current: number;
  next: number;
  /** The shot in flight: x, y, colour (or null). */
  shot: [number, number, number] | null;
  /** Garbage on its way to this board. */
  incoming: number;
  /** Counts up each time something pops or drops, with where: row, col, colour, dropped (1/0); four numbers each. */
  burstId: number;
  burst: number[];
}

export interface BubblePlayerState {
  current: number;
  next: number;
  popped: number;
  sent: number;
  incoming: number;
}

export type BubbleHostView = BoardsHostView<BubbleBoardState>;
export type BubblePlayerView = BoardsPlayerView<BubblePlayerState>;

export type BubbleInput = { type: 'steer'; angle: number } | { type: 'fire' } | { type: 'swap' };
