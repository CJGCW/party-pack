import {
  BOARD_W,
  BUBBLE_BRAWL,
  BUBBLE_D,
  BUBBLE_R,
  CEILING_EVERY_MS,
  COLOR_COUNT,
  DEAD_ROW,
  MATCH,
  MAX_AIM,
  ROUND_MS,
  ROW_H,
  SHOOTER_X,
  SHOOTER_Y,
  SHOT_SPEED,
  START_ROWS,
  TICK_HZ,
  TOP,
  cellCenter,
  neighbours,
  rowLength,
  type BubbleBoardState,
  type BubbleInput,
  type BubblePlayerState,
} from '../../shared/games/bubbleBrawl';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

/** The grid has room for a couple of rows past the line (where a board's lost). */
const GRID_ROWS = DEAD_ROW + 2;
/** Shots move in this many small steps a tick, so they can't pass through a bubble. */
const SUBSTEPS = 4;
/** At most this much garbage lands after one shot (the rest waits for the next). */
const MAX_GARBAGE_AT_ONCE = 8;

export interface Bubbles {
  random: () => number;
  /** Colour index per cell, -1 empty. */
  grid: number[][];
  drops: number;
  aim: number;
  current: number;
  next: number;
  shot: { x: number; y: number; vx: number; vy: number; color: number } | null;
  incoming: number;
  popped: number;
  sent: number;
  burstId: number;
  burst: number[];
}

/** Everyone's board starts the same (and their bubbles come in the same order, while the colours on the board match). */
export function newBubbles(seed: number): Bubbles {
  const layout = seededRandom(seed);
  const grid = Array.from({ length: GRID_ROWS }, (_, r) => Array.from({ length: rowLength(r) }, () => (r < START_ROWS ? Math.floor(layout() * COLOR_COUNT) : -1)));
  const b: Bubbles = { random: seededRandom(seed + 1), grid, drops: 0, aim: 0, current: 0, next: 0, shot: null, incoming: 0, popped: 0, sent: 0, burstId: 0, burst: [] };
  b.current = pickColor(b);
  b.next = pickColor(b);
  return b;
}

/** A colour for the next bubble: one that's still on the board (any, once it's clear). */
function pickColor(b: Bubbles) {
  const present = [...new Set(b.grid.flat().filter((c) => c >= 0))];
  const pool = present.length ? present.sort() : [...Array(COLOR_COUNT).keys()];
  return pool[Math.floor(b.random() * pool.length)];
}

const filled = (b: Bubbles, r: number, c: number) => (b.grid[r]?.[c] ?? -1) >= 0;

export function aimAt(b: Bubbles, angle: number) {
  b.aim = Math.max(-MAX_AIM, Math.min(MAX_AIM, angle));
}

export function fireShot(b: Bubbles) {
  if (b.shot) return false;
  b.shot = { x: SHOOTER_X, y: SHOOTER_Y, vx: Math.sin(b.aim) * SHOT_SPEED, vy: -Math.cos(b.aim) * SHOT_SPEED, color: b.current };
  b.current = b.next;
  b.next = pickColor(b);
  return true;
}

export function swap(b: Bubbles) {
  [b.current, b.next] = [b.next, b.current];
}

/** Is any bubble over the line? */
export function overLine(b: Bubbles) {
  return b.grid.some((row, r) => r + b.drops >= DEAD_ROW && row.some((c) => c >= 0));
}

/** Pops the match at (row, col), if it's big enough, and drops whatever's left hanging. Returns how many dropped. */
function settle(b: Bubbles, row: number, col: number): number {
  const color = b.grid[row][col];
  const match: [number, number][] = [[row, col]];
  const seen = new Set([`${row},${col}`]);
  for (let i = 0; i < match.length; i++) {
    for (const [r, c] of neighbours(...match[i])) {
      if (b.grid[r]?.[c] !== color || seen.has(`${r},${c}`)) continue;
      seen.add(`${r},${c}`);
      match.push([r, c]);
    }
  }
  if (match.length < MATCH) return 0;
  b.burst = [];
  b.burstId++;
  for (const [r, c] of match) {
    b.burst.push(r, c, b.grid[r][c], 0);
    b.grid[r][c] = -1;
  }
  b.popped += match.length;
  // Anything no longer hanging from the ceiling falls.
  const held = new Set<string>();
  const todo: [number, number][] = b.grid[0].map((c, i) => [0, i] as [number, number]).filter(([r, c]) => filled(b, r, c));
  for (const [r, c] of todo) held.add(`${r},${c}`);
  for (let i = 0; i < todo.length; i++) {
    for (const [r, c] of neighbours(...todo[i])) {
      if (!filled(b, r, c) || held.has(`${r},${c}`)) continue;
      held.add(`${r},${c}`);
      todo.push([r, c]);
    }
  }
  let dropped = 0;
  b.grid.forEach((rowCells, r) =>
    rowCells.forEach((c, i) => {
      if (c < 0 || held.has(`${r},${i}`)) return;
      b.burst.push(r, i, c, 1);
      rowCells[i] = -1;
      dropped++;
    }),
  );
  return dropped;
}

