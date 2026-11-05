import {
  ARENA_R,
  BALL_R,
  BALL_SPEED,
  BALL_SPEEDUP,
  BALL_TIMES,
  BRICK_RINGS,
  BRICKS_PER_RING,
  CATCH_HOLD_MS,
  CENTER,
  CORE_R,
  KEEP_GUARD,
  MAX_BALL_SPEED,
  ROUND_MS,
  RUBBLE_R,
  SHIELD_HALF,
  SHIELD_R,
  SHIELD_SWING,
  STEER_FULL,
  TICK_HZ,
  keepCenter,
  keepFacing,
  type GuardInput,
  type GuardPlayerState,
  type GuardWorld,
} from '../../shared/games/keepGuard';
import { ArenaGame } from './arena';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

/** Balls move in this many small steps a tick, so a fast one can't skip through a brick. */
const SUBSTEPS = 3;
/** How fast a shield can swing round (radians a second). */
const SHIELD_RATE = 7;

export interface Keep {
  playerId: string;
  x: number;
  y: number;
  facing: number;
  shield: number;
  target: number;
  /** Ring by ring, brick by brick. */
  bricks: boolean[][];
  alive: boolean;
  /** Holding CATCH down. */
  catching: boolean;
  /** The ball on the shield, and when it goes anyway. */
  held: Ball | null;
  heldUntil: number;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Sitting on a shield. */
  held?: boolean;
  /** Fired off a shield: the first brick it meets takes the ones behind it too. */
  hot?: boolean;
}

export interface Arena {
  random: () => number;
  keeps: Keep[];
  balls: Ball[];
  launched: number;
  /** Fallen keeps' balls, for their ids. */
  extras: number;
}

/** An angle brought into (-π, π]. */
const norm = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

export const speedAt = (ms: number) => Math.min(MAX_BALL_SPEED, BALL_SPEED + (BALL_SPEEDUP * ms) / 1000);

export function newArena(seed: number, playerIds: string[]): Arena {
  const n = playerIds.length;
  return {
    random: seededRandom(seed),
    keeps: playerIds.map((playerId, i) => ({
      playerId,
      ...keepCenter(i, n),
      facing: keepFacing(i, n),
      shield: 0,
      target: 0,
      bricks: BRICK_RINGS.map(() => new Array<boolean>(BRICKS_PER_RING).fill(true)),
      alive: true,
      catching: false,
      held: null,
      heldUntil: 0,
    })),
    balls: [],
    launched: 0,
    extras: 0,
  };
}

/** Points a keep's shield `steer` of the way round (-1 to 1). */
export function aim(k: Keep, steer: number) {
  k.target = Math.max(-1, Math.min(1, steer)) * SHIELD_SWING;
}

/** Sets a held ball on the middle of the shield. */
function seat(k: Keep, b: Ball) {
  const a = k.facing + k.shield;
  [b.x, b.y] = [k.x + Math.cos(a) * (SHIELD_R + BALL_R + 6), k.y + Math.sin(a) * (SHIELD_R + BALL_R + 6)];
}

/** Fires the held ball the way the shield's pointing. */
function fire(k: Keep) {
  const b = k.held!;
  const a = k.facing + k.shield;
  seat(k, b);
  [b.vx, b.vy] = [Math.cos(a), Math.sin(a)];
  b.held = false;
  b.hot = true;
  k.held = null;
  k.catching = false;
}

/** Bounces a ball off a surface with normal (nx, ny). */
function bounce(b: Ball, nx: number, ny: number) {
  const into = b.vx * nx + b.vy * ny;
  b.vx -= 2 * into * nx;
  b.vy -= 2 * into * ny;
}

/** Runs one small step of a ball against a keep, `ms` into the round. Returns true if it knocked the keep out. */
function hitKeep(b: Ball, k: Keep, ms: number): boolean {
  const dx = b.x - k.x;
  const dy = b.y - k.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const outward = b.vx * nx + b.vy * ny;
  if (!k.alive) {
    if (dist < RUBBLE_R + BALL_R && outward < 0) {
      bounce(b, nx, ny);
      [b.x, b.y] = [k.x + nx * (RUBBLE_R + BALL_R), k.y + ny * (RUBBLE_R + BALL_R)];
    }
    return false;
  }
  if (dist < CORE_R + BALL_R) {
    k.alive = false;
    bounce(b, nx, ny);
    [b.x, b.y] = [k.x + nx * (RUBBLE_R + BALL_R), k.y + ny * (RUBBLE_R + BALL_R)];
    return true;
  }
  const local = norm(Math.atan2(dy, dx) - k.facing);
  // Bricks: break the one it's running into (one per step) and bounce off it.
  if (Math.abs(local) < Math.PI / 2) {
    const index = Math.min(BRICKS_PER_RING - 1, Math.floor(((local + Math.PI / 2) / Math.PI) * BRICKS_PER_RING));
    for (let r = BRICK_RINGS.length - 1; r >= 0; r--) {
      const [inner, outer] = BRICK_RINGS[r];
      if (!k.bricks[r][index] || dist + BALL_R <= inner || dist - BALL_R >= outer) continue;
      // Only if it's heading into the brick (not already bouncing away from it).
      if (dist > (inner + outer) / 2 ? outward >= 0 : outward <= 0) continue;
      k.bricks[r][index] = false;
      if (b.hot) for (const ring of k.bricks) ring[index] = false;
      b.hot = false;
      bounce(b, nx, ny);
      return false;
    }
  }
  // The shield: coming in from outside onto it bounces off, angled by where it hits.
  if (outward < 0 && dist > SHIELD_R - 4 && dist < SHIELD_R + BALL_R + 6) {
    const off = norm(local - k.shield);
    if (Math.abs(off) < SHIELD_HALF + BALL_R / SHIELD_R) {
      if (k.catching && !k.held) {
        k.held = b;
        k.heldUntil = ms + CATCH_HOLD_MS;
        b.held = true;
        seat(k, b);
        return false;
      }
      b.hot = false;
      const speed = Math.hypot(b.vx, b.vy);
      bounce(b, nx, ny);
      const english = Math.max(-1, Math.min(1, off / SHIELD_HALF)) * 0.6 * speed;
      b.vx += -ny * english;
      b.vy += nx * english;
      [b.x, b.y] = [k.x + nx * (SHIELD_R + BALL_R + 6), k.y + ny * (SHIELD_R + BALL_R + 6)];
    }
  }
  return false;
}

