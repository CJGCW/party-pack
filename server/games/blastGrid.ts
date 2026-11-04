import {
  BLAST_GRID,
  CRATE_CHANCE,
  FALL_AT_MS,
  FALL_EVERY_MS,
  FLAME_MS,
  FUSE_MS,
  MAX_BOMBS,
  MAX_RANGE,
  MAX_SPEEDUPS,
  POWERUP_CHANCE,
  ROUND_MS,
  SPEEDUP,
  START_BOMBS,
  START_RANGE,
  TICK_HZ,
  WALK_SPEED,
  gridSize,
  isWall,
  spawns,
  type BlastInput,
  type BlastPlayerState,
  type BlastWorld,
  type Cell,
} from '../../shared/games/blastGrid';
import { ArenaGame } from './arena';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

type PowerUp = 'b' | 'f' | 's';
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface Bomber {
  playerId: string;
  x: number;
  y: number;
  stick: { x: number; y: number };
  alive: boolean;
  bombs: number;
  range: number;
  speedups: number;
  crates: number;
}

export interface Bomb {
  id: number;
  x: number;
  y: number;
  owner: string;
  range: number;
  explodesAt: number;
  /** Who was standing on it when it was dropped, and can still walk off it. */
  walkOff: Set<string>;
}

export interface Yard {
  cols: number;
  rows: number;
  cells: Cell[];
  /** Power-ups hidden under crates (by cell index). */
  hidden: Map<number, PowerUp>;
  bombs: Bomb[];
  /** Cells on fire, and until when. */
  flames: Map<number, number>;
  bombers: Bomber[];
  nextBombId: number;
  /** The order blocks fall in (cell indices, spiralling in from the edge), and how many have. */
  fallOrder: number[];
  fallen: number;
}

/** The yard's open cells in a spiral, from the outside in. */
function spiral(cols: number, rows: number): number[] {
  const order: number[] = [];
  let [left, top, right, bottom] = [1, 1, cols - 2, rows - 2];
  const add = (x: number, y: number) => !isWall(x, y, cols, rows) && order.push(y * cols + x);
  while (left <= right && top <= bottom) {
    for (let x = left; x <= right; x++) add(x, top);
    for (let y = top + 1; y <= bottom; y++) add(right, y);
    if (top < bottom) for (let x = right - 1; x >= left; x--) add(x, bottom);
    if (left < right) for (let y = bottom - 1; y > top; y--) add(left, y);
    [left, top, right, bottom] = [left + 1, top + 1, right - 1, bottom - 1];
  }
  return order;
}

export function newYard(seed: number, playerIds: string[]): Yard {
  const random = seededRandom(seed);
  const { cols, rows } = gridSize(playerIds.length);
  const starts = spawns(cols, rows).slice(0, playerIds.length);
  // Room to move (and drop a first bomb and get away) round each start.
  const clear = new Set<number>();
  for (const [sx, sy] of starts) {
    for (const [dx, dy] of [[0, 0], ...DIRS, ...DIRS.map(([a, b]) => [a * 2, b * 2])]) {
      const x = sx + dx;
      const y = sy + dy;
      if (!isWall(x, y, cols, rows)) clear.add(y * cols + x);
    }
  }
  const cells: Cell[] = [];
  const hidden = new Map<number, PowerUp>();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (isWall(x, y, cols, rows)) cells.push('#');
      else if (clear.has(i) || random() >= CRATE_CHANCE) cells.push('.');
      else {
        cells.push('+');
        if (random() < POWERUP_CHANCE) {
          const r = random();
          hidden.set(i, r < 0.4 ? 'b' : r < 0.8 ? 'f' : 's');
        }
      }
    }
  }
  return {
    cols,
    rows,
    cells,
    hidden,
    bombs: [],
    flames: new Map(),
    bombers: playerIds.map((playerId, i) => ({
      playerId,
      x: starts[i][0],
      y: starts[i][1],
      stick: { x: 0, y: 0 },
      alive: true,
      bombs: START_BOMBS,
      range: START_RANGE,
      speedups: 0,
      crates: 0,
    })),
    nextBombId: 1,
    fallOrder: spiral(cols, rows),
    fallen: 0,
  };
}

const cellAt = (y: Yard, x: number, row: number) => row * y.cols + x;

