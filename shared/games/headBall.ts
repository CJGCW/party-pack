import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const HEAD_BALL: GameInfo = {
  id: 'head-ball',
  name: 'Head Ball',
  description: 'Balls and boots come flying in. Tilt your phone to move and get your head under the balls; dodge the boots, or you are seeing stars for 2 seconds. Most balls headed in 60 seconds wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Most balls headed in 60 seconds wins.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by best score. Everyone gets the same
// throws (from the round's seed); where each one is at any moment is worked out from that, so the
// TV draws them itself and the server only says which have been met.

export const ROUND_MS = 60_000;
export const TICK_HZ = 30;
export const BOARD_W = 500;
export const BOARD_H = 600;
export const HEAD_Y = 470;
export const HEAD_R = 38;
export const BALL_R = 20;
export const MOVE_SPEED = 520;
export const STUN_MS = 2_000;
export const GRAVITY = 700;
/** Tilt this small counts as level. */
export const DEAD_ZONE = 0.08;

/** A throw: when it's thrown (ms into the round), what it is, where from, and how. */
export interface Throw {
  id: number;
  at: number;
  boot: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** The round's throws, the same for everyone. Boots get commoner as it goes on. */
export function throwsFor(seed: number): Throw[] {
  let s = seed >>> 0 || 1;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const out: Throw[] = [];
  for (let at = 1_200, id = 1; at < ROUND_MS - 1_500; id++) {
    const k = at / ROUND_MS;
    const fromLeft = random() < 0.5;
    // Aimed to come down at head height somewhere across the pitch, after a while in the air.
    const flight = 1.2 + random() * 0.8;
    const landX = 50 + random() * (BOARD_W - 100);
    const x = fromLeft ? -30 : BOARD_W + 30;
    const y = 120 + random() * 160;
    const vx = (landX - x) / flight;
    const vy = (HEAD_Y - y - 0.5 * GRAVITY * flight * flight) / flight;
    out.push({ id, at: Math.round(at), boot: random() < 0.15 + 0.25 * k, x, y, vx, vy });
    at += 650 + random() * (1_300 - 600 * k);
  }
  return out;
}

/** Where a throw is `ms` into the round (null before it's thrown). */
export function throwAt(t: Throw, ms: number) {
  if (ms < t.at) return null;
  const s = (ms - t.at) / 1000;
  return { x: t.x + t.vx * s, y: t.y + t.vy * s + 0.5 * GRAVITY * s * s };
}

export interface HeadState {
  x: number;
  headed: number;
  /** Throws met (headed or hit by), so the TV stops drawing them. */
  met: number[];
  stunMs: number;
  /** Counts up with each header (for a bounce on the TV). */
  bonks: number;
}

export type HeadHostView = BoardsHostView<HeadState>;
export type HeadPlayerView = BoardsPlayerView<HeadState>;
