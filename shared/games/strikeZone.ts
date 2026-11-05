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

// A volleys game (see shared/volleys.ts): three frames of two balls, scored as bowling is: a strike
// skips the second ball and adds the next two balls, a spare adds the next one, and a strike or
// spare in the last frame earns the balls to pay for it.
// The lane's seen from above, in metres: x across (0 in the middle), y up the lane from the foul
// line. The TV draws it PX pixels a metre on its side: foul line on the left, pins on the right,
// under a strip for the name and frames.

export const FRAMES = 3;
/** The most balls a round can take: two a frame, and one more in the last. */
export const BALLS = FRAMES * 2 + 1;
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

/** A frame's balls: pins knocked by each (null not bowled yet). The last frame has room for three. */
export type Frame = (number | null)[];

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
  /** Sitting this one out (a strike's second ball, or a last frame with nothing to pay for). */
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

/**
 * Each frame's score, as bowling scores it: a strike is 10 plus the next two balls, a spare 10 plus
 * the next one. The last frame is just its pins, since its bonus balls are in it. Balls not bowled
 * yet count as nothing, so a strike's score grows as the balls after it land.
 */
export function frameScores(frames: Frame[]): number[] {
  const rolls = frames.flatMap((f) => f.filter((p): p is number => p !== null));
  let at = 0;
  return frames.map((f, i) => {
    const [a, b] = f;
    if (a === null) return 0;
    if (i === frames.length - 1) return f.reduce<number>((n, p) => n + (p ?? 0), 0);
    if (a === 10) {
      at += 1;
      return 10 + (rolls[at] ?? 0) + (rolls[at + 1] ?? 0);
    }
    const pins = a + (b ?? 0);
    at += b === null ? 1 : 2;
    return pins === 10 ? 10 + (rolls[at] ?? 0) : pins;
  });
}