/** Can this bomber walk into cell (x, row)? */
function open(y: Yard, b: Bomber, x: number, row: number) {
  if (x < 0 || row < 0 || x >= y.cols || row >= y.rows) return false;
  const c = y.cells[cellAt(y, x, row)];
  if (c === '#' || c === '+') return false;
  return !y.bombs.some((o) => o.x === x && o.y === row && !o.walkOff.has(b.playerId));
}

/**
 * Walks a bomber `step` cells one way along the grid. Off the middle of a row (or column), it
 * slides onto it first, if the way's open from there, so going round corners is forgiving.
 */
function walk(y: Yard, b: Bomber, dx: number, dy: number, step: number) {
  const along = dx !== 0 ? 'x' : 'y';
  const across = along === 'x' ? 'y' : 'x';
  const dir = dx + dy;
  const lane = Math.round(b[across]);
  const cur = Math.round(b[along]);
  const ahead = (n: number) => (along === 'x' ? open(y, b, n, lane) : open(y, b, lane, n));
  const off = b[across] - lane;
  if (Math.abs(off) > 1e-6) {
    if (!ahead(cur + dir) && dir * (b[along] - cur) >= 0) return;
    b[across] = Math.abs(off) <= step ? lane : b[across] - Math.sign(off) * step;
    return;
  }
  if (ahead(cur + dir)) b[along] += dir * step;
  else b[along] = dir > 0 ? Math.min(b[along] + step, cur) : Math.max(b[along] - step, cur);
}

export function dropBomb(y: Yard, b: Bomber, ms: number) {
  const x = Math.round(b.x);
  const row = Math.round(b.y);
  if (!b.alive || y.bombs.some((o) => o.x === x && o.y === row) || y.bombs.filter((o) => o.owner === b.playerId).length >= b.bombs) return false;
  const walkOff = new Set(y.bombers.filter((o) => o.alive && Math.abs(o.x - x) < 1 && Math.abs(o.y - row) < 1).map((o) => o.playerId));
  y.bombs.push({ id: y.nextBombId++, x, y: row, owner: b.playerId, range: b.range, explodesAt: ms + FUSE_MS, walkOff });
  return true;
}

/** Sets off a bomb: flames out in a cross, stopping at walls and the first crate; other bombs it reaches go off too. */
function explode(y: Yard, bomb: Bomb, ms: number) {
  const owner = y.bombers.find((o) => o.playerId === bomb.owner);
  y.bombs = y.bombs.filter((o) => o !== bomb);
  const burn = (i: number) => y.flames.set(i, ms + FLAME_MS);
  /** Power-ups uncovered by this blast (it doesn't burn them). */
  const uncovered = new Set<number>();
  burn(cellAt(y, bomb.x, bomb.y));
  for (const [dx, dy] of DIRS) {
    for (let k = 1; k <= bomb.range; k++) {
      const x = bomb.x + dx * k;
      const row = bomb.y + dy * k;
      const i = cellAt(y, x, row);
      const c = y.cells[i];
      if (c === '#') break;
      if (c === '+') {
        y.cells[i] = y.hidden.get(i) ?? '.';
        y.hidden.delete(i);
        if (y.cells[i] !== '.') uncovered.add(i);
        if (owner) owner.crates++;
        burn(i);
        break;
      }
      if (c !== '.' && !uncovered.has(i)) y.cells[i] = '.';
      burn(i);
      const next = y.bombs.find((o) => o.x === x && o.y === row);
      if (next) next.explodesAt = Math.min(next.explodesAt, ms);
    }
  }
}

