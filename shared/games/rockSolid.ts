import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const ROCK_SOLID: GameInfo = {
  id: 'rock-solid',
  name: 'Rock Solid',
  description: 'Rocks drop on your little blob. Hold the button to turn to stone and they bounce off, but being stone uses up energy, and you can only hold it so long. Get hit soft and you lose a heart. Three hearts each. Last one standing wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Three hearts; last one standing wins.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by survival. Everyone gets the same
// rocks (from the round's seed), coming faster and falling quicker as the round goes on; the TV
// works them out from the seed too.

export const ROUND_MS = 75_000;
export const TICK_HZ = 20;
export const HEARTS = 3;
/** Energy: used up this fast (a second) while stone, back this fast while soft. */
export const DRAIN = 0.6;
export const RECHARGE = 0.45;
/** Rocks: the gap between them (from GAP_START to GAP_END over the round), and how long one takes to fall. */
export const GAP_START = 1_900;
export const GAP_END = 700;
export const FALL_START = 1_200;
export const FALL_END = 650;
/** Board size (board units): a column with the blob at the bottom. */
export const BOARD_W = 300;
export const BOARD_H = 520;
export const GROUND_Y = 460;
export const ROCK_R = 34;

/** A rock: when it lands (ms into the round), how long it falls for, and where across it wobbles from. */
export interface Rock {
  at: number;
  fall: number;
  drift: number;
}

/** The round's rocks, the same for everyone. */
export function rocksFor(seed: number): Rock[] {
  let s = seed >>> 0 || 1;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const rocks: Rock[] = [];
  for (let at = 2_000; at < ROUND_MS; ) {
    const k = at / ROUND_MS;
    const gap = GAP_START + (GAP_END - GAP_START) * k;
    // Sometimes two close together, to catch out anyone who lets go too soon.
    const twin = random() < 0.2 + 0.25 * k;
    rocks.push({ at: Math.round(at), fall: Math.round(FALL_START + (FALL_END - FALL_START) * k), drift: random() * 2 - 1 });
    at += twin ? gap * 0.45 : gap * (0.7 + random() * 0.6);
  }
  return rocks;
}

export interface RockState {
  hard: boolean;
  energy: number;
  hearts: number;
  blocked: number;
  /** Counts up with each hit taken (for a flash). */
  hits: number;
}

export type RockHostView = BoardsHostView<RockState>;
export type RockPlayerView = BoardsPlayerView<RockState>;

export type RockInput = { type: 'hold'; down: boolean };
