import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const CAVE_FLYER: GameInfo = {
  id: 'cave-flyer',
  name: 'Cave Flyer',
  description: 'Hold to climb, let go to drop. Fly your copter through a cave that keeps getting narrower. Last one flying wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '75 seconds a round. Survive it for the bonus.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by survival. Everyone flies the same
// cave (from the round's seed), all at the same speed.

export const ROUND_MS = 75_000;
export const TICK_HZ = 30;

// ---- The board, in its own units: a window onto the cave, 1600 wide, 900 high ------------

export const VIEW_W = 1600;
export const VIEW_H = 900;
/** The copter stays this far from the window's left edge; the cave scrolls past it. */
export const COPTER_X = 320;
export const COPTER_R = 24;
/** Holding pushes the copter up this hard (units/s²); letting go, gravity pulls it down as hard. */
export const THRUST = 1150;
export const GRAVITY = 1150;
export const MAX_VY = 480;
/** At the start, a copter hovers until its player first holds, or this long, so nobody falls before they've reacted. */
export const HOVER_MS = 2_000;
/** How fast the cave scrolls by: this at the start, speeding up to SPEED_END by the end. */
export const SPEED_START = 380;
export const SPEED_END = 680;
/** The gap between roof and floor: this wide at the start, narrowing by GAP_SHRINK a unit flown, down to GAP_MIN. */
const GAP_START = 640;
const GAP_SHRINK = 0.009;
const GAP_MIN = 290;
/** Blocks in the cave: one may stand every this far (from the first window on), as tall as this share of the gap. */
export const BLOCK_EVERY = 900;
export const BLOCK_W = 54;
const BLOCK_SHARE = 0.3;
const BLOCK_CHANCE = 0.65;
/** Nothing to dodge in the first stretch, while everyone finds their feet. */
const CLEAR_START = 2400;
/** Each unit flown is this many metres, for showing distances. */
export const METRES_PER_UNIT = 0.01;

/** A repeatable random number in [0, 1) for (seed, n). */
function hash(seed: number, n: number) {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** How fast the cave scrolls `ms` into the round. */
export function speedAt(ms: number) {
  return SPEED_START + (SPEED_END - SPEED_START) * Math.min(1, Math.max(0, ms / ROUND_MS));
}

/** The cave's roof and floor (y down) at distance `x` along it. */
export function caveAt(seed: number, x: number): { top: number; bottom: number } {
  const gap = Math.max(GAP_MIN, GAP_START - x * GAP_SHRINK);
  // Two slow waves, getting bigger the further you go.
  const p1 = hash(seed, 1) * Math.PI * 2;
  const p2 = hash(seed, 2) * Math.PI * 2;
  // Kept gentle enough that the walls never rise or fall faster than a copter can at full speed.
  const amp = Math.min(150, 60 + x * 0.004);
  const wave = Math.sin((x * 2 * Math.PI) / 2600 + p1) * 0.62 + Math.sin((x * 2 * Math.PI) / 1150 + p2) * 0.38;
  const margin = 28;
  const centre = Math.max(gap / 2 + margin, Math.min(VIEW_H - gap / 2 - margin, VIEW_H / 2 + amp * wave));
  return { top: centre - gap / 2, bottom: centre + gap / 2 };
}

export interface Block {
  /** Left edge, as a distance along the cave. */
  x: number;
  top: number;
  bottom: number;
}

/** The block standing in slot `n` (at n × BLOCK_EVERY along), if there is one. */
export function blockAt(seed: number, n: number): Block | null {
  const x = n * BLOCK_EVERY;
  if (x < CLEAR_START || hash(seed, 1000 + n) > BLOCK_CHANCE) return null;
  const cave = caveAt(seed, x + BLOCK_W / 2);
  const gap = cave.bottom - cave.top;
  const height = gap * BLOCK_SHARE;
  // Somewhere in the gap, leaving at least one way past wide enough to fly through.
  const room = gap - height;
  const offset = (hash(seed, 2000 + n) - 0.5) * (room - 2 * COPTER_R * 3);
  const centre = (cave.top + cave.bottom) / 2 + offset;
  return { x, top: centre - height / 2, bottom: centre + height / 2 };
}

/** Every block between distances `from` and `to`. */
export function blocksBetween(seed: number, from: number, to: number): Block[] {
  const blocks: Block[] = [];
  for (let n = Math.floor(from / BLOCK_EVERY) - 1; n <= Math.ceil(to / BLOCK_EVERY); n++) {
    const b = n >= 0 ? blockAt(seed, n) : null;
    if (b && b.x + BLOCK_W >= from && b.x <= to) blocks.push(b);
  }
  return blocks;
}

// ---- Views ---------------------------------------------------------------------------------

/** One player's copter, as the TV draws it. */
export interface CaveBoardState {
  /** How far they've flown (the cave scrolls by this much). */
  distance: number;
  y: number;
  vy: number;
  holding: boolean;
}

/** What a player's phone gets. */
export interface CavePlayerState {
  distance: number;
}

export type CaveHostView = BoardsHostView<CaveBoardState>;
export type CavePlayerView = BoardsPlayerView<CavePlayerState>;

/** Holding down (climbing) or not. */
export type CaveInput = { type: 'hold'; down: boolean };
