import {
  ACCEL,
  BACK_MS,
  CALL_MS,
  CALL_MS_MIN,
  CALL_SHRINK,
  DEAD_ZONE,
  DROP_MS,
  FRICTION,
  HEX_HEAT,
  LAYOUTS,
  MAX_SPEED,
  ROUND_MS,
  TICK_HZ,
  TILE_COLORS,
  WORLD,
  hash,
  tileAt,
  type HeatStage,
  type HeatWorld,
  type Layout,
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
  layout: Layout;
  colors: number[];
  rollers: Roller[];
  calls: number;
  called: number;
  stage: HeatStage;
  /** When the current stage ends (ms into the round). */
  stageEndsAt: number;
  stageLength: number;
}

/** Colours the floor for call number `n`: every colour on at least two tiles. */
export function colorFloor(seed: number, n: number, tiles: number) {
  const colors = Array.from({ length: tiles }, (_, i) => Math.floor(hash(seed, n * 1000 + i) * TILE_COLORS.length));
  for (let c = 0; c < TILE_COLORS.length; c++) {
    for (let k = 0; colors.filter((x) => x === c).length < 2; k++) colors[Math.floor(hash(seed, n * 1000 + 500 + c * 10 + k) * tiles)] = c;
  }
  return colors;
}

/** How long call `n` gives you to get there. */
export function callMs(n: number) {
  return Math.max(CALL_MS_MIN, CALL_MS - n * CALL_SHRINK);
}

export function newFloor(seed: number, playerIds: string[], layout: Layout): Floor {
  const n = playerIds.length;
  const colors = colorFloor(seed, 0, layout.tiles.length);
  return {
    seed,
    layout,
    colors,
    rollers: playerIds.map((playerId, i) => {
      const a = (i / n) * Math.PI * 2;
      return { playerId, x: WORLD / 2 + Math.cos(a) * (n > 1 ? 200 : 0), y: WORLD / 2 + Math.sin(a) * (n > 1 ? 200 : 0), vx: 0, vy: 0, tilt: { x: 0, y: 0 }, in: true };
    }),
    calls: 0,
    called: Math.floor(hash(seed, 7) * TILE_COLORS.length),
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
  for (const r of f.rollers) if (r.in && tileAt(f.layout, r.x, r.y) < 0) drop(r);
  // While the floor's down: anyone not on the colour called drops.
  if (f.stage === 'drop') for (const r of f.rollers) if (r.in && f.colors[tileAt(f.layout, r.x, r.y)] !== f.called) drop(r);
  if (roundMs >= f.stageEndsAt) {
    if (f.stage === 'call') [f.stage, f.stageLength] = ['drop', DROP_MS];
    else if (f.stage === 'drop') [f.stage, f.stageLength] = ['back', BACK_MS];
    else {
      f.calls++;
      f.colors = colorFloor(f.seed, f.calls, f.layout.tiles.length);
      f.called = Math.floor(hash(f.seed, 7 + f.calls) * TILE_COLORS.length);
      [f.stage, f.stageLength] = ['call', callMs(f.calls)];
    }
    f.stageEndsAt = roundMs + f.stageLength;
  }
  return out;
}

class HexHeat extends ArenaGame<Floor, HeatWorld, { called: number; stage: HeatStage }> {
  private layout = LAYOUTS[0];

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 2, lastOneStanding: true });
  }

  /** A different layout from last round. */
  protected newWorld(seed: number, playerIds: string[]) {
    const pool = this.puzzleIndex === 0 ? LAYOUTS : LAYOUTS.filter((l) => l !== this.layout);
    this.layout = pool[Math.floor(hash(seed, 3) * pool.length)];
    return newFloor(seed, playerIds, this.layout);
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
      layoutId: f.layout.id,
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
