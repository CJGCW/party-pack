import { E, MAZE_COLS, MAZE_ROWS, N, S, W, type Maze } from '../../../shared/games/mazeRace';

/** Of the walls left once the maze is carved, the share knocked down too: a few loops, so there's more than one way through. */
const LOOP_SHARE = 0.06;

/**
 * A random maze: a randomised depth-first search carves long winding corridors that reach every
 * cell, then a few extra walls come down to make loops. Starts top left, exits bottom right.
 */
export function generateMaze(cols = MAZE_COLS, rows = MAZE_ROWS, random = Math.random): Maze {
  const open = new Array<number>(cols * rows).fill(0);
  const visited = new Array<boolean>(cols * rows).fill(false);
  /** The neighbours of a cell: [cell, side opened here, side opened there]. */
  const neighbours = (cell: number): [number, number, number][] => {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    const out: [number, number, number][] = [];
    if (r > 0) out.push([cell - cols, N, S]);
    if (c < cols - 1) out.push([cell + 1, E, W]);
    if (r < rows - 1) out.push([cell + cols, S, N]);
    if (c > 0) out.push([cell - 1, W, E]);
    return out;
  };

  const stack = [0];
  visited[0] = true;
  while (stack.length) {
    const cell = stack[stack.length - 1];
    const fresh = neighbours(cell).filter(([n]) => !visited[n]);
    if (fresh.length === 0) {
      stack.pop();
      continue;
    }
    const [next, here, there] = fresh[Math.floor(random() * fresh.length)];
    open[cell] |= here;
    open[next] |= there;
    visited[next] = true;
    stack.push(next);
  }

  // Knock down some of the walls left (each counted once: east and south sides only).
  for (let cell = 0; cell < open.length; cell++) {
    for (const [next, here, there] of neighbours(cell)) {
      if ((here !== E && here !== S) || open[cell] & here) continue;
      if (random() < LOOP_SHARE) {
        open[cell] |= here;
        open[next] |= there;
      }
    }
  }

  return { cols, rows, open, start: 0, exit: cols * rows - 1 };
}
