import {
  BLOCK,
  HIT_SAFE_MS,
  HITS,
  LAYOUTS,
  MAX_SHELLS,
  RELOAD_MS,
  ROUND_MS,
  SHELL_R,
  SHELL_SPEED,
  TANK_R,
  TANK_SPEED,
  TANK_YARD,
  TICK_HZ,
  TURN_RATE,
  type TankInput,
  type TankPlayerState,
  type TankWorld,
} from '../../shared/games/tankYard';
import { ArenaGame } from './arena';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { createTankGravity } from './tankGravity';

/** Shells move in this many small steps a tick, so they can't skip through a wall's corner. */
const SUBSTEPS = 3;
/** Your own shell can't hit you until it's bounced or been out this long. */
const OWN_SHELL_MS = 250;

export interface Tank {
  playerId: string;
  x: number;
  y: number;
  heading: number;
  stick: { x: number; y: number };
  hits: number;
  alive: boolean;
  safeUntil: number;
  reloadAt: number;
}

export interface Shell {
  id: number;
  owner: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
  firedAt: number;
}

export interface Yard {
  layout: number;
  walls: boolean[][];
  tanks: Tank[];
  shells: Shell[];
  nextId: number;
  bursts: { x: number; y: number }[];
}

const norm = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

export function newYard(seed: number, playerIds: string[]): Yard {
  const layout = Math.abs(seed) % LAYOUTS.length;
  const rows = LAYOUTS[layout];
  const starts = new Map<number, { x: number; y: number }>();
  rows.forEach((row, y) => [...row].forEach((c, x) => /[1-8]/.test(c) && starts.set(Number(c), { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK })));
  return {
    layout,
    walls: rows.map((row) => [...row].map((c) => c === '#')),
    tanks: playerIds.map((playerId, i) => {
      const at = starts.get(i + 1)!;
      // Facing the middle.
      const heading = Math.atan2(450 - at.y, 800 - at.x);
      return { playerId, ...at, heading, stick: { x: 0, y: 0 }, hits: 0, alive: true, safeUntil: 0, reloadAt: 0 };
    }),
    shells: [],
    nextId: 1,
    bursts: [],
  };
}

const wallAt = (y: Yard, x: number, row: number) => {
  const cx = Math.floor(x / BLOCK);
  const cy = Math.floor(row / BLOCK);
  return cy < 0 || cy >= y.walls.length || cx < 0 || cx >= y.walls[0].length || y.walls[cy][cx];
};

/** Pushes a tank out of any wall block it's overlapping. */
function pushOutOfWalls(y: Yard, t: Tank) {
  const cx = Math.floor(t.x / BLOCK);
  const cy = Math.floor(t.y / BLOCK);
  for (let by = cy - 1; by <= cy + 1; by++) {
    for (let bx = cx - 1; bx <= cx + 1; bx++) {
      if (!y.walls[by]?.[bx]) continue;
      const nx = Math.max(bx * BLOCK, Math.min((bx + 1) * BLOCK, t.x));
      const ny = Math.max(by * BLOCK, Math.min((by + 1) * BLOCK, t.y));
      const d = Math.hypot(t.x - nx, t.y - ny);
      if (d >= TANK_R || d === 0) continue;
      t.x = nx + ((t.x - nx) / d) * TANK_R;
      t.y = ny + ((t.y - ny) / d) * TANK_R;
    }
  }
}

export function fire(y: Yard, t: Tank, ms: number) {
  if (!t.alive || ms < t.reloadAt || y.shells.filter((s) => s.owner === t.playerId).length >= MAX_SHELLS) return false;
  const x = t.x + Math.cos(t.heading) * (TANK_R + 14);
  const row = t.y + Math.sin(t.heading) * (TANK_R + 14);
  t.reloadAt = ms + RELOAD_MS;
  // Barrel against a wall: it just goes off there.
  if (wallAt(y, x, row)) {
    y.bursts.push({ x, y: row });
    return true;
  }
  y.shells.push({ id: y.nextId++, owner: t.playerId, x, y: row, vx: Math.cos(t.heading) * SHELL_SPEED, vy: Math.sin(t.heading) * SHELL_SPEED, bounces: 0, firedAt: ms });
  return true;
}

