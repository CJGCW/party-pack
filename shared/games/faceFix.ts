import type { GameInfo } from '../protocol';
import type { VolleyHostView, VolleyPlayerView } from '../volleys';

export const FACE_FIX: GameInfo = {
  id: 'face-fix',
  name: 'Face Fix',
  description: 'The TV shows a face. Yours is all wrong: drag the eyes, nose and mouth into place and stretch the face to match, then lock it in. Closest match wins. Three faces a round.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Three faces a round; closest matches win.' }],
};

// A volleys game (see shared/volleys.ts): each volley's a face to copy. A face is a few numbers
// (all as shares of the face's own size, so they can be compared): the target comes from the
// seed, and so does everyone's scrambled start.

export const FACES = 3;
export const FIX_MS = 35_000;
export const REVEAL_MS = 5_000;

export interface Face {
  /** The face's width and height (0.6 to 1.4 of normal). */
  w: number;
  h: number;
  /** The eyes: how high (-0.5 top to 0.5 bottom) and how far apart (0.1 to 0.7 of the width). */
  eyeY: number;
  eyeGap: number;
  noseY: number;
  mouthY: number;
  /** The mouth's width (0.15 to 0.8 of the face's). */
  mouthW: number;
}

/** What each number can be. */
export const RANGES: Record<keyof Face, [number, number]> = {
  w: [0.6, 1.4],
  h: [0.6, 1.4],
  eyeY: [-0.45, 0.1],
  eyeGap: [0.15, 0.7],
  noseY: [-0.2, 0.3],
  mouthY: [0.1, 0.45],
  mouthW: [0.15, 0.8],
};

const rand = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
};

function randomFace(random: () => number): Face {
  const f = {} as Face;
  for (const [k, [lo, hi]] of Object.entries(RANGES) as [keyof Face, [number, number]][]) f[k] = lo + random() * (hi - lo);
  // Keep the parts in a sensible order down the face.
  f.noseY = Math.max(f.noseY, f.eyeY + 0.12);
  f.mouthY = Math.max(f.mouthY, f.noseY + 0.12);
  return f;
}

/** Face number `n`'s target, and the scrambled face everyone starts from. */
export function facesFor(seed: number, n: number) {
  const random = rand(seed + n * 15_485_863);
  return { target: randomFace(random), start: randomFace(random) };
}

export const clampFace = (f: Face): Face =>
  Object.fromEntries((Object.entries(RANGES) as [keyof Face, [number, number]][]).map(([k, [lo, hi]]) => [k, Math.max(lo, Math.min(hi, Number.isFinite(f[k]) ? f[k] : lo))])) as unknown as Face;

/** How close a face is to the target: 100 spot on, down to 0, by the average difference (as a share of each range). */
export function matchScore(f: Face, target: Face) {
  const keys = Object.keys(RANGES) as (keyof Face)[];
  const off = keys.reduce((n, k) => n + Math.abs(f[k] - target[k]) / (RANGES[k][1] - RANGES[k][0]), 0) / keys.length;
  return Math.max(0, Math.round(100 * (1 - off * 3)));
}

/** Where a face's parts go, drawn at (cx, cy) with a normal face `size` across. */
export function faceGeometry(f: Face, cx: number, cy: number, size: number) {
  const rx = (size / 2) * f.w;
  const ry = (size / 2) * 1.25 * f.h;
  return {
    rx,
    ry,
    eyeR: size * 0.06,
    eyes: [
      { x: cx - f.eyeGap * rx, y: cy + f.eyeY * ry },
      { x: cx + f.eyeGap * rx, y: cy + f.eyeY * ry },
    ],
    nose: { x: cx, y: cy + f.noseY * ry },
    mouth: { x: cx, y: cy + f.mouthY * ry, w: f.mouthW * rx * 2 },
  };
}

export interface FixAim {
  face: Face | null;
}

export interface FixBoardState {
  done: boolean;
  /** At the reveal: their face and its match. */
  face: Face | null;
  match: number | null;
}

export interface FixPlayerState {
  start: Face;
  face: number;
  match: number | null;
}

export type FixHostView = VolleyHostView<FixBoardState, { face: number }>;
export type FixPlayerView = VolleyPlayerView<FixPlayerState>;

export type FixInput = { type: 'aim' | 'fire'; face: Face };
