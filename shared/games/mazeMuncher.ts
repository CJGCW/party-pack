import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const MAZE_MUNCHER: GameInfo = {
  id: 'maze-muncher',
  name: 'Maze Muncher',
  description: 'Two minutes in the maze: swipe to steer your muncher, eat every dot, and grab a power pellet to turn the tables on the ghosts. Every power pellet you eat sends an extra ghost into a rival’s maze! Three lives. Most points wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Most points in two minutes wins.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by best score. The maze is a grid:
// '#' wall, '.' dot, 'o' power pellet, ' ' empty, 'P' where you start, 'G' where ghosts start.
// Positions are in tiles (a tile's middle is a whole number). The TV draws TILE pixels a tile.

export const ROUND_MS = 120_000;
export const TICK_HZ = 20;
export const TILE = 32;
export const MAZE = [
  '#################',
  '#o.....#.#.....o#',
  '#.##.#.#.#.#.##.#',
  '#...............#',
  '#.##.#.###.#.##.#',
  '#....#..#..#....#',
  '####.##.#.##.####',
  '####.#  G  #.####',
  '####.# #.# #.####',
  '#.......P.......#',
  '#.##.###.###.##.#',
  '#o.#.........#.o#',
  '##.#.#.###.#.#.##',
  '#....#..#..#....#',
  '#################',
];
export const COLS = MAZE[0].length;
export const ROWS = MAZE.length;
export const LIVES = 3;
export const SPEED = 6;
export const GHOST_SPEED = 5;
export const SCARED_SPEED = 3.2;
export const SCARED_MS = 7_000;
export const DOT_POINTS = 10;
export const PELLET_POINTS = 50;
export const FRUIT_POINTS = 300;
export const CLEAR_BONUS = 500;
/** Eating ghosts while they're scared scores this, doubling for each in a row. */
export const GHOST_POINTS = 200;
/** A rival's pellets can add up to this many extra ghosts to your maze. */
export const MAX_EXTRA_GHOSTS = 3;

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const isWall = (x: number, y: number) => (MAZE[y]?.[x] ?? '#') === '#';
export const findIn = (ch: string) => {
  const y = MAZE.findIndex((row) => row.includes(ch));
  return { x: MAZE[y].indexOf(ch), y };
};

export interface GhostView {
  x: number;
  y: number;
  scared: boolean;
  /** Its colour (by index), or extra (sent by a rival). */
  kind: number;
}

export interface MuncherState {
  x: number;
  y: number;
  dir: Dir;
  /** Dots and pellets left (as a string over the maze's cells: '.', 'o' or ' '). */
  dots: string;
  ghosts: GhostView[];
  fruit: boolean;
  lives: number;
  /** Ghosts on their way from rivals. */
  incoming: number;
  scaredMs: number;
}

export type MuncherHostView = BoardsHostView<MuncherState>;
export type MuncherPlayerView = BoardsPlayerView<MuncherState>;

export type MuncherInput = { type: 'turn'; dir: Dir };
