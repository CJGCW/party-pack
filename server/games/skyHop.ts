import {
  GRAVITY,
  HOPPER_SCREEN_Y,
  JUMP_SPEED,
  MAX_VX,
  METRES_PER_UNIT,
  RESPAWN_MS,
  ROUND_MS,
  SKY_HOP,
  SPRING_SPEED,
  TICK_HZ,
  VIEW_W,
  VX_PER_RAD,
  platformX,
  platformsFor,
  type HopBoardState,
  type HopPlayerState,
  type Platform,
} from '../../shared/games/skyHop';
import type { SteerInput } from '../../shared/games/tempestRun';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Hopper {
  platforms: Platform[];
  x: number;
  /** Height up from the ground, and speed (up is positive). */
  y: number;
  vy: number;
  steer: number;
  /** The highest it's been (its score), and the highest since it last started from a checkpoint (where the view is). */
  best: number;
  top: number;
  /** The highest checkpoint (or the ground) it's landed on. */
  checkpoint: Platform;
  broken: Set<number>;
  /** Fell: back on the checkpoint at this time (ms into the round). */
  respawnAt: number | null;
}

export function newHopper(seed: number): Hopper {
  const platforms = platformsFor(seed);
  return { platforms, x: VIEW_W / 2, y: 0, vy: JUMP_SPEED, steer: 0, best: 0, top: 0, checkpoint: platforms[0], broken: new Set(), respawnAt: null };
}

/** Whether x (the hopper's middle) is over a platform, allowing for the board wrapping round. */
function over(x: number, left: number, w: number) {
  for (const dx of [0, VIEW_W, -VIEW_W]) if (x + dx >= left - 8 && x + dx <= left + w + 8) return true;
  return false;
}

/** Moves the hopper on by `dt` seconds, `roundMs` into the round. */
export function hopOn(h: Hopper, dt: number, roundMs: number) {
  if (h.respawnAt !== null) {
    if (roundMs < h.respawnAt) return;
    // Back on the checkpoint, bouncing.
    h.x = platformX(h.checkpoint, roundMs) + h.checkpoint.w / 2;
    h.y = h.top = h.checkpoint.y;
    h.vy = JUMP_SPEED;
    h.respawnAt = null;
  }
  h.x = (((h.x + Math.max(-MAX_VX, Math.min(MAX_VX, h.steer * VX_PER_RAD)) * dt) % VIEW_W) + VIEW_W) % VIEW_W;
  const before = h.y;
  h.vy -= GRAVITY * dt;
  h.y += h.vy * dt;
  // Landing: falling past a platform's top while over it.
  if (h.vy < 0) {
    for (const p of h.platforms) {
      if (p.y > before) break;
      if (p.y < h.y || h.broken.has(p.n) || !over(h.x, platformX(p, roundMs), p.w)) continue;
      if (p.kind === 'breaking') {
        h.broken.add(p.n);
        continue;
      }
      h.y = p.y;
      h.vy = p.kind === 'spring' ? SPRING_SPEED : JUMP_SPEED;
      if (p.kind === 'checkpoint' && p.y > h.checkpoint.y) h.checkpoint = p;
      break;
    }
  }
  h.best = Math.max(h.best, h.y);
  h.top = Math.max(h.top, h.y);
  // Below the bottom of the view: a fall.
  if (h.y < h.top - HOPPER_SCREEN_Y - 60) {
    h.respawnAt = roundMs + RESPAWN_MS;
    h.vy = 0;
  }
}

class SkyHop extends BoardsGame<Hopper, HopBoardState, HopPlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  protected newBoard(seed: number) {
    return newHopper(seed);
  }

  protected stepBoard(h: Hopper, dt: number, roundMs: number) {
    hopOn(h, dt, roundMs);
    return false;
  }

  protected boardInput(h: Hopper, raw: unknown) {
    const input = raw as SteerInput;
    if (input.type === 'steer' && Number.isFinite(input.angle)) h.steer = input.angle;
    return false;
  }

  protected boardScore(h: Hopper) {
    return Math.round(h.best * METRES_PER_UNIT);
  }

  protected hostState(h: Hopper): HopBoardState {
    return { x: Math.round(h.x), y: Math.round(h.y), vy: Math.round(h.vy), top: Math.round(h.top), broken: [...h.broken].slice(-12), falling: h.respawnAt !== null };
  }

  protected playerState(h: Hopper): HopPlayerState {
    return { metres: Math.round(h.best * METRES_PER_UNIT) };
  }
}

export const skyHop: MiniGameDefinition = {
  info: SKY_HOP,
  create: (ctx, _modeId, options) => new SkyHop(ctx, options.puzzles),
};
