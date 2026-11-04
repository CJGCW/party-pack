import {
  FUEL_S,
  GRAVITY,
  LANDER_R,
  MAX_TILT,
  MOON_DROP,
  ROUND_MS,
  SAFE_TILT,
  SAFE_VX,
  SAFE_VY,
  START,
  STEER_FULL,
  THRUST,
  TICK_HZ,
  WORLD_W,
  groundAt,
  landingScore,
  moonFor,
  type MoonInput,
  type MoonPlayerState,
  type MoonWorld,
  type Pad,
} from '../../shared/games/moonDrop';
import { ArenaGame } from './arena';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Lander {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  target: number;
  thrusting: boolean;
  fuel: number;
  status: 'flying' | 'landed' | 'crashed';
  score: number;
}

export interface Moon {
  points: [number, number][];
  pads: Pad[];
  landers: Lander[];
}

export function newMoon(seed: number, playerIds: string[]): Moon {
  return {
    ...moonFor(seed),
    landers: playerIds.map((playerId) => ({ playerId, ...START, angle: 0, target: 0, thrusting: false, fuel: FUEL_S, status: 'flying', score: 0 })),
  };
}

/** Moves every lander on by `dt` seconds. Returns those that touched down (landed or crashed). */
export function flyMoon(m: Moon, dt: number): string[] {
  const done: string[] = [];
  for (const l of m.landers) {
    if (l.status !== 'flying') continue;
    // The lander turns towards the steering, quickly.
    l.angle += Math.max(-3 * dt, Math.min(3 * dt, l.target - l.angle));
    const burning = l.thrusting && l.fuel > 0;
    if (burning) {
      l.fuel = Math.max(0, l.fuel - dt);
      l.vx += Math.sin(l.angle) * THRUST * dt;
      l.vy -= Math.cos(l.angle) * THRUST * dt;
    }
    l.vy += GRAVITY * dt;
    l.x = Math.max(LANDER_R, Math.min(WORLD_W - LANDER_R, l.x + l.vx * dt));
    if (l.x <= LANDER_R || l.x >= WORLD_W - LANDER_R) l.vx = 0;
    l.y += l.vy * dt;
    const ground = groundAt(m.points, l.x);
    if (l.y + LANDER_R < ground) continue;
    l.y = ground - LANDER_R;
    const pad = m.pads.find((p) => l.x - LANDER_R * 0.6 >= p.x0 && l.x + LANDER_R * 0.6 <= p.x1);
    const safe = pad && Math.abs(l.vy) <= SAFE_VY && Math.abs(l.vx) <= SAFE_VX && Math.abs(l.angle) <= SAFE_TILT;
    l.status = safe ? 'landed' : 'crashed';
    l.score = safe ? landingScore(Math.hypot(l.vx, l.vy), l.fuel, pad!.mult) : 0;
    l.vx = l.vy = 0;
    done.push(l.playerId);
  }
  return done;
}

class MoonDrop extends ArenaGame<Moon, MoonWorld, MoonPlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 2 });
  }

  protected newWorld(seed: number, playerIds: string[]) {
    return newMoon(seed, playerIds);
  }

  protected stepWorld(m: Moon, dt: number) {
    return flyMoon(m, dt);
  }

  protected worldInput(m: Moon, playerId: string, raw: unknown) {
    const input = raw as MoonInput;
    const l = m.landers.find((o) => o.playerId === playerId);
    if (!l) return false;
    if (input.type === 'steer' && Number.isFinite(input.angle)) l.target = Math.max(-1, Math.min(1, input.angle / STEER_FULL)) * MAX_TILT;
    else if (input.type === 'thrust') l.thrusting = !!input.on && this.phase === 'play';
    return false;
  }

  protected score(m: Moon, playerId: string) {
    return m.landers.find((l) => l.playerId === playerId)?.score ?? 0;
  }

  protected hostState(m: Moon): MoonWorld {
    return {
      landers: m.landers.map((l) => ({
        playerId: l.playerId,
        color: this.ctx.players().find((p) => p.id === l.playerId)?.color ?? '#fff',
        x: Math.round(l.x),
        y: Math.round(l.y),
        angle: Math.round(l.angle * 100) / 100,
        thrusting: l.thrusting && l.fuel > 0 && l.status === 'flying',
        fuel: Math.round((l.fuel / FUEL_S) * 100),
        status: l.status,
        score: l.score,
      })),
    };
  }

  protected playerState(m: Moon, playerId: string): MoonPlayerState {
    const l = m.landers.find((o) => o.playerId === playerId);
    return { fuel: Math.round(((l?.fuel ?? 0) / FUEL_S) * 100), status: l?.status ?? 'flying', score: l?.score ?? 0, speed: Math.round(Math.hypot(l?.vx ?? 0, l?.vy ?? 0)) };
  }
}

export const moonDrop: MiniGameDefinition = {
  info: MOON_DROP,
  create: (ctx, _modeId, options) => new MoonDrop(ctx, options.puzzles),
};
