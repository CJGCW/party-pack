import {
  ACCEL,
  BALL_R,
  BUMP,
  BUMP_RING,
  CENTER,
  DEAD_ZONE,
  FRICTION,
  MAX_SPEED,
  ROUND_MS,
  TICK_HZ,
  radiusAt,
  type RingWorld,
} from '../../shared/games/bumpRing';
import type { TiltInput } from '../../shared/games/tileTilt';
import { ArenaGame } from './arena';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Ball {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tilt: { x: number; y: number };
  on: boolean;
}

export interface Ring {
  balls: Ball[];
  radius: number;
}

/** Everyone round a circle, half way out. */
export function newRing(playerIds: string[]): Ring {
  const n = playerIds.length;
  return {
    balls: playerIds.map((playerId, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = n > 1 ? 230 : 0;
      return { playerId, x: CENTER + Math.cos(a) * r, y: CENTER + Math.sin(a) * r, vx: 0, vy: 0, tilt: { x: 0, y: 0 }, on: true };
    }),
    radius: radiusAt(0),
  };
}

/** Rolls everyone on by `dt` seconds, `roundMs` into the round. Returns those who fell off. */
export function roll(w: Ring, dt: number, roundMs: number): string[] {
  w.radius = radiusAt(roundMs);
  const balls = w.balls.filter((b) => b.on);
  const dead = (v: number) => (Math.abs(v) < DEAD_ZONE ? 0 : v);
  const keep = Math.exp(-FRICTION * dt);
  for (const b of balls) {
    b.vx = (b.vx + dead(b.tilt.x) * ACCEL * dt) * keep;
    b.vy = (b.vy + dead(b.tilt.y) * ACCEL * dt) * keep;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) {
      b.vx *= MAX_SPEED / speed;
      b.vy *= MAX_SPEED / speed;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  // Bumps: balls that overlap push apart and swap their speed along the line between them (a bit harder).
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d >= BALL_R * 2) continue;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = BALL_R * 2 - d;
      a.x -= (nx * overlap) / 2;
      a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.y += (ny * overlap) / 2;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing <= 0) continue;
      const push = closing * BUMP;
      a.vx -= push * nx;
      a.vy -= push * ny;
      b.vx += push * nx;
      b.vy += push * ny;
    }
  }
  // Off the edge: the ball's middle past the platform's edge.
  const fell: string[] = [];
  for (const b of balls) {
    if (Math.hypot(b.x - CENTER, b.y - CENTER) > w.radius) {
      b.on = false;
      fell.push(b.playerId);
    }
  }
  return fell;
}

class BumpRing extends ArenaGame<Ring, RingWorld, Record<string, never>> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 2, lastOneStanding: true });
  }

  protected newWorld(_seed: number, playerIds: string[]) {
    return newRing(playerIds);
  }

  protected stepWorld(w: Ring, dt: number, roundMs: number) {
    return roll(w, dt, roundMs);
  }

  protected worldInput(w: Ring, playerId: string, raw: unknown) {
    const input = raw as TiltInput;
    const b = w.balls.find((o) => o.playerId === playerId);
    if (!b || input.type !== 'tilt' || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return false;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    b.tilt = { x: clamp(input.x), y: clamp(input.y) };
    return false;
  }

  protected hostState(w: Ring): RingWorld {
    return {
      balls: w.balls.map((b) => ({
        playerId: b.playerId,
        color: this.ctx.players().find((p) => p.id === b.playerId)?.color ?? '#ffffff',
        x: Math.round(b.x),
        y: Math.round(b.y),
        falling: !b.on,
        on: b.on,
      })),
      radius: Math.round(w.radius),
    };
  }

  protected playerState() {
    return {};
  }
}

export const bumpRing: MiniGameDefinition = {
  info: BUMP_RING,
  create: (ctx, _modeId, options) => new BumpRing(ctx, options.puzzles),
};
