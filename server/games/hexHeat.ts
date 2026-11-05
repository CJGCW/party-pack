import {
  ACCEL,
  BACK_MS,
  BACK_MS_MIN,
  BACK_SHRINK,
  CALL_MS,
  CALL_MS_MIN,
  CALL_SHRINK,
  DEAD_ZONE,
  DROP_MS,
  FRICTION,
  HEX_HEAT,
  LAYOUT,
  MAX_SPEED,
  ROUND_MS,
  TICK_HZ,
  TILE_COLORS,
  WORLD,
  hash,
  tileAt,
  type HeatStage,
  type HeatWorld,
} from '../../shared/games/hexHeat';
import type { TiltInput } from '../../shared/games/tileTilt';
import { ArenaGame } from './arena';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Roller {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tilt: { x: number; y: number };
  in: boolean;
}

export interface Floor {
  seed: number;
  colors: number[];
  rollers: Roller[];
  calls: number;
  called: number;
  stage: HeatStage;
  /** When the current stage ends (ms into the round). */
  stageEndsAt: number;
  stageLength: number;
}

/** Where the colours go this round: one hex of each. */
export function colorFloor(seed: number) {
  const colors = TILE_COLORS.map((_, i) => i);
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed, 100 + i) * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  return colors;
}

/** The colour for call `n`, at random, but never the one just called: everyone has to move. */
export function nextCall(seed: number, n: number, last: number) {
  const others = TILE_COLORS.map((_, i) => i).filter((c) => c !== last);
  return others[Math.floor(hash(seed, 7 + n) * others.length)];
}

/** How long call `n` gives you to get there. */
export function callMs(n: number) {
  return Math.max(CALL_MS_MIN, CALL_MS - n * CALL_SHRINK);
}

/** How long the floor's back after call `n`. */
export function backMs(n: number) {
  return Math.max(BACK_MS_MIN, BACK_MS - n * BACK_SHRINK);
}

export function newFloor(seed: number, playerIds: string[]): Floor {
  const n = playerIds.length;
  return {
    seed,
    colors: colorFloor(seed),
    rollers: playerIds.map((playerId, i) => {
      const a = (i / n) * Math.PI * 2;
      return { playerId, x: WORLD / 2 + Math.cos(a) * (n > 1 ? 200 : 0), y: WORLD / 2 + Math.sin(a) * (n > 1 ? 200 : 0), vx: 0, vy: 0, tilt: { x: 0, y: 0 }, in: true };
    }),
    calls: 0,
    called: nextCall(seed, 0, -1),
    stage: 'call',
    stageEndsAt: callMs(0),
    stageLength: callMs(0),
  };
}

/** Moves everyone and the floor's calls on to `roundMs`. Returns those who dropped. */
export function heatOn(f: Floor, dt: number, roundMs: number): string[] {
  const dead = (v: number) => (Math.abs(v) < DEAD_ZONE ? 0 : v);
  const keep = Math.exp(-FRICTION * dt);
  for (const r of f.rollers) {
    if (!r.in) continue;
    r.vx = (r.vx + dead(r.tilt.x) * ACCEL * dt) * keep;
    r.vy = (r.vy + dead(r.tilt.y) * ACCEL * dt) * keep;
    const speed = Math.hypot(r.vx, r.vy);
    if (speed > MAX_SPEED) [r.vx, r.vy] = [(r.vx * MAX_SPEED) / speed, (r.vy * MAX_SPEED) / speed];
    r.x += r.vx * dt;
    r.y += r.vy * dt;
  }
  const out: string[] = [];
  const drop = (r: Roller) => {
    r.in = false;
    out.push(r.playerId);
  };
  // Off the floor altogether, any time.
  for (const r of f.rollers) if (r.in && tileAt(LAYOUT, r.x, r.y) < 0) drop(r);
  // While the floor's down: anyone not on the colour called drops.
  if (f.stage === 'drop') for (const r of f.rollers) if (r.in && f.colors[tileAt(LAYOUT, r.x, r.y)] !== f.called) drop(r);
  if (roundMs >= f.stageEndsAt) {
    if (f.stage === 'call') [f.stage, f.stageLength] = ['drop', DROP_MS];
    else if (f.stage === 'drop') [f.stage, f.stageLength] = ['back', backMs(f.calls)];
    else {
      f.calls++;
      f.called = nextCall(f.seed, f.calls, f.called);
      [f.stage, f.stageLength] = ['call', callMs(f.calls)];
    }
    f.stageEndsAt = roundMs + f.stageLength;
  }
  return out;
}

class HexHeat extends ArenaGame<Floor, HeatWorld, { called: number; stage: HeatStage }> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 2, lastOneStanding: true });
  }

  protected newWorld(seed: number, playerIds: string[]) {
    return newFloor(seed, playerIds);
  }

  protected stepWorld(f: Floor, dt: number, roundMs: number) {
    return heatOn(f, dt, roundMs);
  }

  protected worldInput(f: Floor, playerId: string, raw: unknown) {
    const input = raw as TiltInput;
    const r = f.rollers.find((o) => o.playerId === playerId);
    if (!r || input.type !== 'tilt' || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return false;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    r.tilt = { x: clamp(input.x), y: clamp(input.y) };
    return false;
  }

  protected hostState(f: Floor): HeatWorld {
    return {
      colors: f.colors,
      called: f.called,
      stage: f.stage,
      stageMs: Math.max(0, f.stageEndsAt - this.roundMs()),
      stageLength: f.stageLength,
      players: f.rollers.map((r) => ({ playerId: r.playerId, color: this.ctx.players().find((p) => p.id === r.playerId)?.color ?? '#fff', x: Math.round(r.x), y: Math.round(r.y), in: r.in })),
    };
  }

  protected playerState(f: Floor) {
    return { called: f.called, stage: f.stage };
  }
}

export const hexHeat: MiniGameDefinition = {
  info: HEX_HEAT,
  create: (ctx, _modeId, options) => new HexHeat(ctx, options.puzzles),
};
