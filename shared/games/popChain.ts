import type { GameInfo } from '../protocol';
import type { VolleyHostView, VolleyPlayerView } from '../volleys';

export const POP_CHAIN: GameInfo = {
  id: 'pop-chain',
  name: 'Pop Chain',
  description: 'Dots drift around. Tap once to set off a blast: any dot it touches blasts too, and so on, in a chain. Pick your moment and your spot. Three fields a round; biggest chains win.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Three fields a round; most dots popped wins.' }],
};

// A volleys game (see shared/volleys.ts): each volley is a field of drifting dots (the same for
// everyone, from the seed). Where every dot is at any moment is worked out from the seed, so the
// phone, the server and the TV agree without sending positions. A player taps a spot at a moment;
// the server works out the chain from there and the TV plays everyone's back.

export const FIELDS = 3;
export const AIM_MS = 15_000;
export const FIELD_W = 1000;
export const FIELD_H = 600;
export const DOT_R = 12;
export const DOTS = [30, 40, 50];
/** A blast grows to BLAST_R over GROW_MS, stays HOLD_MS, then shrinks away over SHRINK_MS. */
export const BLAST_R = 62;
export const GROW_MS = 450;
export const HOLD_MS = 900;
export const SHRINK_MS = 350;
export const BLAST_MS = GROW_MS + HOLD_MS + SHRINK_MS;

export interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
}

/** A field's dots (where they start, and their drift in units a second). */
export function dotsFor(seed: number, field: number): Dot[] {
  let s = (seed + field * 7919) >>> 0 || 1;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: DOTS[Math.min(field, DOTS.length - 1)] }, () => {
    const a = random() * Math.PI * 2;
    const speed = 40 + random() * 70;
    return { x: DOT_R + random() * (FIELD_W - DOT_R * 2), y: DOT_R + random() * (FIELD_H - DOT_R * 2), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, color: Math.floor(random() * 5) };
  });
}

/** Bounces a coordinate back and forth between lo and hi. */
const bounce = (v: number, lo: number, hi: number) => {
  const span = hi - lo;
  const m = (((v - lo) % (2 * span)) + 2 * span) % (2 * span);
  return lo + (m <= span ? m : 2 * span - m);
};

/** Where a dot is `ms` into the field. */
export function dotAt(d: Dot, ms: number) {
  const t = ms / 1000;
  return { x: bounce(d.x + d.vx * t, DOT_R, FIELD_W - DOT_R), y: bounce(d.y + d.vy * t, DOT_R, FIELD_H - DOT_R) };
}

/** A blast's radius `age` ms after it went off (0 before and after). */
export function blastRadius(age: number) {
  if (age < 0 || age > BLAST_MS) return 0;
  if (age < GROW_MS) return (BLAST_R * age) / GROW_MS;
  if (age < GROW_MS + HOLD_MS) return BLAST_R;
  return BLAST_R * (1 - (age - GROW_MS - HOLD_MS) / SHRINK_MS);
}

/** A chain: blasts (x, y, when, in ms into the field; the first is the tap), and which dot popped when (-1 never). */
export interface Chain {
  blasts: number[];
  popped: number[];
}

/** Works out the chain from a tap at (x, y), `at` ms into the field. */
export function chainFrom(dots: Dot[], x: number, y: number, at: number): Chain {
  const blasts: [number, number, number][] = [[x, y, at]];
  const popped = dots.map(() => -1);
  // Step through time, checking every live blast against every dot still there.
  for (let t = at; t <= at + 60_000; t += 20) {
    const live = blasts.filter(([, , start]) => t >= start && t <= start + BLAST_MS);
    if (!live.length) break;
    dots.forEach((d, i) => {
      if (popped[i] >= 0) return;
      const p = dotAt(d, t);
      if (live.some(([bx, by, start]) => Math.hypot(p.x - bx, p.y - by) <= blastRadius(t - start) + DOT_R)) {
        popped[i] = t;
        blasts.push([p.x, p.y, t]);
      }
    });
  }
  return { blasts: blasts.flatMap(([bx, by, t]) => [Math.round(bx), Math.round(by), t]), popped };
}

export interface PopAim {
  x: number;
  y: number;
  /** When (ms into the field), or null for "not yet" (it goes off in the middle when time's up). */
  at: number | null;
}

export interface PopBoardState {
  /** While the chains play: this one's. */
  chain: Chain | null;
  /** Dots popped so far this round, and this field. */
  total: number;
  field: number;
  tapped: boolean;
}

export interface PopRound {
  /** When this field started drifting (server time, ms). */
  startedAt: number;
  field: number;
}

export interface PopPlayerState {
  total: number;
  field: number;
  startedAt: number;
}

export type PopHostView = VolleyHostView<PopBoardState, PopRound>;
export type PopPlayerView = VolleyPlayerView<PopPlayerState>;

export type PopInput = { type: 'fire'; x: number; y: number; at: number };
