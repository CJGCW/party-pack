import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const HELIX_DROP: GameInfo = {
  id: 'helix-drop',
  name: 'Helix Drop',
  description: 'A ball bounces on a tower of rings. Turn your phone to spin the tower so it drops through the gaps, and keep it off the red. Deepest in 60 seconds wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '60 seconds a round.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by the deepest. Everyone's tower is
// the same (from the round's seed).

export const ROUND_MS = 60_000;
export const TICK_HZ = 30;
/** The board, in its own units (700 wide, 1000 high); the ball stays this far down it as the tower scrolls. */
export const VIEW_W = 700;
export const VIEW_H = 1000;
export const BALL_SCREEN_Y = 330;
export const BALL_R = 22;
/** Rings are this far apart down the tower, each cut into SEGMENTS slices. */
export const RING_GAP = 220;
export const SEGMENTS = 12;
/** Every this many rings, a checkpoint (no red on it): landing on red sends you back to the last one. */
export const CHECKPOINT_EVERY = 8;
/** The ball falls this hard and bounces up this fast off a ring. */
export const GRAVITY = 2400;
export const BOUNCE_SPEED = 900;
/** After landing on red, the ball's back at the checkpoint this long later. */
export const RESPAWN_MS = 1_200;
/** The tower turns toward the steering this fast (radians a second); a quarter turn of the phone each way spins it all round. */
export const SPIN_SPEED = 14;
export const WHEEL_GAIN = 2;

export type Slice = 'solid' | 'gap' | 'danger';

/** A repeatable random number in [0, 1) for (seed, n). */
function hash(seed: number, n: number) {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/**
 * Ring `n`'s slices: a gap of two or three slices, and further down, more red. Ring 0 is the top;
 * checkpoints have no red.
 */
export function ringAt(seed: number, n: number): Slice[] {
  const slices: Slice[] = new Array(SEGMENTS).fill('solid');
  const gapAt = Math.floor(hash(seed, n * 7) * SEGMENTS);
  const gapWidth = hash(seed, n * 7 + 1) < 0.5 ? 2 : 3;
  for (let i = 0; i < gapWidth; i++) slices[(gapAt + i) % SEGMENTS] = 'gap';
  if (n % CHECKPOINT_EVERY === 0) return slices;
  const reds = Math.min(5, Math.floor(1 + n / 10 + hash(seed, n * 7 + 2) * 2));
  for (let k = 0; k < reds; k++) {
    const at = Math.floor(hash(seed, n * 7 + 3 + k) * SEGMENTS);
    // Never right beside the gap, so there's always a fair way in.
    const nearGap = [-1, gapWidth].some((d) => (gapAt + d + SEGMENTS) % SEGMENTS === at);
    if (slices[at] === 'solid' && !nearGap) slices[at] = 'danger';
  }
  return slices;
}

/** The slice of a ring under the ball, with the tower turned to `angle` (the ball's at the front, angle 0). */
export function sliceUnderBall(angle: number) {
  const local = (((-angle / (Math.PI * 2)) % 1) + 1) % 1;
  return Math.floor(local * SEGMENTS) % SEGMENTS;
}

// ---- Views ---------------------------------------------------------------------------------

/** One tower, as the TV draws it. */
export interface HelixBoardState {
  /** How far down the ball is (ring n is at n × RING_GAP). */
  depth: number;
  angle: number;
  /** Landed on red and waiting to go back to the checkpoint. */
  respawning: boolean;
}

export interface HelixPlayerState {
  rings: number;
}

export type HelixHostView = BoardsHostView<HelixBoardState>;
export type HelixPlayerView = BoardsPlayerView<HelixPlayerState>;
