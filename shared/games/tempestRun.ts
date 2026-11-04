import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const TEMPEST_RUN: GameInfo = {
  id: 'tempest-run',
  name: 'Tempest Run',
  description: 'Steer around the rim of a tube by turning your phone. Hazards climb up the lanes toward you: be in a clear lane when they arrive. Last one standing wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '90 seconds a round. Survive it for the bonus.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by survival. Everyone faces the same
// hazards (from the round's seed) on the same tube.

export const ROUND_MS = 90_000;
export const TICK_HZ = 30;
/** The board, in its own units (a 1000 × 1000 square), and the tube's middle. */
export const BOARD_SIZE = 1000;
export const CENTER = { x: 500, y: 520 };
/** The far end of the tube, as a share of the rim's size. */
export const INNER = 0.16;
/** How fast you can slide along the rim (lanes a second). */
export const LANES_PER_S = 22;
/** Turning the phone like a wheel moves you this many times as far round (a quarter turn each way reaches the far side). */
export const WHEEL_GAIN = 2;

export interface Tube {
  id: string;
  name: string;
  lanes: number;
  /** Closed tubes go all the way round; an open one has two ends you can't pass. */
  closed: boolean;
  /** The rim's distance from the middle at angle `a` (screen angle, y down). */
  radius: (a: number) => number;
  /** The angles the lanes span: from `start`, each `span` wide. */
  start: number;
  span: number;
  /** The tube's middle, down the board (an open fan sits higher, so it fills the board). */
  centerY: number;
}

const R = 430;
export const TUBES: Tube[] = [
  { id: 'circle', name: 'Circle', lanes: 16, closed: true, radius: () => R, start: -Math.PI / 2, span: (Math.PI * 2) / 16, centerY: CENTER.y },
  { id: 'square', name: 'Square', lanes: 16, closed: true, radius: (a) => (R * 0.86) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))), start: -Math.PI / 2 - Math.PI / 16, span: (Math.PI * 2) / 16, centerY: CENTER.y },
  { id: 'star', name: 'Star', lanes: 15, closed: true, radius: (a) => R * (0.8 + 0.2 * Math.cos(5 * (a + Math.PI / 2))), start: -Math.PI / 2 - Math.PI / 15, span: (Math.PI * 2) / 15, centerY: CENTER.y },
  // An open fan across the bottom, a V shape: you can't go round it.
  { id: 'fan', name: 'Fan', lanes: 12, closed: false, radius: (a) => 465 * (0.85 + 0.15 * Math.abs(Math.cos(a))), start: Math.PI * 0.05, span: (Math.PI * 0.9) / 12, centerY: 280 },
];

export function tubeById(id: string) {
  return TUBES.find((t) => t.id === id) ?? TUBES[0];
}

/** The middle of lane `lane`, as a screen angle. */
export function laneAngle(tube: Tube, lane: number) {
  return tube.start + (lane + 0.5) * tube.span;
}

/** A point on the rim (depth 1) or down the tube (depth 0 is the far end) at screen angle `a`. */
export function tubePoint(tube: Tube, a: number, depth: number) {
  const r = tube.radius(a) * (INNER + (1 - INNER) * depth);
  return { x: CENTER.x + r * Math.cos(a), y: tube.centerY + r * Math.sin(a) };
}

/**
 * Where steering puts you along the rim (as a lane position, 0 to lanes, lane centres at n + 0.5).
 * The middle is the bottom of the tube; turning right moves you right.
 */
export function targetPosition(tube: Tube, steer: number) {
  if (tube.closed) {
    const a = Math.PI / 2 - steer * WHEEL_GAIN;
    const p = (a - tube.start) / tube.span;
    return ((p % tube.lanes) + tube.lanes) % tube.lanes;
  }
  // The fan: a half turn of the wheel either way spans it, from its right end to its left.
  const a = Math.PI / 2 - steer * WHEEL_GAIN * 0.6;
  return Math.max(0.5, Math.min(tube.lanes - 0.5, (a - tube.start) / tube.span));
}

/** The lane a rim position is in. */
export function laneAt(tube: Tube, position: number) {
  const lane = Math.floor(position);
  return tube.closed ? ((lane % tube.lanes) + tube.lanes) % tube.lanes : Math.max(0, Math.min(tube.lanes - 1, lane));
}

// ---- Hazards -------------------------------------------------------------------------------

export interface Hazard {
  lane: number;
  /** When it appears at the far end, and when it reaches the rim (ms into the round). */
  spawnMs: number;
  arriveMs: number;
}

/** A repeatable random number in [0, 1) for (seed, n). */
function hash(seed: number, n: number) {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** Hazards come this often (ms between waves) and climb the tube this fast (ms), from the start to the end of the round. */
const WAVE_MS = [1400, 520];
const CLIMB_MS = [2600, 1300];
/** No wave covers more than this share of the lanes, so there's always somewhere to go. */
const MAX_COVER = 0.4;

/**
 * Every hazard in a round (the same for everyone): waves of one lane, a run of lanes side by side,
 * or a pair opposite each other, coming faster and climbing quicker as the round goes on.
 */
export function hazardsFor(seed: number, tube: Tube): Hazard[] {
  const hazards: Hazard[] = [];
  let n = 0;
  for (let ms = 1_500; ms < ROUND_MS; n++) {
    const f = ms / ROUND_MS;
    const climb = CLIMB_MS[0] + (CLIMB_MS[1] - CLIMB_MS[0]) * f;
    const lane = Math.floor(hash(seed, n * 3) * tube.lanes);
    const kind = hash(seed, n * 3 + 1);
    let lanes = [lane];
    if (kind > 0.75) {
      // A run of lanes side by side, longer later on.
      const width = Math.min(Math.floor(tube.lanes * MAX_COVER), Math.max(2, Math.round(2 + f * tube.lanes * MAX_COVER * 0.7)));
      lanes = Array.from({ length: width }, (_, i) => lane + i);
    } else if (kind > 0.55 && tube.closed) lanes = [lane, lane + Math.floor(tube.lanes / 2)];
    for (const l of lanes) {
      if (!tube.closed && (l < 0 || l >= tube.lanes)) continue;
      hazards.push({ lane: ((l % tube.lanes) + tube.lanes) % tube.lanes, spawnMs: ms, arriveMs: ms + climb });
    }
    ms += WAVE_MS[0] + (WAVE_MS[1] - WAVE_MS[0]) * f;
  }
  return hazards;
}

// ---- Views ---------------------------------------------------------------------------------

/** One player on their tube, as the TV draws it. */
export interface TempestBoardState {
  /** Where they are along the rim (lane position). */
  position: number;
}

export interface TempestRound {
  tubeId: string;
}

export type TempestHostView = BoardsHostView<TempestBoardState, TempestRound>;
export type TempestPlayerView = BoardsPlayerView<Record<string, never>>;

/** The steering angle (radians, clockwise positive) from the phone. */
export type SteerInput = { type: 'steer'; angle: number };
