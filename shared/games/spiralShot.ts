import type { GameInfo } from '../protocol';

export const SPIRAL_SHOT: GameInfo = {
  id: 'spiral-shot',
  name: 'Spiral Shot',
  description: 'A chain of marbles rolls down a spiral toward the hole. Turn your phone to aim your turret; it fires by itself. Match three to pop them. Last one standing wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '90 seconds a round. Survive it for the bonus.' }],
};

// ---- Timing and pace -----------------------------------------------------------------------

/** The countdown before each round. */
export const READY_MS = 3_000;
/** Each round: survive this long for the bonus. */
export const ROUND_MS = 90_000;
/** The turret fires by itself this often. */
export const FIRE_MS = 1_000;
/** How fast the chain rolls (board units a second): this at the start, speeding up to CHAIN_SPEED_END by the end. */
export const CHAIN_SPEED_START = 36;
export const CHAIN_SPEED_END = 72;
/** The server works the boards out this many times a second. */
export const TICK_HZ = 30;

// ---- The board, in its own units (a 1000 × 1000 square) ------------------------------------

export const BOARD_SIZE = 1000;
export const CENTER = { x: 500, y: 500 };
/** A marble's radius, and the gap between marble centres in the chain. */
export const BALL_R = 18;
export const BALL_D = BALL_R * 2;
/** The turret in the middle, and how fast its shots fly. */
export const TURRET_R = 52;
export const SHOT_SPEED = 1300;
/** The marble colours. */
export const COLORS = ['#ff5d73', '#ffd166', '#4cd37a', '#5ec8f2'];
/** How far along the track the chain's head starts. */
export const START_HEAD = 0.22;

// ---- The tracks --------------------------------------------------------------------------
//
// Each round is on one of these, picked at random (the same for everyone). The turret is always
// in the middle. Longer tracks roll their chains faster (see chainSpeed), so each fills up in
// about the same time.

export interface Track {
  id: string;
  name: string;
  xs: Float64Array;
  ys: Float64Array;
  /** Distance along the track at each point. */
  at: Float64Array;
  /** The chain's head reaching the end falls in the hole. */
  length: number;
  /** Which way the track starts off: marbles queue in the tunnel straight back from the entrance. */
  dir: { x: number; y: number };
  /** Evens out how hard the tracks are (from playing them through): the chain's speed is multiplied by it. */
  pace: number;
}

function trackFrom(id: string, name: string, pace: number, points: { x: number; y: number }[]): Track {
  const n = points.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const at = new Float64Array(n);
  points.forEach((p, i) => {
    xs[i] = p.x;
    ys[i] = p.y;
    if (i > 0) at[i] = at[i - 1] + Math.hypot(p.x - xs[i - 1], p.y - ys[i - 1]);
  });
  const d = Math.hypot(xs[1] - xs[0], ys[1] - ys[0]);
  return { id, name, pace, xs, ys, at, length: at[n - 1], dir: { x: (xs[1] - xs[0]) / d, y: (ys[1] - ys[0]) / d } };
}

/** A curve traced by `f` (0 to 1), finely. */
function traced(f: (u: number) => { x: number; y: number }, steps = 3000) {
  return Array.from({ length: steps + 1 }, (_, i) => f(i / steps));
}

/** Straight runs between waypoints, each corner rounded off over `radius` either side, then finely. */
function rounded(waypoints: [number, number][], radius = 75) {
  const pts = waypoints.map(([x, y]) => ({ x, y }));
  const path = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const inLen = Math.hypot(b.x - a.x, b.y - a.y);
    const outLen = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const from = { x: b.x - ((b.x - a.x) / inLen) * r, y: b.y - ((b.y - a.y) / inLen) * r };
    const to = { x: b.x + ((c.x - b.x) / outLen) * r, y: b.y + ((c.y - b.y) / outLen) * r };
    // A curve from `from` to `to`, pulled toward the corner.
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      path.push({
        x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * b.x + t * t * to.x,
        y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * b.y + t * t * to.y,
      });
    }
  }
  path.push(pts[pts.length - 1]);
  // Fill in the long straights, so a point along the track is always close to one worked out.
  const fine = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
    for (let k = 1; k <= steps; k++) fine.push({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
  }
  return fine;
}

const around = (r: number, theta: number) => ({ x: CENTER.x + r * Math.cos(theta), y: CENTER.y + r * Math.sin(theta) });