/** Moves everything on by `dt` seconds, `ms` into the round. Returns who was caught. */
export function run(y: Yard, dt: number, ms: number): string[] {
  for (const b of y.bombers) {
    if (!b.alive) continue;
    const step = (WALK_SPEED + b.speedups * SPEEDUP) * dt;
    const { x: sx, y: sy } = b.stick;
    if (Math.max(Math.abs(sx), Math.abs(sy)) >= 0.3) {
      const [px, py] = [b.x, b.y];
      // The stronger way first; if that's blocked, the other (so a diagonal push slides along walls).
      const [first, second]: [number, number][] = Math.abs(sx) >= Math.abs(sy) ? [[Math.sign(sx), 0], [0, Math.sign(sy)]] : [[0, Math.sign(sy)], [Math.sign(sx), 0]];
      walk(y, b, first[0], first[1], step);
      if (b.x === px && b.y === py && (second[0] || second[1]) && Math.max(Math.abs(second[0] * sx), Math.abs(second[1] * sy)) >= 0.3) walk(y, b, second[0], second[1], step);
    }
    for (const bomb of y.bombs) if (Math.abs(b.x - bomb.x) >= 0.99 || Math.abs(b.y - bomb.y) >= 0.99) bomb.walkOff.delete(b.playerId);
    // Power-ups.
    const i = cellAt(y, Math.round(b.x), Math.round(b.y));
    const c = y.cells[i];
    if (c === 'b' || c === 'f' || c === 's') {
      if (c === 'b') b.bombs = Math.min(MAX_BOMBS, b.bombs + 1);
      if (c === 'f') b.range = Math.min(MAX_RANGE, b.range + 1);
      if (c === 's') b.speedups = Math.min(MAX_SPEEDUPS, b.speedups + 1);
      y.cells[i] = '.';
    }
  }
  // Bombs going off (and setting each other off).
  for (let due = y.bombs.find((o) => o.explodesAt <= ms); due; due = y.bombs.find((o) => o.explodesAt <= ms)) explode(y, due, ms);
  for (const [i, until] of y.flames) if (ms >= until) y.flames.delete(i);
  // Blocks falling in.
  if (ms >= FALL_AT_MS) {
    const due = Math.floor((ms - FALL_AT_MS) / FALL_EVERY_MS) + 1;
    while (y.fallen < Math.min(due, y.fallOrder.length)) {
      const i = y.fallOrder[y.fallen++];
      y.cells[i] = '#';
      y.hidden.delete(i);
      y.flames.delete(i);
      y.bombs = y.bombs.filter((o) => cellAt(y, o.x, o.y) !== i);
    }
  }
  const out: string[] = [];
  for (const b of y.bombers) {
    if (!b.alive) continue;
    const i = cellAt(y, Math.round(b.x), Math.round(b.y));
    if (y.flames.has(i) || y.cells[i] === '#') {
      b.alive = false;
      out.push(b.playerId);
    }
  }
  return out;
}

class BlastGrid extends ArenaGame<Yard, BlastWorld, BlastPlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 1, lastOneStanding: true });
  }

  protected newWorld(seed: number, playerIds: string[]) {
    return newYard(seed, playerIds);
  }

  protected stepWorld(y: Yard, dt: number, roundMs: number) {
    return run(y, dt, roundMs);
  }

  protected worldInput(y: Yard, playerId: string, raw: unknown) {
    const input = raw as BlastInput;
    const b = y.bombers.find((o) => o.playerId === playerId);
    if (!b) return false;
    if (input.type === 'stick' && Number.isFinite(input.x) && Number.isFinite(input.y)) {
      b.stick = { x: Math.max(-1, Math.min(1, input.x)), y: Math.max(-1, Math.min(1, input.y)) };
    } else if (input.type === 'bomb' && this.phase === 'play') dropBomb(y, b, this.roundMs());
    return false;
  }

  /** Crates smashed (shown on the TV). */
  protected score(y: Yard, playerId: string) {
    return y.bombers.find((b) => b.playerId === playerId)?.crates ?? 0;
  }

  protected hostState(y: Yard): BlastWorld {
    const ms = this.roundMs();
    const color = (id: string) => this.ctx.players().find((p) => p.id === id)?.color ?? '#fff';
    return {
      cols: y.cols,
      rows: y.rows,
      cells: y.cells.join(''),
      bombs: y.bombs.map((o) => ({ id: o.id, x: o.x, y: o.y, ownerColor: color(o.owner), fuse: Math.max(0, Math.min(1, 1 - (o.explodesAt - ms) / FUSE_MS)) })),
      flames: [...y.flames.keys()],
      bombers: y.bombers.map((b) => ({ playerId: b.playerId, color: color(b.playerId), x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, alive: b.alive })),
    };
  }

  protected playerState(y: Yard, playerId: string): BlastPlayerState {
    const b = y.bombers.find((o) => o.playerId === playerId);
    return { bombs: b?.bombs ?? 0, range: b?.range ?? 0, speedups: b?.speedups ?? 0, crates: b?.crates ?? 0 };
  }
}

export const blastGrid: MiniGameDefinition = {
  info: BLAST_GRID,
  create: (ctx, _modeId, options) => new BlastGrid(ctx, options.puzzles),
};
