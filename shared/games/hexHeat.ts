import type { ArenaHostView, ArenaPlayerView } from '../arena';
import type { GameInfo } from '../protocol';

export const HEX_HEAT: GameInfo = {
  id: 'hex-heat',
  name: 'Hexagon Heat',
  description: 'The TV calls a colour: tilt your phone to roll onto a tile of that colour before the rest of the floor drops away. It gets quicker every time. Last one standing wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Last one standing wins.' }],
};

// A shared arena game (see shared/arena.ts), scored by survival. The world's 1000 × 1000; the
// floor's tiles, its layout and every colour called come from the round's seed.

export const ROUND_MS = 90_000;
export const TICK_HZ = 30;
export const WORLD = 1000;
export const TILE_COLORS = ['#ff5d73', '#ffd166', '#4cd37a', '#5ec8f2'];
export const PLAYER_R = 26;
/** Rolling: as Bump Ring, a little nippier. */
export const ACCEL = 1500;
export const FRICTION = 1.6;
export const MAX_SPEED = 620;
export const DEAD_ZONE = 0.06;
/** Each call: this long to get there (shrinking from CALL_MS to CALL_MS_MIN), then the floor's down for DROP_MS, then back for BACK_MS. */
export const CALL_MS = 4_200;
export const CALL_MS_MIN = 1_500;
export const CALL_SHRINK = 220;
export const DROP_MS = 1_400;
export const BACK_MS = 1_200;

export interface Tile {
  x: number;
  y: number;
  /** Its outline (for drawing), clockwise. */
  points: [number, number][];
}

export interface Layout {
  id: 'squares' | 'hexes';
  name: string;
  tiles: Tile[];
  /** How far from a tile's middle still counts as on it. */
  reach: number;
}

function squares(): Layout {
  const n = 7;
  const size = 128;
  const x0 = (WORLD - n * size) / 2;
  const tiles: Tile[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const x = x0 + (c + 0.5) * size;
      const y = x0 + (r + 0.5) * size;
      const h = size / 2 - 4;
      tiles.push({ x, y, points: [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]] });
    }
  return { id: 'squares', name: 'Squares', tiles, reach: (size / 2) * Math.SQRT2 };
}

function hexes(): Layout {
  const r = 64;
  const w = Math.sqrt(3) * r;
  const tiles: Tile[] = [];
  const rings = 4;
  for (let q = -rings; q <= rings; q++)
    for (let s = Math.max(-rings, -q - rings); s <= Math.min(rings, -q + rings); s++) {
      const x = WORLD / 2 + w * (q + s / 2);
      const y = WORLD / 2 + r * 1.5 * s;
      const inner = r - 4;
      tiles.push({ x, y, points: Array.from({ length: 6 }, (_, k): [number, number] => [x + inner * Math.cos(((k * 60 - 30) * Math.PI) / 180), y + inner * Math.sin(((k * 60 - 30) * Math.PI) / 180)]) });
    }
  return { id: 'hexes', name: 'Hexagons', tiles, reach: r };
}

export const LAYOUTS: Layout[] = [squares(), hexes()];
export function layoutById(id: string) {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

/** The tile a point's on (the nearest, if it's within reach), or -1 if it's off the floor. */
export function tileAt(layout: Layout, x: number, y: number) {
  let best = -1;
  let bestD = layout.reach;
  layout.tiles.forEach((t, i) => {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/** A repeatable random number in [0, 1) for (seed, n). */
export function hash(seed: number, n: number) {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

// ---- Views ---------------------------------------------------------------------------------

export type HeatStage = 'call' | 'drop' | 'back';

export interface HeatWorld {
  layoutId: Layout['id'];
  /** Each tile's colour (an index into TILE_COLORS). */
  colors: number[];
  /** The colour called (during the call and the drop), and what's happening now, and how long it has left (ms). */
  called: number;
  stage: HeatStage;
  stageMs: number;
  stageLength: number;
  players: { playerId: string; color: string; x: number; y: number; in: boolean }[];
}

export type HeatHostView = ArenaHostView<HeatWorld>;
export type HeatPlayerView = ArenaPlayerView<{ called: number; stage: HeatStage }>;
