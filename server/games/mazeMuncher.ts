import {
  CLEAR_BONUS,
  COLS,
  DIRS,
  DOT_POINTS,
  FRUIT_POINTS,
  GHOST_POINTS,
  GHOST_SPEED,
  LIVES,
  MAX_EXTRA_GHOSTS,
  MAZE,
  MAZE_MUNCHER,
  PELLET_POINTS,
  ROUND_MS,
  ROWS,
  SCARED_MS,
  SCARED_SPEED,
  SPEED,
  TICK_HZ,
  findIn,
  isWall,
  type Dir,
  type MuncherInput,
  type MuncherState,
} from '../../shared/games/mazeMuncher';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

const START = findIn('P');
const HOME = findIn('G');
const CORNERS = [
  { x: COLS - 2, y: 1 },
  { x: 1, y: 1 },
  { x: COLS - 2, y: ROWS - 2 },
  { x: 1, y: ROWS - 2 },
];
const REVERSE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const ORDER: Dir[] = ['up', 'left', 'down', 'right'];

interface Mover {
  x: number;
  y: number;
  dir: Dir;
}

interface Ghost extends Mover {
  kind: number;
  scared: boolean;
  /** It waits at home till then (ms into the round): they come out one by one. */
  releaseAt: number;
}

export interface Muncher extends Mover {
  random: () => number;
  next: Dir | null;
  dots: string[];
  ghosts: Ghost[];
  lives: number;
  points: number;
  scaredUntil: number;
  /** Ghosts eaten this scare (each worth double the last). */
  eaten: number;
  /** Paused (after being caught) until then. */
  pausedUntil: number;
  fruitUntil: number;
  fruitsShown: number;
  incoming: number;
  /** Pellets eaten (each sends a ghost to a rival). */
  pellets: number;
  level: number;
}

const freshDots = () => MAZE.map((row) => row.replace(/[^.o]/g, ' '));
const dotCount = (dots: string[]) => dots.join('').replace(/ /g, '').length;
const totalDots = dotCount(freshDots());

export function newMuncher(seed: number): Muncher {
  return {
    ...START,
    dir: 'left',
    random: seededRandom(seed),
    next: null,
    dots: freshDots(),
    ghosts: [0, 1, 2, 3].map((kind) => ({ ...HOME, dir: 'up', kind, scared: false, releaseAt: 1_000 + kind * 1_500 })),
    lives: LIVES,
    points: 0,
    scaredUntil: 0,
    eaten: 0,
    pausedUntil: 0,
    fruitUntil: 0,
    fruitsShown: 0,
    incoming: 0,
    pellets: 0,
    level: 0,
  };
}

const atCentre = (m: Mover) => Math.abs(m.x - Math.round(m.x)) < 1e-6 && Math.abs(m.y - Math.round(m.y)) < 1e-6;
const open = (x: number, y: number, dir: Dir) => !isWall(x + DIRS[dir][0], y + DIRS[dir][1]);

/** Moves along its way by `step` tiles, stopping at the middle of a tile to pick a way on (`choose`). */
function move(m: Mover, step: number, choose: (x: number, y: number) => Dir | null) {
  while (step > 1e-9) {
    if (atCentre(m)) {
      m.x = Math.round(m.x);
      m.y = Math.round(m.y);
      const way = choose(m.x, m.y);
      if (!way) return;
      m.dir = way;
    }
    // On to the middle of the next tile (or as far as this step goes).
    const [dx, dy] = DIRS[m.dir];
    const to = dx ? (dx > 0 ? Math.floor(m.x + 1e-9) + 1 : Math.ceil(m.x - 1e-9) - 1) : dy > 0 ? Math.floor(m.y + 1e-9) + 1 : Math.ceil(m.y - 1e-9) - 1;
    const left = Math.abs(to - (dx ? m.x : m.y));
    const go = Math.min(step, left);
    if (dx) m.x += dx * go;
    else m.y += dy * go;
    step -= go;
  }
}

/** Where ghost `kind` is after: the player, ahead of them, a corner, or the player unless close. */
function targetFor(m: Muncher, g: Ghost, ms: number) {
  const scatter = ms % 25_000 < 5_000;
  const corner = CORNERS[g.kind % 4];
  if (scatter && g.kind < 4) return corner;
  const [dx, dy] = DIRS[m.dir];
  switch (g.kind % 4) {
    case 0:
      return m;
    case 1:
      return { x: m.x + dx * 3, y: m.y + dy * 3 };
    case 2:
      return Math.hypot(g.x - m.x, g.y - m.y) > 5 ? m : corner;
    default:
      return { x: m.x - dx * 2, y: m.y - dy * 2 };
  }
}

function catchUp(m: Muncher, ms: number) {
  for (const g of m.ghosts) {
    if (Math.hypot(g.x - m.x, g.y - m.y) > 0.6) continue;
    if (g.scared) {
      m.points += GHOST_POINTS * 2 ** m.eaten++;
      Object.assign(g, { ...HOME, scared: false, dir: 'up', releaseAt: ms + 1_500 });
    } else {
      // Caught: a life, and everyone back where they started.
      m.lives--;
      m.pausedUntil = ms + 1_500;
      Object.assign(m, { ...START, dir: 'left', next: null });
      m.ghosts.forEach((o, i) => Object.assign(o, { ...HOME, scared: false, dir: 'up', releaseAt: ms + 1_500 + 1_000 + i * 1_500 }));
      return;
    }
  }
}

