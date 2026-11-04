import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const WALKER_RESCUE: GameInfo = {
  id: 'walker-rescue',
  name: 'Walker Rescue',
  description: 'Little walkers march out of a door and keep walking, whatever is ahead. Pick a skill on your phone (block, dig, build steps, float) and tap a walker to give it to them, to get as many as you can to the exit. Same level for everyone; most saved wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Most walkers saved wins (quicker breaks ties).' }],
};

// A side-by-side boards game (see shared/boards.ts) with the level on the phone, scored by best
// score. The level's a grid of cells ('#' earth, 'S' steel that can't be dug, '.' air); walkers
// stand on the cell below their feet. The server steps everyone's walkers; the TV and phones draw
// CELL pixels a cell.

export const ROUND_MS = 100_000;
export const TICK_HZ = 15;
export const COLS = 80;
export const ROWS = 45;
export const CELL = 8;
export const WALKERS = 12;
/** A new walker comes out this often. */
export const RELEASE_MS = 1_400;
/** A fall further than this (cells) is the end of a walker (unless it's floating). */
export const SAFE_FALL = 12;
/** A builder lays this many steps. */
export const STEPS = 12;
/** Points for each walker saved; finishing early adds a point a second left. */
export const SAVE_POINTS = 100;

export type Skill = 'block' | 'dig' | 'build' | 'float';
export const SKILLS: Skill[] = ['block', 'dig', 'build', 'float'];

export interface WalkerLevel {
  name: string;
  /** Rectangles of earth ('#') or steel ('S'): x, y, width, height (cells). */
  earth: [number, number, number, number, '#' | 'S'][];
  door: { x: number; y: number };
  exit: { x: number; y: number };
  skills: Partial<Record<Skill, number>>;
}

export const WALKER_LEVELS: WalkerLevel[] = [
  {
    name: 'Dig Down',
    earth: [
      [0, 18, 80, 3, '#'],
      [0, 10, 3, 8, 'S'],
      [77, 10, 3, 8, 'S'],
      [0, 29, 80, 16, '#'],
    ],
    door: { x: 8, y: 17 },
    exit: { x: 70, y: 28 },
    skills: { dig: 2, block: 1 },
  },
  {
    name: 'Mind the Gap',
    earth: [
      [0, 30, 34, 15, '#'],
      [44, 30, 36, 15, '#'],
      [76, 22, 4, 8, 'S'],
      [0, 22, 3, 8, 'S'],
    ],
    door: { x: 8, y: 29 },
    exit: { x: 70, y: 29 },
    skills: { build: 3, block: 2 },
  },
  {
    name: 'Over the Wall',
    earth: [
      [0, 32, 80, 13, '#'],
      [36, 26, 6, 6, 'S'],
      [0, 24, 3, 8, 'S'],
      [77, 24, 3, 8, 'S'],
    ],
    door: { x: 8, y: 31 },
    exit: { x: 66, y: 31 },
    skills: { build: 3, block: 2, float: 2 },
  },
];

/** The level's starting grid, row by row. */
export function levelGrid(level: WalkerLevel): string[] {
  const grid = Array.from({ length: ROWS }, () => new Array<string>(COLS).fill('.'));
  for (const [x, y, w, h, ch] of level.earth) for (let j = y; j < y + h && j < ROWS; j++) for (let i = x; i < x + w && i < COLS; i++) grid[j][i] = ch;
  return grid.map((row) => row.join(''));
}

export interface WalkerView {
  id: number;
  x: number;
  y: number;
  dir: 1 | -1;
  /** 'walk', 'fall', a skill being used, or how it ended. */
  doing: 'walk' | 'fall' | 'block' | 'dig' | 'build' | 'saved' | 'dead';
  floater: boolean;
}

export interface RescueState {
  level: number;
  grid: string;
  walkers: WalkerView[];
  saved: number;
  lost: number;
  out: number;
  skills: Partial<Record<Skill, number>>;
}

export type RescueHostView = BoardsHostView<RescueState>;
export type RescuePlayerView = BoardsPlayerView<RescueState>;

export type RescueInput = { type: 'skill'; skill: Skill; walker: number };