/** Moves everything on by `dt` seconds, `ms` into the round. Returns tanks knocked out. */
export function roll(y: Yard, dt: number, ms: number): string[] {
  y.bursts = [];
  const live = y.tanks.filter((t) => t.alive);
  for (const t of live) {
    const push = Math.min(1, Math.hypot(t.stick.x, t.stick.y));
    if (push < 0.25) continue;
    const want = Math.atan2(t.stick.y, t.stick.x);
    const off = norm(want - t.heading);
    t.heading = norm(t.heading + Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, off)));
    // Drives forward only when roughly facing the way it's pushed.
    const go = TANK_SPEED * push * Math.max(0, Math.cos(norm(want - t.heading)));
    t.x += Math.cos(t.heading) * go * dt;
    t.y += Math.sin(t.heading) * go * dt;
    pushOutOfWalls(y, t);
  }
  // Tanks nudge each other apart.
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const [a, b] = [live[i], live[j]];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      if (d >= TANK_R * 2) continue;
      const overlap = (TANK_R * 2 - d) / 2;
      const [nx, ny] = [(b.x - a.x) / d, (b.y - a.y) / d];
      [a.x, a.y, b.x, b.y] = [a.x - nx * overlap, a.y - ny * overlap, b.x + nx * overlap, b.y + ny * overlap];
      pushOutOfWalls(y, a);
      pushOutOfWalls(y, b);
    }
  }
  const out: string[] = [];
  const gone = new Set<Shell>();
  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    for (const sh of y.shells) {
      if (gone.has(sh)) continue;
      const nx = sh.x + sh.vx * h;
      const ny = sh.y + sh.vy * h;
      if (wallAt(y, nx, ny)) {
        // Bounce off the side it hit (both, into a corner); a second bounce and it's done.
        const flipX = wallAt(y, nx, sh.y);
        const flipY = wallAt(y, sh.x, ny);
        if (flipX || !flipY) sh.vx = -sh.vx;
        if (flipY || !flipX) sh.vy = -sh.vy;
        if (++sh.bounces > 1) {
          gone.add(sh);
          y.bursts.push({ x: sh.x, y: sh.y });
        }
        continue;
      }
      [sh.x, sh.y] = [nx, ny];
      const hit = y.tanks.find(
        (t) => t.alive && Math.hypot(t.x - sh.x, t.y - sh.y) < TANK_R + SHELL_R && (t.playerId !== sh.owner || sh.bounces > 0 || ms - sh.firedAt > OWN_SHELL_MS),
      );
      if (hit) {
        gone.add(sh);
        y.bursts.push({ x: sh.x, y: sh.y });
        if (ms < hit.safeUntil) continue;
        hit.hits++;
        hit.safeUntil = ms + HIT_SAFE_MS;
        if (hit.hits >= HITS) {
          hit.alive = false;
          out.push(hit.playerId);
        }
      }
    }
    // Shells meeting in the air knock each other out.
    for (const a of y.shells) {
      for (const b of y.shells) {
        if (a.id >= b.id || gone.has(a) || gone.has(b) || Math.hypot(a.x - b.x, a.y - b.y) >= SHELL_R * 2) continue;
        gone.add(a).add(b);
        y.bursts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
  }
  y.shells = y.shells.filter((sh) => !gone.has(sh));
  return out;
}

class TankYard extends ArenaGame<Yard, TankWorld, TankPlayerState> {
  /** Bursts since the last host update (they'd be missed between updates otherwise). */
  private bursts: { x: number; y: number }[] = [];

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 2, lastOneStanding: true });
  }

  protected newWorld(seed: number, playerIds: string[]) {
    this.bursts = [];
    return newYard(seed, playerIds);
  }

  protected stepWorld(y: Yard, dt: number, roundMs: number) {
    const out = roll(y, dt, roundMs);
    this.bursts.push(...y.bursts);
    return out;
  }

  protected worldInput(y: Yard, playerId: string, raw: unknown) {
    const input = raw as TankInput;
    const t = y.tanks.find((o) => o.playerId === playerId);
    if (!t) return false;
    if (input.type === 'stick' && Number.isFinite(input.x) && Number.isFinite(input.y)) {
      t.stick = { x: Math.max(-1, Math.min(1, input.x)), y: Math.max(-1, Math.min(1, input.y)) };
    } else if (input.type === 'fire' && this.phase === 'play' && fire(y, t, this.roundMs())) {
      this.bursts.push(...y.bursts.splice(0));
    }
    return false;
  }

  /** Hits left (shown on the TV). */
  protected score(y: Yard, playerId: string) {
    const t = y.tanks.find((o) => o.playerId === playerId);
    return t?.alive ? HITS - t.hits : 0;
  }

  protected hostState(y: Yard): TankWorld {
    const ms = this.roundMs();
    const color = (id: string) => this.ctx.players().find((p) => p.id === id)?.color ?? '#fff';
    const bursts = this.bursts.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y) }));
    this.bursts = [];
    return {
      layout: y.layout,
      tanks: y.tanks.map((t) => ({
        playerId: t.playerId,
        color: color(t.playerId),
        x: Math.round(t.x),
        y: Math.round(t.y),
        heading: Math.round(t.heading * 1000) / 1000,
        hits: t.hits,
        alive: t.alive,
        safe: ms < t.safeUntil,
      })),
      shells: y.shells.map((s) => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), color: color(s.owner) })),
      bursts,
    };
  }

  protected playerState(y: Yard, playerId: string): TankPlayerState {
    const t = y.tanks.find((o) => o.playerId === playerId);
    return { hitsLeft: t?.alive ? HITS - t.hits : 0, shellsReady: t ? MAX_SHELLS - y.shells.filter((s) => s.owner === playerId).length : 0 };
  }
}

/** Both modes turn about: each round's a one-round game of its own, with its views numbered as part of the whole. */
export class TanksBoth implements MiniGame {
  private index = 0;
  private current!: MiniGame;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
  ) {}

  start() {
    this.startRound();
  }

  private startRound() {
    const renumber = (view: unknown) => ({ ...(view as object), puzzleNumber: this.index + 1, totalPuzzles: this.totalPuzzles });
    const ctx: GameContext = {
      ...this.ctx,
      sendHost: (view) => this.ctx.sendHost(renumber(view)),
      sendPlayer: (id, view) => this.ctx.sendPlayer(id, renumber(view)),
      finish: () => {
        this.current.dispose();
        if (++this.index >= this.totalPuzzles) return this.ctx.finish();
        this.startRound();
      },
    };
    this.current = this.index % 2 ? createTankGravity(ctx, 1) : new TankYard(ctx, 1);
    this.current.start();
  }

  onInput(playerId: string, input: unknown) {
    this.current.onInput(playerId, input);
  }

  syncHost() {
    this.current.syncHost();
  }

  syncPlayer(playerId: string) {
    this.current.syncPlayer(playerId);
  }

  dispose() {
    this.current.dispose();
  }
}

export const tankYard: MiniGameDefinition = {
  info: TANK_YARD,
  create: (ctx, modeId, options) => (modeId === 'both' ? new TanksBoth(ctx, options.puzzles) : modeId === 'gravity' ? createTankGravity(ctx, options.puzzles) : new TankYard(ctx, options.puzzles)),
};
