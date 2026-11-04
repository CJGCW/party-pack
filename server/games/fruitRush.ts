import {
  ACCEL,
  BUMP,
  DEAD_ZONE,
  FALL_MS,
  FRICTION,
  FRUIT_EVERY_MS,
  FRUIT_R,
  FRUIT_RUSH,
  GOLD_EVERY,
  GOLD_POINTS,
  KNOCK_SPEED,
  MAX_SPEED,
  PLAYER_R,
  ROUND_MS,
  TICK_HZ,
  WORLD,
  type FruitWorld,
} from '../../shared/games/fruitRush';
import type { TiltInput } from '../../shared/games/tileTilt';
import { ArenaGame } from './arena';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

export interface Picker {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tilt: { x: number; y: number };
  score: number;
  /** Can't be knocked again until this time (ms into the round), so one bump only knocks fruit loose once. */
  safeUntil: number;
}

export interface Fruit {
  id: number;
  x: number;
  y: number;
  gold: boolean;
  /** When it lands (ms into the round). */
  landsAt: number;
}

export interface Yard {
  random: () => number;
  pickers: Picker[];
  fruit: Fruit[];
  nextId: number;
  /** When the next fruit starts falling. */
  nextDropAt: number;
  dropped: number;
}

export function newYard(seed: number, playerIds: string[]): Yard {
  const n = playerIds.length;
  return {
    random: seededRandom(seed),
    pickers: playerIds.map((playerId, i) => {
      const a = (i / n) * Math.PI * 2;
      const r = n > 1 ? 280 : 0;
      return { playerId, x: WORLD / 2 + Math.cos(a) * r, y: WORLD / 2 + Math.sin(a) * r, vx: 0, vy: 0, tilt: { x: 0, y: 0 }, score: 0, safeUntil: 0 };
    }),
    fruit: [],
    nextId: 1,
    nextDropAt: 0,
    dropped: 0,
  };
}

/** Knocks fruit loose from a picker: up to two points' worth, scattered round them as fruit to grab. */
function knockLoose(y: Yard, p: Picker, ms: number) {
  const lost = Math.min(2, p.score);
  p.score -= lost;
  for (let k = 0; k < lost; k++) {
    const a = y.random() * Math.PI * 2;
    const d = PLAYER_R * 2 + y.random() * 80;
    y.fruit.push({ id: y.nextId++, x: clampIn(p.x + Math.cos(a) * d), y: clampIn(p.y + Math.sin(a) * d), gold: false, landsAt: ms + 250 });
  }
  p.safeUntil = ms + 800;
}

const clampIn = (v: number) => Math.max(FRUIT_R + 10, Math.min(WORLD - FRUIT_R - 10, v));

/** Moves everything on by `dt` seconds, `roundMs` into the round. */
export function rush(y: Yard, dt: number, ms: number) {
  // New fruit, falling in at random places.
  while (ms >= y.nextDropAt) {
    y.dropped++;
    y.fruit.push({ id: y.nextId++, x: clampIn(y.random() * WORLD), y: clampIn(y.random() * WORLD), gold: y.dropped % GOLD_EVERY === 0, landsAt: y.nextDropAt + FALL_MS });
    y.nextDropAt += FRUIT_EVERY_MS;
  }
  const dead = (v: number) => (Math.abs(v) < DEAD_ZONE ? 0 : v);
  const keep = Math.exp(-FRICTION * dt);
  for (const p of y.pickers) {
    p.vx = (p.vx + dead(p.tilt.x) * ACCEL * dt) * keep;
    p.vy = (p.vy + dead(p.tilt.y) * ACCEL * dt) * keep;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > MAX_SPEED) [p.vx, p.vy] = [(p.vx * MAX_SPEED) / speed, (p.vy * MAX_SPEED) / speed];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // The yard's fence: bounce off it.
    if (p.x < PLAYER_R || p.x > WORLD - PLAYER_R) [p.x, p.vx] = [Math.max(PLAYER_R, Math.min(WORLD - PLAYER_R, p.x)), -p.vx * 0.5];
    if (p.y < PLAYER_R || p.y > WORLD - PLAYER_R) [p.y, p.vy] = [Math.max(PLAYER_R, Math.min(WORLD - PLAYER_R, p.y)), -p.vy * 0.5];
  }
  // Bumps: whoever was hit (the one going slower into it) drops fruit if it was hard enough.
  for (let i = 0; i < y.pickers.length; i++) {
    for (let j = i + 1; j < y.pickers.length; j++) {
      const a = y.pickers[i];
      const b = y.pickers[j];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      if (d >= PLAYER_R * 2) continue;
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      const overlap = PLAYER_R * 2 - d;
      [a.x, a.y, b.x, b.y] = [a.x - (nx * overlap) / 2, a.y - (ny * overlap) / 2, b.x + (nx * overlap) / 2, b.y + (ny * overlap) / 2];
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing <= 0) continue;
      const aInto = a.vx * nx + a.vy * ny;
      const bInto = -(b.vx * nx + b.vy * ny);
      if (closing > KNOCK_SPEED) {
        const hit = aInto >= bInto ? b : a;
        if (ms >= hit.safeUntil) knockLoose(y, hit, ms);
      }
      const push = closing * BUMP;
      [a.vx, a.vy, b.vx, b.vy] = [a.vx - push * nx, a.vy - push * ny, b.vx + push * nx, b.vy + push * ny];
    }
  }
  // Grabbing fruit that's landed.
  y.fruit = y.fruit.filter((f) => {
    if (ms < f.landsAt) return true;
    const p = y.pickers.find((o) => Math.hypot(o.x - f.x, o.y - f.y) < PLAYER_R + FRUIT_R);
    if (!p) return true;
    p.score += f.gold ? GOLD_POINTS : 1;
    return false;
  });
}

class FruitRush extends ArenaGame<Yard, FruitWorld, { score: number }> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 2 });
  }

  protected newWorld(seed: number, playerIds: string[]) {
    return newYard(seed, playerIds);
  }

  protected stepWorld(y: Yard, dt: number, roundMs: number) {
    rush(y, dt, roundMs);
    return [];
  }

  protected worldInput(y: Yard, playerId: string, raw: unknown) {
    const input = raw as TiltInput;
    const p = y.pickers.find((o) => o.playerId === playerId);
    if (!p || input.type !== 'tilt' || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return false;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    p.tilt = { x: clamp(input.x), y: clamp(input.y) };
    return false;
  }

  protected score(y: Yard, playerId: string) {
    return y.pickers.find((p) => p.playerId === playerId)?.score ?? 0;
  }

  protected hostState(y: Yard): FruitWorld {
    const ms = this.roundMs();
    return {
      fruit: y.fruit.map((f) => ({ id: f.id, x: Math.round(f.x), y: Math.round(f.y), gold: f.gold, falling: ms >= f.landsAt ? 1 : Math.max(0, 1 - (f.landsAt - ms) / FALL_MS) })),
      players: y.pickers.map((p) => ({ playerId: p.playerId, color: this.ctx.players().find((o) => o.id === p.playerId)?.color ?? '#fff', x: Math.round(p.x), y: Math.round(p.y), score: p.score })),
    };
  }

  protected playerState(y: Yard, playerId: string) {
    return { score: this.score(y, playerId) };
  }
}

export const fruitRush: MiniGameDefinition = {
  info: FRUIT_RUSH,
  create: (ctx, _modeId, options) => new FruitRush(ctx, options.puzzles),
};