export const TRACKS: Track[] = [
  // In clockwise from the top, 1.6 turns.
  trackFrom('spiral', 'Spiral', 1, traced((u) => around(445 - 270 * u, -Math.PI / 2 + u * 1.6 * 2 * Math.PI))),
  // Once most of the way round, waving in and out: five petals.
  trackFrom('flower', 'Flower', 0.8, traced((u) => around(330 + 110 * Math.cos(5 * u * 0.85 * 2 * Math.PI), -Math.PI / 2 + u * 0.85 * 2 * Math.PI))),
  // Down the left and back up, over the top, then down the right and back up.
  trackFrom('snake', 'Snake', 1, rounded([[100, 70], [100, 900], [260, 900], [260, 180], [740, 180], [740, 900], [900, 900], [900, 130]])),
  // A spiral with square corners, two rings in.
  trackFrom('square', 'Square', 0.9, rounded([[90, 100], [900, 100], [900, 900], [100, 900], [100, 280], [720, 280], [720, 720], [280, 720], [280, 450]])),
];

export function trackById(id: string) {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

/** The spiral's length: the pace is set for it, and longer tracks roll faster in proportion. */
const BASE_LENGTH = TRACKS[0].length;

/**
 * The point `s` along the track (0 is where marbles come in; its length is the hole). Before 0,
 * marbles queue in the tunnel, straight back from the entrance.
 */
export function trackPoint(track: Track, s: number): { x: number; y: number } {
  const { at, xs, ys, dir } = track;
  if (s <= 0) return { x: xs[0] + dir.x * s, y: ys[0] + dir.y * s };
  const last = at.length - 1;
  if (s >= at[last]) return { x: xs[last], y: ys[last] };
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at[mid] <= s) lo = mid;
    else hi = mid;
  }
  const f = (s - at[lo]) / (at[hi] - at[lo]);
  return { x: xs[lo] + (xs[hi] - xs[lo]) * f, y: ys[lo] + (ys[hi] - ys[lo]) * f };
}

/** The track drawn as a line: points every `step` units. */
export function trackOutline(track: Track, step = 8) {
  const points: { x: number; y: number }[] = [];
  for (let s = 0; s < track.length; s += step) points.push(trackPoint(track, s));
  points.push(trackPoint(track, track.length));
  return points;
}

/** How fast the chain rolls `ms` into the round, on `track`. */
export function chainSpeed(ms: number, track: Track = TRACKS[0]) {
  const pace = CHAIN_SPEED_START + (CHAIN_SPEED_END - CHAIN_SPEED_START) * Math.min(1, Math.max(0, ms / ROUND_MS));
  return (pace * track.pace * track.length) / BASE_LENGTH;
}

/** Where a turret aimed at `angle` (0 is up, clockwise) points from the middle. */
export function aimVector(angle: number) {
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

// ---- Scoring -------------------------------------------------------------------------------

/** Going out early still scores: up to this share of a round's points, by how long you lasted. */
export const OUT_SHARE = 0.7;

// ---- Views ---------------------------------------------------------------------------------

/**
 * 'ready': the countdown, with everyone's board set up.
 * 'play': the 90 seconds.
 * 'result': who survived, who went out when, and the points.
 * 'gameEnd': round scores.
 */
export type SpiralPhase = 'ready' | 'play' | 'result' | 'gameEnd';

/** One player's board, as the TV draws it. */
export interface SpiralBoardView {
  playerId: string;
  name: string;
  color: string;
  /** The chain: id, distance along the track, colour index; three numbers a marble, head first. */
  chain: number[];
  /** Shots in flight: id, x, y, colour index; four numbers a shot. */
  shots: number[];
  angle: number;
  /** The marble in the turret, and the one after it (colour indexes). */
  current: number;
  next: number;
  pops: number;
  /** The best chain reaction so far (pops set off one after another). */
  bestCombo: number;
  /** When they went out (ms into the round), or null while they're still in. */
  outAtMs: number | null;
  /** At the result: their place (1 for the best) and points. */
  place: number | null;
  points: number;
}

export interface SpiralHostView {
  phase: SpiralPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  msLeft: number;
  /** ms into the round (0 until it starts). */
  roundMs: number;
  /** This round's track (see TRACKS). */
  trackId: string;
  boards: SpiralBoardView[];
  /** Round scores, for the 'gameEnd' screen. */
  gamePoints: Record<string, number>;
}

export interface SpiralPlayerView {
  phase: SpiralPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  msLeft: number;
  current: number;
  next: number;
  pops: number;
  bestCombo: number;
  outAtMs: number | null;
  /** How many are still in, out of how many. */
  alive: number;
  playing: number;
  place: number | null;
  points: number;
  gamePoints: number;
  score: number;
}

export type SpiralInput =
  /** Where the turret points: 0 is up, clockwise, in radians. */
  | { type: 'aim'; angle: number }
  /** Swap the marble in the turret with the next one. */
  | { type: 'swap' };