/** Moves everything on by `dt` seconds, `ms` into the round. Returns pellets eaten this step (to send ghosts), and whether the run's over. */
export function stepMuncher(m: Muncher, dt: number, ms: number): { pellets: number; over: boolean } {
  if (m.lives <= 0) return { pellets: 0, over: true };
  if (ms < m.pausedUntil) return { pellets: 0, over: false };
  // Ghosts sent by rivals join from the middle.
  while (m.incoming > 0 && m.ghosts.length < 4 + MAX_EXTRA_GHOSTS) {
    m.incoming--;
    m.ghosts.push({ ...HOME, dir: 'up', kind: 4 + (m.ghosts.length - 4), scared: false, releaseAt: ms + 1_000 });
  }
  m.incoming = 0;
  let pellets = 0;
  move(m, (SPEED + m.level * 0.5) * dt, (x, y) => {
    // Eat what's here.
    const ch = m.dots[y][x];
    if (ch !== ' ') {
      m.dots[y] = m.dots[y].slice(0, x) + ' ' + m.dots[y].slice(x + 1);
      if (ch === '.') m.points += DOT_POINTS;
      else {
        m.points += PELLET_POINTS;
        m.scaredUntil = ms + SCARED_MS;
        m.eaten = 0;
        for (const g of m.ghosts) g.scared = true;
        pellets++;
        m.pellets++;
      }
    }
    if (m.next && open(x, y, m.next)) {
      m.dir = m.next;
      m.next = null;
    }
    return open(x, y, m.dir) ? m.dir : null;
  });
  // Fruit, now and then, where you started.
  const eaten = totalDots - dotCount(m.dots);
  if (m.fruitsShown < 2 && eaten >= totalDots * (m.fruitsShown === 0 ? 0.3 : 0.7)) {
    m.fruitsShown++;
    m.fruitUntil = ms + 9_000;
  }
  if (ms < m.fruitUntil && Math.hypot(m.x - START.x, m.y - START.y) < 0.6) {
    m.points += FRUIT_POINTS;
    m.fruitUntil = 0;
  }
  // Every dot gone: a bonus, and a fresh maze (a little quicker).
  if (dotCount(m.dots) === 0) {
    m.points += CLEAR_BONUS;
    m.dots = freshDots();
    m.level++;
    m.fruitsShown = 0;
  }
  // (After the muncher's moved: a pellet just eaten scares them now.)
  const scared = ms < m.scaredUntil;
  for (const g of m.ghosts) {
    if (!scared) g.scared = false;
    if (ms < g.releaseAt) continue;
    const speed = (g.scared ? SCARED_SPEED : GHOST_SPEED + m.level * 0.4) * dt;
    move(g, speed, (x, y) => {
      const ways = ORDER.filter((d) => d !== REVERSE[g.dir] && open(x, y, d));
      if (!ways.length) return REVERSE[g.dir];
      if (g.scared) return ways[Math.floor(m.random() * ways.length)];
      const t = targetFor(m, g, ms);
      return ways.sort((a, b) => Math.hypot(x + DIRS[a][0] - t.x, y + DIRS[a][1] - t.y) - Math.hypot(x + DIRS[b][0] - t.x, y + DIRS[b][1] - t.y))[0];
    });
  }
  catchUp(m, ms);
  return { pellets, over: m.lives <= 0 };
}

class MazeMuncher extends BoardsGame<Muncher, MuncherState, MuncherState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  protected newBoard(seed: number) {
    return newMuncher(seed);
  }

  protected stepBoard(m: Muncher, dt: number, roundMs: number) {
    const { pellets, over } = stepMuncher(m, dt, roundMs);
    if (pellets) this.sendGarbage(m, pellets);
    return over;
  }

  protected receiveGarbage(m: Muncher, ghosts: number) {
    m.incoming += ghosts;
  }

  protected boardInput(m: Muncher, raw: unknown) {
    const input = raw as MuncherInput;
    if (input.type !== 'turn' || !(input.dir in DIRS)) return false;
    // A turn straight back happens at once; others wait for the next junction.
    if (input.dir === REVERSE[m.dir]) m.dir = input.dir;
    else m.next = input.dir;
    return false;
  }

  protected boardScore(m: Muncher) {
    return m.points;
  }

  protected hostState(m: Muncher): MuncherState {
    const ms = this.roundMs();
    return {
      x: Math.round(m.x * 100) / 100,
      y: Math.round(m.y * 100) / 100,
      dir: m.dir,
      dots: m.dots.join(''),
      ghosts: m.ghosts.map((g) => ({ x: Math.round(g.x * 100) / 100, y: Math.round(g.y * 100) / 100, scared: g.scared, kind: g.kind })),
      fruit: ms < m.fruitUntil,
      lives: m.lives,
      incoming: m.incoming,
      scaredMs: Math.max(0, m.scaredUntil - ms),
    };
  }

  protected playerState(m: Muncher): MuncherState {
    return { ...this.hostState(m), x: 0, y: 0, dots: '', ghosts: [], scaredMs: m.scaredUntil > this.roundMs() ? 1 : 0 };
  }
}

export const mazeMuncher: MiniGameDefinition = {
  info: MAZE_MUNCHER,
  create: (ctx, _modeId, options) => new MazeMuncher(ctx, options.puzzles),
};
