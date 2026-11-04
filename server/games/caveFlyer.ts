import {
  BLOCK_W,
  CAVE_FLYER,
  COPTER_R,
  COPTER_X,
  GRAVITY,
  HOVER_MS,
  MAX_VY,
  METRES_PER_UNIT,
  ROUND_MS,
  THRUST,
  TICK_HZ,
  VIEW_H,
  blocksBetween,
  caveAt,
  speedAt,
  type CaveBoardState,
  type CaveInput,
  type CavePlayerState,
} from '../../shared/games/caveFlyer';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Copter {
  seed: number;
  /** How far it's flown: its nose is at distance + COPTER_X along the cave. */
  distance: number;
  y: number;
  vy: number;
  holding: boolean;
  /** Its player has held at least once (until then, it hovers for the first HOVER_MS). */
  started: boolean;
}

/** Moves a copter on by `dt` seconds at `speed`, `roundMs` into the round. Returns true if it crashed. */
export function flyCopter(c: Copter, dt: number, speed: number, roundMs = HOVER_MS) {
  c.distance += speed * dt;
  if (c.holding) c.started = true;
  if (c.started || roundMs >= HOVER_MS) {
    c.vy = Math.max(-MAX_VY, Math.min(MAX_VY, c.vy + (c.holding ? -THRUST : GRAVITY) * dt));
    c.y += c.vy * dt;
  }
  return crashed(c);
}

/** Touching the roof, the floor or a block (checked across the copter's width). */
export function crashed(c: Copter) {
  const x = c.distance + COPTER_X;
  // A little forgiving: the copter's body is a bit smaller than it's drawn.
  const r = COPTER_R * 0.85;
  if (c.y - r < 0 || c.y + r > VIEW_H) return true;
  for (const dx of [-r, 0, r]) {
    const cave = caveAt(c.seed, x + dx);
    if (c.y - r < cave.top || c.y + r > cave.bottom) return true;
  }
  return blocksBetween(c.seed, x - r, x + r).some((b) => {
    // Nearest point of the block to the copter's centre.
    const nx = Math.max(b.x, Math.min(b.x + BLOCK_W, x));
    const ny = Math.max(b.top, Math.min(b.bottom, c.y));
    return Math.hypot(nx - x, ny - c.y) < r;
  });
}

class CaveFlyer extends BoardsGame<Copter, CaveBoardState, CavePlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ });
  }

  /** Everyone starts level with the middle of the cave's mouth. */
  protected newBoard(seed: number): Copter {
    const cave = caveAt(seed, COPTER_X);
    return { seed, distance: 0, y: (cave.top + cave.bottom) / 2, vy: 0, holding: false, started: false };
  }

  protected stepBoard(c: Copter, dt: number, roundMs: number) {
    return flyCopter(c, dt, speedAt(roundMs), roundMs);
  }

  protected boardInput(c: Copter, raw: unknown) {
    const input = raw as CaveInput;
    if (input.type !== 'hold') return false;
    c.holding = !!input.down;
    return false;
  }

  protected boardScore(c: Copter) {
    return Math.round(c.distance * METRES_PER_UNIT);
  }

  protected hostState(c: Copter): CaveBoardState {
    return { distance: Math.round(c.distance), y: Math.round(c.y * 10) / 10, vy: Math.round(c.vy), holding: c.holding };
  }

  protected playerState(c: Copter): CavePlayerState {
    return { distance: Math.round(c.distance * METRES_PER_UNIT) };
  }
}

export const caveFlyer: MiniGameDefinition = {
  info: CAVE_FLYER,
  create: (ctx, _modeId, options) => new CaveFlyer(ctx, options.puzzles),
};