/** Garbage lands: each bubble on the bottom of a random column, in a random colour. */
function landGarbage(b: Bubbles) {
  const n = Math.min(MAX_GARBAGE_AT_ONCE, b.incoming);
  b.incoming -= n;
  for (let k = 0; k < n; k++) {
    const col = Math.floor(b.random() * rowLength(0));
    for (let r = 0; r < GRID_ROWS; r++) {
      const c = Math.min(col, rowLength(r) - 1);
      if (filled(b, r, c)) continue;
      if (r === 0 || neighbours(r, c).some(([nr, nc]) => nr === r - 1 && filled(b, nr, nc))) b.grid[r][c] = Math.floor(b.random() * COLOR_COUNT);
      break;
    }
  }
}

/** Where a shot at (x, y) sticks: the nearest empty cell it can hang from. */
function snap(b: Bubbles, x: number, y: number): [number, number] {
  let best: [number, number] = [0, 0];
  let bestD = Infinity;
  const around = Math.round((y - TOP - BUBBLE_R) / ROW_H) - b.drops;
  for (let r = Math.max(0, around - 1); r <= Math.min(GRID_ROWS - 1, around + 1); r++) {
    for (let c = 0; c < rowLength(r); c++) {
      if (filled(b, r, c)) continue;
      if (r > 0 && !neighbours(r, c).some(([nr, nc]) => filled(b, nr, nc))) continue;
      const p = cellCenter(r, c, b.drops);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) [best, bestD] = [[r, c], d];
    }
  }
  return best;
}

/**
 * Moves the board on by `dt` seconds, `ms` into the round. Returns how many bubbles dropped (to
 * send as garbage) and whether the board's lost.
 */
export function stepBubbles(b: Bubbles, dt: number, ms: number): { dropped: number; lost: boolean } {
  let dropped = 0;
  b.drops = Math.max(b.drops, Math.floor(ms / CEILING_EVERY_MS));
  const shot = b.shot;
  if (shot) {
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS && b.shot; s++) {
      shot.x += shot.vx * h;
      shot.y += shot.vy * h;
      if (shot.x < BUBBLE_R) [shot.x, shot.vx] = [2 * BUBBLE_R - shot.x, Math.abs(shot.vx)];
      if (shot.x > BOARD_W - BUBBLE_R) [shot.x, shot.vx] = [2 * (BOARD_W - BUBBLE_R) - shot.x, -Math.abs(shot.vx)];
      const ceiling = TOP + b.drops * ROW_H + BUBBLE_R;
      const touching =
        shot.y <= ceiling ||
        b.grid.some((row, r) => row.some((c, i) => c >= 0 && Math.hypot(cellCenter(r, i, b.drops).x - shot.x, cellCenter(r, i, b.drops).y - shot.y) < BUBBLE_D * 0.85));
      if (!touching) continue;
      const [r, c] = snap(b, shot.x, Math.max(shot.y, ceiling));
      b.grid[r][c] = shot.color;
      b.shot = null;
      dropped = settle(b, r, c);
      landGarbage(b);
    }
  }
  return { dropped, lost: overLine(b) };
}

class BubbleBrawl extends BoardsGame<Bubbles, BubbleBoardState, BubblePlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 1, lastOneStanding: true });
  }

  protected newBoard(seed: number) {
    return newBubbles(seed);
  }

  protected stepBoard(b: Bubbles, dt: number, roundMs: number) {
    const { dropped, lost } = stepBubbles(b, dt, roundMs);
    if (dropped && this.sendGarbage(b, dropped)) b.sent += dropped;
    return lost;
  }

  protected receiveGarbage(b: Bubbles, amount: number) {
    b.incoming += amount;
  }

  protected boardInput(b: Bubbles, raw: unknown) {
    const input = raw as BubbleInput;
    if (input.type === 'steer' && Number.isFinite(input.angle)) aimAt(b, input.angle);
    else if (input.type === 'fire' && this.phase === 'play') return fireShot(b);
    else if (input.type === 'swap') {
      swap(b);
      return true;
    }
    return false;
  }

  /** Bubbles popped (shown on the TV). */
  protected boardScore(b: Bubbles) {
    return b.popped;
  }

  protected hostState(b: Bubbles): BubbleBoardState {
    return {
      grid: b.grid.map((row) => row.map((c) => (c < 0 ? '.' : String(c))).join('')).join(''),
      rows: GRID_ROWS,
      drops: b.drops,
      aim: Math.round(b.aim * 1000) / 1000,
      current: b.current,
      next: b.next,
      shot: b.shot ? [Math.round(b.shot.x), Math.round(b.shot.y), b.shot.color] : null,
      incoming: b.incoming,
      burstId: b.burstId,
      burst: b.burst,
    };
  }

  protected playerState(b: Bubbles): BubblePlayerState {
    return { current: b.current, next: b.next, popped: b.popped, sent: b.sent, incoming: b.incoming };
  }
}

export const bubbleBrawl: MiniGameDefinition = {
  info: BUBBLE_BRAWL,
  create: (ctx, _modeId, options) => new BubbleBrawl(ctx, options.puzzles),
};
