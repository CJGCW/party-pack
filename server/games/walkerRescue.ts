import {
  COLS,
  RELEASE_MS,
  ROUND_MS,
  ROWS,
  SAFE_FALL,
  SAVE_POINTS,
  SKILLS,
  STEPS,
  TICK_HZ,
  WALKER_LEVELS,
  WALKER_RESCUE,
  WALKERS,
  levelGrid,
  type RescueInput,
  type RescueState,
  type Skill,
  type WalkerView,
} from '../../shared/games/walkerRescue';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

interface Walker extends WalkerView {
  fell: number;
  steps: number;
  /** Ticks till its next move (walkers move every other tick, falling every tick). */
  wait: number;
}

export interface Rescue {
  level: number;
  grid: string[][];
  walkers: Walker[];
  released: number;
  skills: Partial<Record<Skill, number>>;
  saved: number;
  lost: number;
  finishedAt: number | null;
}

export function newRescue(level: number): Rescue {
  const at = level % WALKER_LEVELS.length;
  return { level: at, grid: levelGrid(WALKER_LEVELS[at]).map((r) => [...r]), walkers: [], released: 0, skills: { ...WALKER_LEVELS[at].skills }, saved: 0, lost: 0, finishedAt: null };
}

const solid = (r: Rescue, x: number, y: number) => x < 0 || x >= COLS || (y >= 0 && y < ROWS && r.grid[y][x] !== '.');
const blockerAt = (r: Rescue, x: number, y: number) => r.walkers.some((w) => w.doing === 'block' && w.x === x && Math.abs(w.y - y) <= 2);

function step(r: Rescue, w: Walker) {
  const exit = WALKER_LEVELS[r.level].exit;
  if (w.y >= ROWS) {
    w.doing = 'dead';
    r.lost++;
    return;
  }
  if (w.doing === 'block') return;
  if (w.doing === 'fall') {
    if (solid(r, w.x, w.y + 1)) {
      if (w.fell > SAFE_FALL && !w.floater) {
        w.doing = 'dead';
        r.lost++;
        return;
      }
      w.doing = 'walk';
      w.fell = 0;
    } else {
      // Floaters drift down at half speed.
      if (w.floater && w.wait-- > 0) return;
      w.wait = 1;
      w.y++;
      w.fell++;
      return;
    }
  }
  // Builders are quick (a step a tick, so the walkers behind don't run off the end); the rest move every other tick.
  if (w.doing !== 'build') {
    if (w.wait-- > 0) return;
    w.wait = 1;
  }
  if (w.doing === 'dig') {
    // Down through earth (not steel), three wide; when there's nothing left under it, it falls.
    if (w.y + 1 >= ROWS || r.grid[w.y + 1][w.x] === 'S') {
      w.doing = 'walk';
      return;
    }
    if (!solid(r, w.x, w.y + 1)) {
      w.doing = 'fall';
      return;
    }
    for (let dx = -1; dx <= 1; dx++) if (w.x + dx >= 0 && w.x + dx < COLS && r.grid[w.y + 1][w.x + dx] === '#') r.grid[w.y + 1][w.x + dx] = '.';
    w.y++;
    return;
  }
  if (w.doing === 'build') {
    // A step ahead (two cells wide) and up onto it, until the steps run out or its head bumps.
    const nx = w.x + w.dir;
    if (w.steps <= 0 || solid(r, nx, w.y - 1) || solid(r, nx, w.y - 2)) {
      w.doing = 'walk';
      return;
    }
    for (const x of [nx, nx + w.dir]) if (x >= 0 && x < COLS && r.grid[w.y][x] === '.') r.grid[w.y][x] = '#';
    w.x = nx;
    w.y--;
    w.steps--;
    return;
  }
  // Walking: on, up a small step, or turn round at a wall (or a blocker).
  const nx = w.x + w.dir;
  if (blockerAt(r, nx, w.y)) {
    w.dir = w.dir === 1 ? -1 : 1;
    return;
  }
  let up = 0;
  while (up <= 2 && solid(r, nx, w.y - up)) up++;
  if (up > 2 || solid(r, nx, w.y - up - 1)) {
    w.dir = w.dir === 1 ? -1 : 1;
    return;
  }
  w.x = nx;
  w.y -= up;
  if (Math.abs(w.x - exit.x) <= 1 && Math.abs(w.y - exit.y) <= 2) {
    w.doing = 'saved';
    r.saved++;
    return;
  }
  if (!solid(r, w.x, w.y + 1)) {
    w.doing = 'fall';
    w.fell = 0;
  }
}

/** Moves the level on one tick, `ms` into the round. Returns true once every walker's out and home (or lost). */
export function tickRescue(r: Rescue, ms: number): boolean {
  if (r.released < WALKERS && ms >= r.released * RELEASE_MS) {
    const door = WALKER_LEVELS[r.level].door;
    r.walkers.push({ id: ++r.released, x: door.x, y: door.y, dir: 1, doing: 'fall', floater: false, fell: 0, steps: 0, wait: 0 });
  }
  for (const w of r.walkers) if (w.doing !== 'saved' && w.doing !== 'dead') step(r, w);
  const done = r.released === WALKERS && r.walkers.every((w) => w.doing === 'saved' || w.doing === 'dead' || w.doing === 'block');
  if (done && r.finishedAt === null) r.finishedAt = ms;
  return done;
}

/** Gives a walker a skill (if there's one left, and it makes sense). */
export function assign(r: Rescue, skill: Skill, id: number) {
  const w = r.walkers.find((o) => o.id === id);
  if (!w || (r.skills[skill] ?? 0) <= 0 || w.doing === 'saved' || w.doing === 'dead' || w.doing === 'block') return false;
  if (skill === 'float') {
    if (w.floater) return false;
    w.floater = true;
  } else {
    if (w.doing === 'fall') return false;
    w.doing = skill;
    w.steps = STEPS;
  }
  r.skills[skill] = (r.skills[skill] ?? 0) - 1;
  return true;
}

class WalkerRescue extends BoardsGame<Rescue, RescueState, RescueState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 2 });
  }

  protected newBoard() {
    return newRescue(this.puzzleIndex);
  }

  protected stepBoard(r: Rescue, _dt: number, roundMs: number) {
    return tickRescue(r, roundMs);
  }

  protected boardInput(r: Rescue, raw: unknown) {
    const input = raw as RescueInput;
    if (input.type !== 'skill' || !SKILLS.includes(input.skill) || this.phase !== 'play') return false;
    return assign(r, input.skill, input.walker);
  }

  /** Saved walkers, and a point for every second to spare if it's all done. */
  protected boardScore(r: Rescue) {
    return r.saved * SAVE_POINTS + (r.finishedAt !== null && r.saved > 0 ? Math.round((ROUND_MS - r.finishedAt) / 1000) : 0);
  }

  protected hostState(r: Rescue): RescueState {
    return {
      level: r.level,
      grid: r.grid.map((row) => row.join('')).join(''),
      walkers: r.walkers.filter((w) => w.doing !== 'saved' && w.doing !== 'dead').map(({ id, x, y, dir, doing, floater }) => ({ id, x, y, dir, doing, floater })),
      saved: r.saved,
      lost: r.lost,
      out: r.released,
      skills: r.skills,
    };
  }

  protected playerState(r: Rescue) {
    return this.hostState(r);
  }
}

export const walkerRescue: MiniGameDefinition = {
  info: WALKER_RESCUE,
  create: (ctx, _modeId, options) => new WalkerRescue(ctx, options.puzzles),
};
