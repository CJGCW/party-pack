import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const SKY_HOP: GameInfo = {
  id: 'sky-hop',
  name: 'Sky Hop',
  description: 'Bounce up and up on platforms, steering left and right by turning your phone. Some move, some break, springs launch you. Highest in 60 seconds wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '60 seconds a round.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by the highest. Everyone's platforms
// are the same (from the round's seed). Heights are measured up from the ground (y up).

export const ROUND_MS = 60_000;
export const TICK_HZ = 30;
/** The board, in its own units: 700 wide (going off one side brings you back on the other), 1000 high. */
export const VIEW_W = 700;
export const VIEW_H = 1000;
/** The hopper stays this high up the board while climbing; dropping below the board's bottom is a fall. */
export const HOPPER_SCREEN_Y = 520;
export const HOPPER_R = 26;
export const GRAVITY = 2000;
export const JUMP_SPEED = 1150;
export const SPRING_SPEED = 1900;
/** Steering moves you sideways this fast per radian, up to MAX_VX. */
export const VX_PER_RAD = 1300;
export const MAX_VX = 700;
export const PLATFORM_W = 120;
export const CHECKPOINT_W = 260;
export const PLATFORM_H = 22;
/** Every this many steps up the path, a wide checkpoint: a fall puts you back on the last one you reached. */
export const CHECKPOINT_EVERY = 20;
/** After a fall, you're back on the checkpoint this long later. */
export const RESPAWN_MS = 1_200;

export type PlatformKind = 'ground' | 'normal' | 'moving' | 'breaking' | 'spring' | 'checkpoint';

export interface Platform {
  n: number;
  /** Its top, up from the ground. */
  y: number;
  /** Its left edge (for a moving one, where it sways about). */
  x: number;
  w: number;
  kind: PlatformKind;
  /** Moving ones: how far they sway each way, and where in the sway they start. */
  sway: number;
  phase: number;
}

/** A repeatable random number in [0, 1) for (seed, n). */
function hash(seed: number, n: number) {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

const cache = new Map<number, Platform[]>();

/**
 * The platforms, from the ground up: a path that's always within a jump (further apart and
 * trickier the higher it goes, with a checkpoint every CHECKPOINT_EVERY), plus breaking platforms
 * as decoys between them. They're in height order; `n` is each one's place in the list.
 */
export function platformsFor(seed: number): Platform[] {
  const cached = cache.get(seed);
  if (cached) return cached;
  const platforms: Platform[] = [{ n: 0, y: 0, x: 0, w: VIEW_W, kind: 'ground', sway: 0, phase: 0 }];
  const add = (y: number, kind: PlatformKind, k: number, f: number) => {
    const w = kind === 'checkpoint' ? CHECKPOINT_W : PLATFORM_W;
    platforms.push({ n: platforms.length, y, x: hash(seed, k * 5 + 2) * (VIEW_W - w), w, kind, sway: kind === 'moving' ? 120 + 120 * f : 0, phase: hash(seed, k * 5 + 3) * Math.PI * 2 });
  };
  let y = 0;
  for (let k = 1; k < 700; k++) {
    const f = Math.min(1, k / 250);
    const step = 110 + 100 * f * (0.6 + 0.4 * hash(seed, k * 5));
    // A decoy that breaks, somewhere in the gap, now and then.
    if (hash(seed, k * 5 + 4) < 0.25 * f) add(y + step * 0.5, 'breaking', k + 100_000, f);
    y += step;
    const r = hash(seed, k * 5 + 1);
    const kind: PlatformKind = k % CHECKPOINT_EVERY === 0 ? 'checkpoint' : r < 0.08 ? 'spring' : r < 0.08 + 0.35 * f ? 'moving' : 'normal';
    add(y, kind, k, f);
  }
  if (cache.size > 20) cache.clear();
  cache.set(seed, platforms);
  return platforms;
}

/** Where a platform's left edge is `ms` into the round (moving ones sway; the rest stay put). */
export function platformX(p: Platform, ms: number) {
  if (p.kind !== 'moving') return p.x;
  const room = VIEW_W - p.w;
  const x = p.x + p.sway * Math.sin(p.phase + ms / 700);
  return Math.max(0, Math.min(room, x));
}

// ---- Views ---------------------------------------------------------------------------------

/** One hopper, as the TV draws it. */
export interface HopBoardState {
  x: number;
  y: number;
  vy: number;
  /** The highest it's been since it last started from a checkpoint (the board scrolls with this). */
  top: number;
  /** Platforms that have broken under it (recent ones). */
  broken: number[];
  falling: boolean;
}

export interface HopPlayerState {
  metres: number;
}

export type HopHostView = BoardsHostView<HopBoardState>;
export type HopPlayerView = BoardsPlayerView<HopPlayerState>;

/** Each unit up is this many metres, for showing heights. */
export const METRES_PER_UNIT = 0.01;