/** Moves everything on by `dt` seconds, `ms` into the round. Returns those whose keep fell. */
export function play(a: Arena, dt: number, ms: number): string[] {
  const out: string[] = [];
  for (const k of a.keeps) {
    const step = SHIELD_RATE * dt;
    k.shield += Math.max(-step, Math.min(step, k.target - k.shield));
    if (k.held) {
      if (!k.alive || !k.catching || ms >= k.heldUntil) fire(k);
      else seat(k, k.held);
    }
  }
  // New balls, from the middle in a random direction.
  while (a.launched < BALL_TIMES.length && ms >= BALL_TIMES[a.launched]) {
    const angle = a.random() * Math.PI * 2;
    a.balls.push({ id: ++a.launched, x: CENTER, y: CENTER, vx: Math.cos(angle), vy: Math.sin(angle) });
  }
  const speed = speedAt(ms);
  const h = dt / SUBSTEPS;
  for (const b of a.balls) {
    for (let s = 0; s < SUBSTEPS && !b.held; s++) {
      const v = Math.hypot(b.vx, b.vy) || 1;
      [b.vx, b.vy] = [(b.vx / v) * speed, (b.vy / v) * speed];
      b.x += b.vx * h;
      b.y += b.vy * h;
      // The arena's rim, with a little wobble so nothing bounces back and forth for ever.
      const cx = b.x - CENTER;
      const cy = b.y - CENTER;
      const fromCenter = Math.hypot(cx, cy);
      if (fromCenter > ARENA_R - BALL_R && b.vx * cx + b.vy * cy > 0) {
        bounce(b, cx / fromCenter, cy / fromCenter);
        const wobble = (a.random() - 0.5) * 0.3;
        [b.vx, b.vy] = [b.vx * Math.cos(wobble) - b.vy * Math.sin(wobble), b.vx * Math.sin(wobble) + b.vy * Math.cos(wobble)];
        [b.x, b.y] = [CENTER + (cx / fromCenter) * (ARENA_R - BALL_R), CENTER + (cy / fromCenter) * (ARENA_R - BALL_R)];
      }
      for (const k of a.keeps) if (hitKeep(b, k, ms)) out.push(k.playerId);
    }
  }
  // A fallen keep sends one more ball into play.
  for (const _ of out) {
    const angle = a.random() * Math.PI * 2;
    a.balls.push({ id: BALL_TIMES.length + ++a.extras, x: CENTER, y: CENTER, vx: Math.cos(angle), vy: Math.sin(angle) });
  }
  return out;
}

export const bricksLeft = (k: Keep) => k.bricks.reduce((n, ring) => n + ring.filter(Boolean).length, 0);

class KeepGuard extends ArenaGame<Arena, GuardWorld, GuardPlayerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 2, lastOneStanding: true });
  }

  protected newWorld(seed: number, playerIds: string[]) {
    return newArena(seed, playerIds);
  }

  protected stepWorld(a: Arena, dt: number, roundMs: number) {
    return play(a, dt, roundMs);
  }

  protected worldInput(a: Arena, playerId: string, raw: unknown) {
    const input = raw as GuardInput;
    const k = a.keeps.find((o) => o.playerId === playerId);
    if (k && input.type === 'steer' && Number.isFinite(input.angle)) aim(k, input.angle / STEER_FULL);
    if (k && input.type === 'catch') k.catching = !!input.held;
    return false;
  }

  /** Bricks left, as the tiebreak. */
  protected score(a: Arena, playerId: string) {
    const k = a.keeps.find((o) => o.playerId === playerId);
    return k?.alive ? bricksLeft(k) : 0;
  }

  protected hostState(a: Arena): GuardWorld {
    return {
      keeps: a.keeps.map((k) => ({
        playerId: k.playerId,
        color: this.ctx.players().find((p) => p.id === k.playerId)?.color ?? '#fff',
        shield: Math.round(k.shield * 1000) / 1000,
        bricks: k.bricks.map((ring) => ring.map((b) => (b ? '1' : '0')).join('')).join(''),
        alive: k.alive,
      })),
      balls: a.balls.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), hot: !!(b.hot || b.held) })),
    };
  }

  protected playerState(a: Arena, playerId: string): GuardPlayerState {
    const k = a.keeps.find((o) => o.playerId === playerId);
    return { bricks: k?.alive ? bricksLeft(k) : 0, balls: a.balls.length, holding: !!k?.held };
  }
}

export const keepGuard: MiniGameDefinition = {
  info: KEEP_GUARD,
  create: (ctx, _modeId, options) => new KeepGuard(ctx, options.puzzles),
};
