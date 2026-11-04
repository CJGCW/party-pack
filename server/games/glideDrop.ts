import {
  BETWEEN_MS,
  DRAG,
  FLIGHTS,
  GLIDE_DROP,
  GRAVITY,
  LAUNCH,
  MAX_PITCH,
  ROUND_MS,
  STALL,
  STEER_FULL,
  TICK_HZ,
  WORLD_W,
  ringScore,
  targetFor,
  type GlideInput,
  type GlideState,
} from '../../shared/games/glideDrop';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Glider {
  seed: number;
  flight: number;
  x: number;
  y: number;
  v: number;
  angle: number;
  /** Falling with the wings folded: its fall speed. */
  vy: number;
  pitch: number;
  open: boolean;
  status: GlideState['status'];
  /** When the next flight launches (ms into the round), once this one's landed. */
  nextAt: number;
  scores: number[];
}

function launch(g: Glider) {
  Object.assign(g, { x: LAUNCH.x, y: LAUNCH.y, v: LAUNCH.v, angle: LAUNCH.angle, vy: 0, open: true, status: 'flying' });
}

export function newGlider(seed: number): Glider {
  return { seed, flight: 0, x: LAUNCH.x, y: LAUNCH.y, v: LAUNCH.v, angle: LAUNCH.angle, vy: 0, pitch: 0, open: true, status: 'flying', nextAt: 0, scores: [] };
}

/** Moves the glider on by `dt` seconds, `ms` into the round. Returns true once its flights are done. */
export function stepGlider(g: Glider, dt: number, ms: number): boolean {
  if (g.status === 'done') return true;
  if (g.status === 'landed') {
    if (ms < g.nextAt) return false;
    if (g.flight >= FLIGHTS - 1) {
      g.status = 'done';
      return true;
    }
    g.flight++;
    launch(g);
    return false;
  }
  if (g.open) {
    // The nose turns towards where it's pitched (and drops when it's too slow to fly).
    const want = g.v < STALL ? Math.min(g.pitch, -0.6) : g.pitch;
    g.angle += Math.max(-1.2 * dt, Math.min(1.2 * dt, want - g.angle));
    g.v = Math.max(5, g.v + (-GRAVITY * Math.sin(g.angle) - DRAG * g.v * g.v) * dt);
    g.x += g.v * Math.cos(g.angle) * dt;
    g.y += g.v * Math.sin(g.angle) * dt;
    g.vy = g.v * Math.sin(g.angle);
  } else {
    // Wings folded: it keeps going forward (slowing a little) and drops.
    const vx = g.v * Math.cos(g.angle) * Math.exp(-0.3 * dt);
    g.vy -= GRAVITY * dt;
    g.v = Math.hypot(vx, g.vy);
    g.angle = Math.atan2(g.vy, vx);
    g.x += vx * dt;
    g.y += g.vy * dt;
  }
  if (g.y <= 0 || g.x >= WORLD_W) {
    g.y = Math.max(0, g.y);
    g.scores.push(g.x >= WORLD_W ? 0 : ringScore(g.x - targetFor(g.seed, g.flight)));
    g.status = 'landed';
    g.nextAt = ms + BETWEEN_MS;
  }
  return false;
}

class GlideDrop extends BoardsGame<Glider, GlideState, GlideState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 2 });
  }

  protected newBoard(seed: number) {
    return newGlider(seed);
  }

  protected stepBoard(g: Glider, dt: number, roundMs: number) {
    return stepGlider(g, dt, roundMs);
  }

  protected boardInput(g: Glider, raw: unknown) {
    const input = raw as GlideInput;
    if (input.type === 'steer' && Number.isFinite(input.angle)) {
      // Turning anticlockwise tips the nose up.
      g.pitch = -Math.max(-1, Math.min(1, input.angle / STEER_FULL)) * MAX_PITCH;
      return false;
    }
    if (input.type === 'fold' && this.phase === 'play' && g.status === 'flying') {
      g.open = !g.open;
      return true;
    }
    return false;
  }

  protected boardScore(g: Glider) {
    return g.scores.reduce((a, b) => a + b, 0);
  }

  protected hostState(g: Glider): GlideState {
    return {
      flight: g.flight,
      x: Math.round(g.x * 10) / 10,
      y: Math.round(g.y * 10) / 10,
      angle: Math.round(g.angle * 100) / 100,
      open: g.open,
      status: g.status,
      last: g.status === 'flying' ? null : (g.scores[g.scores.length - 1] ?? null),
      scores: g.scores,
    };
  }

  protected playerState(g: Glider): GlideState {
    // The phone doesn't need where it is to the decimetre.
    return { ...this.hostState(g), x: Math.round(g.x), y: Math.round(g.y), angle: 0 };
  }
}

export const glideDrop: MiniGameDefinition = {
  info: GLIDE_DROP,
  create: (ctx, _modeId, options) => new GlideDrop(ctx, options.puzzles),
};
