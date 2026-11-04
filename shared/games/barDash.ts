import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const BAR_DASH: GameInfo = {
  id: 'bar-dash',
  name: 'Bar Dash',
  description: 'Customers walk down four bars towards you. Tap a bar to dash to it and slide a drink down; each customer you serve sends their empty glass sliding back, so be at that bar to catch it. A customer reaching your end, a dropped glass, or a drink sliding off the end costs a life. Most served wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Three lives; most customers served wins.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by best score (served). Everyone gets
// the same customers (from the round's seed). Board units: BOARD_W × BOARD_H; the bars run from
// BAR_START (the door) to BAR_END (your taps).

export const ROUND_MS = 90_000;
export const TICK_HZ = 20;
export const BOARD_W = 600;
export const BOARD_H = 440;
export const BARS = 4;
export const BAR_Y = [110, 200, 290, 380];
export const BAR_START = 40;
export const BAR_END = 540;
export const LIVES = 3;
export const DRINK_SPEED = 400;
export const GLASS_SPEED = 150;
/** Dashing to another bar takes this long (you can't pour till you're there). */
export const DASH_MS = 160;

/** A customer: when they come in (ms into the round), which bar, and how fast they walk (units a second). */
export interface Arrival {
  at: number;
  bar: number;
  speed: number;
}

/** The round's customers, the same for everyone: more often and quicker as it goes on. */
export function arrivalsFor(seed: number): Arrival[] {
  let s = seed >>> 0 || 1;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const out: Arrival[] = [];
  for (let at = 1_000; at < ROUND_MS - 3_000; ) {
    const k = at / ROUND_MS;
    out.push({ at: Math.round(at), bar: Math.floor(random() * BARS), speed: Math.round(28 + 40 * k + random() * 15) });
    at += 2_600 - 1_700 * k + random() * 800;
  }
  return out;
}

export interface BarState {
  bar: number;
  lives: number;
  served: number;
  /** Customers (bar, x), drinks (bar, x) and glasses (bar, x), flat. */
  customers: number[];
  drinks: number[];
  glasses: number[];
  /** Counts up with each life lost (for a flash). */
  oops: number;
}

export type BarHostView = BoardsHostView<BarState>;
export type BarPlayerView = BoardsPlayerView<BarState>;

export type BarInput = { type: 'pour'; bar: number };
