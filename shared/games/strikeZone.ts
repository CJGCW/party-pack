import type { GameInfo } from '../protocol';
import type { Recording, VolleyHostView, VolleyPlayerView } from '../volleys';

export const STRIKE_ZONE: GameInfo = {
  id: 'strike-zone',
  name: 'Strike Zone',
  description: 'Everyone bowls at once, each on their own lane. Drag the ball along the line to line it up, then flick it up the lane: the harder the flick, the faster it goes, and curving your flick puts spin on it. Three frames of two balls; most pins wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Three frames; most pins wins.' }],
};

// A volleys game (see shared/volleys.ts): three frames of two balls (a strike skips the second).
// The lane's seen from above, in metres: x across (0 in the middle), y up the lane from the foul
// line. The TV draws it PX pixels a metre on its side: foul line on the left, pins on the right,
// under a strip for the name and frames.

export const FRAMES = 3;
export const BALLS = FRAMES * 2;
export const AIM_MS = 20_000;
export const LANE_HALF = 0.53;
/** The gutters run out to here either side. */
export const GUTTER_HALF = 0.72;
export const LANE_LEN = 8.4;
/** The head pin's spot, and the gap between pins. */
export const HEAD_PIN_Y = 6.9;
export const PIN_GAP = 0.3;
export const PIN_R = 0.06;
export const BALL_R = 0.11;
/** Where the ball's let go (how far up the lane). */
export const RELEASE_Y = 0.35;
/** A flick's power (0 to 1) gives a speed between these (m/s); aim's at most this far off straight (radians); spin's -1 to 1. */
export const MIN_SPEED = 3.5;
export const MAX_SPEED = 8;
export const MAX_ANGLE = 0.1;
export const PX = 100;
/** A strip across the top for the name and frames; and room left of the foul line. */
export const TOP = 54;
export const LEFT = 30;
export const BOARD_W = LEFT + LANE_LEN * PX + 20;
export const BOARD_H = TOP + GUTTER_HALF * 2 * PX;
/** Bonus pins: a strike, and a spare. */
export const STRIKE_BONUS = 10;
export const SPARE_BONUS = 5;

/** The ten pins' spots: rows of 1, 2, 3, 4 from the head pin back. */
export const PIN_SPOTS: { x: number; y: number }[] = [0, 1, 2, 3].flatMap((row) =>
  Array.from({ length: row + 1 }, (_, i) => ({ x: (i - row / 2) * PIN_GAP, y: HEAD_PIN_Y + row * PIN_GAP * (Math.sqrt(3) / 2) })),
);

/** Board pixels from lane metres. */
export const toBoard = (x: number, y: number) => ({ x: LEFT + y * PX, y: TOP + (x + GUTTER_HALF) * PX });

export const ballSpeed = (power: number) => MIN_SPEED + Math.max(0, Math.min(1, power)) * (MAX_SPEED - MIN_SPEED);

// ---- Views ---------------------------------------------------------------------------------

export interface BowlAim {
  /** Where along the foul line (metres from the middle). */
  x: number;
  angle: number;
  power: number;
  spin: number;
}

/** A frame's balls: pins knocked by each (null not bowled yet). */
export type Frame = [number | null, number | null];

export interface PinView {
  id: number;
  x: number;
  y: number;
  /** Knocked over (it's drawn lying down), and the way it fell (radians). */
  down: boolean;
  a: number;
}

export interface BowlBoardState {
  pins: PinView[];
  aim: BowlAim;
  frames: Frame[];
  /** Which ball of which frame is next (or was just bowled, while it plays). */
  frame: number;
  ball: number;
  /** Sitting this one out (a strike's second ball). */
  sitting: boolean;
  shot: Recording | null;
}

export interface BowlPlayerState {
  aim: BowlAim;
  frames: Frame[];
  frame: number;
  ball: number;
  sitting: boolean;
  /** Pins still standing. */
  standing: number;
}

export type BowlHostView = VolleyHostView<BowlBoardState>;
export type BowlPlayerView = VolleyPlayerView<BowlPlayerState>;

export type BowlInput = ({ type: 'aim' } | { type: 'fire' }) & BowlAim;

/** A frame's pins plus bonus: a strike (all ten with the first ball), a spare (all ten with two). */
export function frameScore(f: Frame) {
  const [a, b] = f;
  if (a === 10) return 10 + STRIKE_BONUS;
  if (a !== null && b !== null && a + b === 10) return 10 + SPARE_BONUS;
  return (a ?? 0) + (b ?? 0);
}
