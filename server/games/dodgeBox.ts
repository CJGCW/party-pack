import {
  BOARD_H,
  BOARD_W,
  BOX_HALF,
  COIN_R,
  DODGE_BOX,
  DODGE_LEVELS,
  DOT_HIT_R,
  HIT_HALF,
  ROUND_MS,
  SPEED,
  TICK_HZ,
  dotAt,
  inRect,
  type DodgeState,
  type Rect,
} from '../../shared/games/dodgeBox';
import type { StickInput } from '../../shared/games/blastGrid';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Dodger {
  level: number;
  x: number;
  y: number;
  stick: { x: number; y: number };
  /** Where you go back to (the middle of the start or the last checkpoint). */
  respawn: { x: number; y: number };
  coins: Set<number>;
  /** Coins safe at the last checkpoint: dying loses the rest. */
  banked: Set<number>;
  deaths: number;
}

const middle = ([x, y, w, h]: Rect) => ({ x: x + w / 2, y: y + h / 2 });

export function newDodger(level: number): Dodger {
  const at = level % DODGE_LEVELS.length;
  const start = middle(DODGE_LEVELS[at].start);
  return { level: at, ...start, stick: { x: 0, y: 0 }, respawn: start, coins: new Set(), banked: new Set(), deaths: 0 };
}

/** Does the box at (x, y) overlap a wall (or leave the board)? */
function blocked(d: Dodger, x: number, y: number) {
  if (x < BOX_HALF || y < BOX_HALF || x > BOARD_W - BOX_HALF || y > BOARD_H - BOX_HALF) return true;
  return DODGE_LEVELS[d.level].walls.some(([wx, wy, w, h]) => x + BOX_HALF > wx && x - BOX_HALF < wx + w && y + BOX_HALF > wy && y - BOX_HALF < wy + h);
}

/** Moves the box on by `dt` seconds, `ms` into the round. Returns true when it's reached the goal with every coin. */
export function stepDodger(d: Dodger, dt: number, ms: number): boolean {
  const level = DODGE_LEVELS[d.level];
  const len = Math.hypot(d.stick.x, d.stick.y);
  if (len > 0.05) {
    const k = (SPEED * dt * Math.min(1, len)) / len;
    // Each way on its own, so it slides along walls.
    const nx = d.x + d.stick.x * k;
    if (!blocked(d, nx, d.y)) d.x = nx;
    const ny = d.y + d.stick.y * k;
    if (!blocked(d, d.x, ny)) d.y = ny;
  }
  for (const [i, [cx, cy]] of level.coins.entries()) if (!d.coins.has(i) && Math.hypot(cx - d.x, cy - d.y) < COIN_R + BOX_HALF) d.coins.add(i);
  const cp = level.checkpoints.find((r) => inRect(r, d.x, d.y));
  if (cp) {
    d.respawn = middle(cp);
    d.banked = new Set(d.coins);
  }
  // A dot touching the box's middle (the forgiving part): back you go.
  if (level.dots.some((p) => {
    const dot = dotAt(p, ms);
    const nx = Math.max(d.x - HIT_HALF, Math.min(d.x + HIT_HALF, dot.x));
    const ny = Math.max(d.y - HIT_HALF, Math.min(d.y + HIT_HALF, dot.y));
    return Math.hypot(dot.x - nx, dot.y - ny) < DOT_HIT_R;
  })) {
    d.deaths++;
    d.x = d.respawn.x;
    d.y = d.respawn.y;
    d.coins = new Set(d.banked);
    return false;
  }
  return d.coins.size === level.coins.length && inRect(level.goal, d.x, d.y);
}

class DodgeBox extends BoardsGame<Dodger, DodgeState, DodgeState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'race', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  protected newBoard() {
    return newDodger(this.puzzleIndex);
  }

  protected stepBoard(d: Dodger, dt: number, roundMs: number) {
    return stepDodger(d, dt, roundMs);
  }

  protected boardInput(d: Dodger, raw: unknown) {
    const input = raw as StickInput;
    if (input.type === 'stick' && Number.isFinite(input.x) && Number.isFinite(input.y)) d.stick = { x: Math.max(-1, Math.min(1, input.x)), y: Math.max(-1, Math.min(1, input.y)) };
    return false;
  }

  /** How far it's got: coins first, then across to the goal. */
  protected boardProgress(d: Dodger) {
    const level = DODGE_LEVELS[d.level];
    return 0.5 * (d.coins.size / Math.max(1, level.coins.length)) + 0.5 * (d.x / BOARD_W);
  }

  protected boardScore(d: Dodger) {
    return d.deaths;
  }

  protected hostState(d: Dodger): DodgeState {
    return { level: d.level, x: Math.round(d.x), y: Math.round(d.y), coins: [...d.coins], deaths: d.deaths, deathId: d.deaths };
  }

  protected playerState(d: Dodger) {
    return this.hostState(d);
  }
}

export const dodgeBox: MiniGameDefinition = {
  info: DODGE_BOX,
  create: (ctx, _modeId, options) => new DodgeBox(ctx, options.puzzles),
};
