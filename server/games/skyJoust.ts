import {
  AIR_DRAG,
  CLASH_MARGIN,
  FLAP_SPEED,
  GRAVITY,
  LAVA_Y,
  LEDGES,
  LIVES,
  MAX_VX,
  RESPAWN_MS,
  RIDER_R,
  ROUND_MS,
  SAFE_MS,
  SKY_JOUST,
  SPAWN_LEDGES,
  STEER_ACCEL,
  TICK_HZ,
  WORLD_W,
  type JoustInput,
  type JoustPlayerState,
  type JoustWorld,
} from '../../shared/games/skyJoust';
import { ArenaGame } from './arena';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Jouster {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  steer: number;
  lives: number;
  /** Down (lost a life) until this time; safe from clashes until this time (ms into the round). */
  downUntil: number;
  safeUntil: number;
  flaps: number;
  knocks: number;
  spawn: number;
  /** Knocked down and due back on a ledge once `downUntil` has passed. */
  returning: boolean;
}

export interface Cave {
  riders: Jouster[];
}

/** Puts a rider on top of their spawn ledge, standing still. */
function place(j: Jouster) {
  const [left, top, width] = LEDGES[SPAWN_LEDGES[j.spawn % SPAWN_LEDGES.length]];
  j.x = left + width / 2;
  j.y = top - RIDER_R;
  j.vx = j.vy = 0;
}

export function newCave(playerIds: string[]): Cave {
  return {
    riders: playerIds.map((playerId, i) => {
      const j: Jouster = { playerId, x: 0, y: 0, vx: 0, vy: 0, steer: 0, lives: LIVES, downUntil: 0, safeUntil: 0, flaps: 0, knocks: 0, spawn: i, returning: false };
      place(j);
      return j;
    }),
  };
}

export function flap(j: Jouster) {
  j.vy = Math.min(j.vy - FLAP_SPEED * 0.6, -FLAP_SPEED);
  j.flaps++;
}

/** Loses a life: down for a moment, then back on a ledge (unless that was the last). Returns true if they're out. */
function knockDown(j: Jouster, ms: number) {
  j.lives--;
  j.downUntil = ms + RESPAWN_MS;
  j.safeUntil = ms + RESPAWN_MS + SAFE_MS;
  j.spawn += 3;
  j.returning = true;
  return j.lives <= 0;
}

/** Moves everyone on by `dt` seconds, `ms` into the round. Returns those who lost their last life. */
export function fly(c: Cave, dt: number, ms: number): string[] {
  const out: string[] = [];
  const flying = c.riders.filter((j) => j.lives > 0);
  for (const j of flying) {
    if (ms < j.downUntil) continue;
    // Back from being knocked down: on a ledge, standing still.
    if (j.returning) {
      j.returning = false;
      place(j);
    }
    const prevY = j.y;
    j.vx = Math.max(-MAX_VX, Math.min(MAX_VX, (j.vx + Math.max(-1, Math.min(1, j.steer * 2)) * STEER_ACCEL * dt) * Math.exp(-AIR_DRAG * dt)));
    j.vy += GRAVITY * dt;
    j.x = (((j.x + j.vx * dt) % WORLD_W) + WORLD_W) % WORLD_W;
    j.y += j.vy * dt;
    if (j.y < RIDER_R) [j.y, j.vy] = [RIDER_R, Math.abs(j.vy) * 0.3];
    // Landing on a ledge (from above).
    if (j.vy > 0) {
      for (const [left, top, width] of LEDGES) {
        if (prevY + RIDER_R <= top && j.y + RIDER_R >= top && j.x > left - RIDER_R * 0.5 && j.x < left + width + RIDER_R * 0.5) {
          j.y = top - RIDER_R;
          j.vy = 0;
          j.vx *= 0.85;
        }
      }
    }
    if (j.y + RIDER_R > LAVA_Y && knockDown(j, ms)) out.push(j.playerId);
  }
  // Clashes: the higher rider knocks the lower one down; level ones bounce apart.
  const up = flying.filter((j) => j.lives > 0 && ms >= j.downUntil);
  for (let i = 0; i < up.length; i++) {
    for (let k = i + 1; k < up.length; k++) {
      const a = up[i];
      const b = up[k];
      let dx = b.x - a.x;
      if (dx > WORLD_W / 2) dx -= WORLD_W;
      if (dx < -WORLD_W / 2) dx += WORLD_W;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) >= RIDER_R * 2) continue;
      const safeA = ms < a.safeUntil;
      const safeB = ms < b.safeUntil;
      if (Math.abs(dy) > CLASH_MARGIN && !safeA && !safeB) {
        const [winner, loser] = dy > 0 ? [a, b] : [b, a];
        winner.knocks++;
        winner.vy = -FLAP_SPEED * 0.6;
        if (knockDown(loser, ms)) out.push(loser.playerId);
      } else {
        const push = dx >= 0 ? 1 : -1;
        a.vx = -push * 300;
        b.vx = push * 300;
      }
    }
  }
  return out;
}

class SkyJoust extends ArenaGame<Cave, JoustWorld, JoustPlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 2, lastOneStanding: true });
  }

  protected newWorld(_seed: number, playerIds: string[]) {
    return newCave(playerIds);
  }

  protected stepWorld(c: Cave, dt: number, roundMs: number) {
    return fly(c, dt, roundMs);
  }

  protected worldInput(c: Cave, playerId: string, raw: unknown) {
    const input = raw as JoustInput;
    const j = c.riders.find((o) => o.playerId === playerId);
    if (!j) return false;
    if (input.type === 'steer' && Number.isFinite(input.angle)) j.steer = input.angle;
    else if (input.type === 'flap' && this.phase === 'play' && this.roundMs() >= j.downUntil) flap(j);
    return false;
  }

  protected score(c: Cave, playerId: string) {
    return c.riders.find((j) => j.playerId === playerId)?.knocks ?? 0;
  }

  protected hostState(c: Cave): JoustWorld {
    const ms = this.roundMs();
    return {
      riders: c.riders.map((j) => ({
        playerId: j.playerId,
        color: this.ctx.players().find((p) => p.id === j.playerId)?.color ?? '#fff',
        x: Math.round(j.x),
        y: Math.round(j.y),
        vx: Math.round(j.vx),
        lives: j.lives,
        down: ms < j.downUntil || j.lives <= 0,
        safe: ms < j.safeUntil,
        flaps: j.flaps,
        knocks: j.knocks,
      })),
    };
  }

  protected playerState(c: Cave, playerId: string): JoustPlayerState {
    const j = c.riders.find((o) => o.playerId === playerId);
    return { lives: j?.lives ?? 0, knocks: j?.knocks ?? 0 };
  }
}

export const skyJoust: MiniGameDefinition = {
  info: SKY_JOUST,
  create: (ctx, _modeId, options) => new SkyJoust(ctx, options.puzzles),
};
