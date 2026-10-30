import type { GameInfo, GiveUpView } from '../protocol';

export const MAZE_RACE: GameInfo = {
  id: 'maze-race',
  name: 'Maze Race',
  description: 'Everyone gets the same random maze on their phone. Drag your way from the top corner to the exit first.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '90 seconds per maze.' }],
};

/** The maze's size in cells: taller than wide, to fill a phone held upright. */
export const MAZE_COLS = 12;
export const MAZE_ROWS = 18;

// Each cell's open sides, as bits. A maze is one of these per cell, row by row (index = row * cols + col).
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
const BIT: Record<Dir, number> = { N, E, S, W };
const OPPOSITE: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };

export interface Maze {
  cols: number;
  rows: number;
  /** Each cell's open sides (N | E | S | W). */
  open: number[];
  start: number;
  exit: number;
}

/** The cell one step `dir` from `cell`, or -1 if a wall's in the way. */
export function step(maze: Maze, cell: number, dir: Dir) {
  if (!(maze.open[cell] & BIT[dir])) return -1;
  const { cols } = maze;
  return dir === 'N' ? cell - cols : dir === 'S' ? cell + cols : dir === 'E' ? cell + 1 : cell - 1;
}

/**
 * Where a swipe takes you: straight along `dir` until a wall, a turning (a bend or a junction) or
 * the exit. Returns the cells passed through, one per step (empty if a wall's in the way).
 */
export function slide(maze: Maze, from: number, dir: Dir): { cells: number[]; dirs: Dir[] } {
  const cells: number[] = [];
  const dirs: Dir[] = [];
  let cell = from;
  for (let guard = 0; guard < maze.open.length; guard++) {
    const next = step(maze, cell, dir);
    if (next < 0) break;
    cells.push(next);
    dirs.push(dir);
    cell = next;
    if (cell === maze.exit) break;
    // Carry on only while the way ahead is the only way on.
    const ways = DIRS.filter((d) => d !== OPPOSITE[dir] && maze.open[cell] & BIT[d]);
    if (ways.length !== 1 || ways[0] !== dir) break;
  }
  return { cells, dirs };
}

/** Steps from every cell to `target` along the maze (breadth first). */
export function distancesTo(maze: Maze, target: number) {
  const dist = new Array<number>(maze.open.length).fill(-1);
  dist[target] = 0;
  const queue = [target];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    for (const d of DIRS) {
      const next = step(maze, cell, d);
      if (next >= 0 && dist[next] < 0) {
        dist[next] = dist[cell] + 1;
        queue.push(next);
      }
    }
  }
  return dist;
}

/** The shortest way from `from` to the exit, as cells (both ends included). */
export function shortestPath(maze: Maze, from = maze.start) {
  const dist = distancesTo(maze, maze.exit);
  const path = [from];
  let cell = from;
  while (cell !== maze.exit && dist[cell] > 0) {
    cell = DIRS.map((d) => step(maze, cell, d)).find((n) => n >= 0 && dist[n] === dist[cell] - 1)!;
    path.push(cell);
  }
  return path;
}

/**
 * 'ready': a countdown, so everyone starts together (the maze isn't shown yet).
 * 'race': everyone works through the maze on their phone, against the clock.
 * 'reveal': the maze with the shortest way through, everyone's trail and points.
 * 'gameEnd': round scores.
 */
export type MazePhase = 'ready' | 'race' | 'reveal' | 'gameEnd';

export interface MazeHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  gamePoints: number;
  /** How far along they are: 0 at the start, 1 at the exit (by steps left on the shortest way). */
  progress: number;
  /** Their place if they've reached the exit (1 for first), else null. */
  place: number | null;
  /** Seconds it took them, if they finished. */
  finishMs: number | null;
  gaveUp: boolean;
  /** At the reveal: every cell they went through, in order. */
  trail: number[] | null;
  points: number;
}

export interface MazeHostView {
  phase: MazePhase;
  puzzleNumber: number;
  totalPuzzles: number;
  msLeft: number;
  phaseMs: number;
  /** Shown once the race starts. */
  maze: Maze | null;
  /** At the reveal: the shortest way through. */
  solution: number[] | null;
  players: MazeHostPlayer[];
}

export interface MazePlayerView extends GiveUpView {
  phase: MazePhase;
  puzzleNumber: number;
  totalPuzzles: number;
  msLeft: number;
  maze: Maze | null;
  /** Where the server has them, and the last move message it's applied (see MazeInput). */
  pos: number;
  seq: number;
  /** Cells they've been through (for their trail). */
  trail: number[];
  place: number | null;
  finishMs: number | null;
  /** How many have reached the exit so far. */
  finished: number;
  points: number;
  gamePoints: number;
  score: number;
  solution: number[] | null;
}

/**
 * Steps taken from `from` (the phone moves you straight away and sends the steps after).
 * `seq` counts up with each message; if `from` isn't where the server has you, none of it counts
 * and the server sends back where you are.
 */
export type MazeInput = { type: 'move'; seq: number; from: number; dirs: Dir[] };
