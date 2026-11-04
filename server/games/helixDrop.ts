import {
  BOUNCE_SPEED,
  CHECKPOINT_EVERY,
  GRAVITY,
  HELIX_DROP,
  RESPAWN_MS,
  RING_GAP,
  ROUND_MS,
  SPIN_SPEED,
  TICK_HZ,
  WHEEL_GAIN,
  ringAt,
  sliceUnderBall,
  type HelixBoardState,
  type HelixPlayerState,
} from '../../shared/games/helixDrop';
import type { SteerInput } from '../../shared/games/tempestRun';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

const wrap = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));

export interface Tower {
  seed: number;
  angle: number;
  target: number;
  /** The ball: how far down (y down) and how fast. */
  depth: number;
  vy: number;
  /** The deepest ring it's got past. */
  deepest: number;
  /** Landed on red: back to the checkpoint at this time (ms into the round). */
  respawnAt: number | null;
}

export function newTower(seed: number): Tower {
  return { seed, angle: 0, target: 0, depth: -RING_GAP * 0.6, vy: 0, deepest: 0, respawnAt: null };
}

/** Turns the tower and moves the ball on by `dt` seconds, `roundMs` into the round. */
export function dropOn(t: Tower, dt: number, roundMs: number) {
  t.angle = wrap(t.angle + Math.max(-SPIN_SPEED * dt, Math.min(SPIN_SPEED * dt, wrap(t.target - t.angle))));
  if (t.respawnAt !== null) {
    if (roundMs < t.respawnAt) return;
    // Back on top of the last checkpoint passed.
    const checkpoint = Math.floor(t.deepest / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
    t.depth = checkpoint * RING_GAP - RING_GAP * 0.6;
    t.vy = 0;
    t.respawnAt = null;
  }
  const before = t.depth;
  t.vy += GRAVITY * dt;
  t.depth += t.vy * dt;
  // Did it cross a ring on the way down?
  if (t.vy <= 0) return;
  const ring = Math.floor(t.depth / RING_GAP);
  if (ring < 0 || ring * RING_GAP <= before) return;
  const slice = ringAt(t.seed, ring)[sliceUnderBall(t.angle)];
  if (slice === 'gap') {
    t.deepest = Math.max(t.deepest, ring + 1);
  } else if (slice === 'solid') {
    t.depth = ring * RING_GAP;
    t.vy = -BOUNCE_SPEED;
  } else {
    t.depth = ring * RING_GAP;
    t.vy = 0;
    t.respawnAt = roundMs + RESPAWN_MS;
  }
}

class HelixDrop extends BoardsGame<Tower, HelixBoardState, HelixPlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  protected newBoard(seed: number) {
    return newTower(seed);
  }

  protected stepBoard(t: Tower, dt: number, roundMs: number) {
    dropOn(t, dt, roundMs);
    return false;
  }

  protected boardInput(t: Tower, raw: unknown) {
    const input = raw as SteerInput;
    if (input.type === 'steer' && Number.isFinite(input.angle)) t.target = wrap(input.angle * WHEEL_GAIN);
    return false;
  }

  protected boardScore(t: Tower) {
    return t.deepest;
  }

  protected hostState(t: Tower): HelixBoardState {
    return { depth: Math.round(t.depth), angle: Math.round(t.angle * 1000) / 1000, respawning: t.respawnAt !== null };
  }

  protected playerState(t: Tower): HelixPlayerState {
    return { rings: t.deepest };
  }
}

export const helixDrop: MiniGameDefinition = {
  info: HELIX_DROP,
  create: (ctx, _modeId, options) => new HelixDrop(ctx, options.puzzles),
};
