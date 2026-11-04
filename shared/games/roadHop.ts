import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const ROAD_HOP: GameInfo = {
  id: 'road-hop',
  name: 'Road Hop',
  description: 'Hop across roads, rivers and railway lines: tap to hop forward, swipe to hop sideways or back. Get hit and you go back to the last grass. Furthest in 60 seconds wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '60 seconds a round.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by the furthest. Everyone crosses the
// same lanes (from the round's seed); what's in them moves on a fixed schedule from the round's
// clock, so the server and the TV always agree where it is.

export const ROUND_MS = 60_000;
export const TICK_HZ = 30;
/** The board, in its own units: COLS columns across, 700 wide, 1000 high. Rows count up from the start (row 0). */
export const VIEW_W = 700;
export const VIEW_H = 1000;
export const COLS = 9;
export const CELL = VIEW_W / COLS;
/** The hopper stays this many rows up from the bottom of the board as it goes. */
export const HOPPER_ROW_ON_SCREEN = 3;
export const HOPPER_R = CELL * 0.32;
/** A hop at most this often. */
export const HOP_MS = 140;
/** After being hit, back on the last grass this long later. */
export const RESPAWN_MS = 1_200;
/** Things in a lane go round a loop this much wider than the board (so they come on and go off smoothly). */
const LOOP_MARGIN = 150;
export const LOOP_W = VIEW_W + LOOP_MARGIN * 2;

export type LaneKind = 'grass' | 'road' | 'river' | 'rail';

export interface Lane {
  row: number;
  kind: LaneKind;
  /** Grass: columns with a tree in them. */
  trees: number[];
  /** Road and river: which way things go (1 is right), how fast (units a second), how long each is, how far apart, and where they start. */
  dir: number;
  speed: number;
  length: number;
  spacing: number;
  offset: number;
  /** Rail: a train comes every `spacing` ms, starting `offset` in, taking `speed` ms to pass. */
}

/** A repeatable random number in [0, 1) for (seed, n). */
function hash(seed: number, n: number) {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

const cache = new Map<number, Lane[]>();

/**
 * The lanes, from the start up: grass between stretches of road, river or railway, which get
 * longer and faster further on. Every stretch of river or road has grass either side.
 */
export function lanesFor(seed: number): Lane[] {
  const cached = cache.get(seed);
  if (cached) return cached;
  const lanes: Lane[] = [];
  const add = (kind: LaneKind, f: number) => {
    const row = lanes.length;
    const r = (k: number) => hash(seed, row * 11 + k);
    const lane: Lane = { row, kind, trees: [], dir: r(1) < 0.5 ? -1 : 1, speed: 0, length: 0, spacing: 0, offset: r(2) * LOOP_W };
    if (kind === 'grass' && row > 2) {
      // A few trees, never blocking the middle three columns.
      for (let c = 0; c < COLS; c++) if (Math.abs(c - (COLS - 1) / 2) > 1 && r(3 + c) < 0.25) lane.trees.push(c);
    } else if (kind === 'road') {
      lane.speed = 120 + 220 * f + r(3) * 80;
      lane.length = CELL * (r(4) < 0.3 ? 2 : 1.2);
      lane.spacing = Math.max(lane.length + CELL * 2.2, LOOP_W / (2 + Math.floor(r(5) * (2 + f * 2))));
    } else if (kind === 'river') {
      lane.speed = 70 + 120 * f + r(3) * 50;
      lane.length = CELL * (2.4 + r(4) * 1.6 - f * 0.6);
      lane.spacing = lane.length + CELL * (1.3 + r(5) * 1.2 + f * 0.6);
    } else if (kind === 'rail') {
      lane.spacing = 3800 + r(3) * 2200 - f * 1200;
      lane.offset = r(2) * lane.spacing;
      lane.speed = 700;
    }
    lanes.push(lane);
  };
  for (let i = 0; i < 3; i++) add('grass', 0);
  for (let block = 0; lanes.length < 500; block++) {
    const f = Math.min(1, lanes.length / 200);
    const r = hash(seed, 100_000 + block);
    const kind: LaneKind = r < 0.5 ? 'road' : r < 0.82 ? 'river' : 'rail';
    const count = kind === 'rail' ? 1 : 1 + Math.floor(hash(seed, 200_000 + block) * (2 + f * 2));
    for (let i = 0; i < count; i++) add(kind, f);
    add('grass', f);
  }
  if (cache.size > 20) cache.clear();
  cache.set(seed, lanes);
  return lanes;
}

/** The left edges of everything in a road or river lane `ms` into the round. */
export function movers(lane: Lane, ms: number): number[] {
  if (lane.kind !== 'road' && lane.kind !== 'river') return [];
  const shift = lane.offset + lane.dir * lane.speed * (ms / 1000);
  const xs: number[] = [];
  for (let k = 0; k * lane.spacing < LOOP_W; k++) {
    const x = ((((shift + k * lane.spacing) % LOOP_W) + LOOP_W) % LOOP_W) - LOOP_MARGIN;
    xs.push(x);
  }
  return xs;
}

/** A railway lane: whether a train's passing `ms` into the round, and whether one's coming within `warnMs`. */
export function train(lane: Lane, ms: number, warnMs = 1_000) {
  if (lane.kind !== 'rail') return { passing: false, coming: false };
  const at = (((ms - lane.offset) % lane.spacing) + lane.spacing) % lane.spacing;
  return { passing: at < lane.speed, coming: at > lane.spacing - warnMs };
}

// ---- Views ---------------------------------------------------------------------------------

/** One hopper, as the TV draws it. */
export interface HopState {
  /** Where it is: x across the board, and its row. */
  x: number;
  row: number;
  /** The furthest row it's reached. */
  best: number;
  /** Hit, waiting to go back to the grass. */
  hit: boolean;
  /** Which way it last hopped (for which way it faces). */
  facing: Dir;
}

export interface RoadPlayerState {
  best: number;
}

export type RoadHostView = BoardsHostView<HopState>;
export type RoadPlayerView = BoardsPlayerView<RoadPlayerState>;

export type Dir = 'up' | 'down' | 'left' | 'right';
export type RoadInput = { type: 'hop'; dir: Dir };
