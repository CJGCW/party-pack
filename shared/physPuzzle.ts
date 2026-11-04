// Physics puzzles (Draw Path, Contraption): a level of fixed ground, a ball and a goal. Each
// player adds things to their own copy (strokes they draw, parts they place), then taps Run: the
// server lets the ball go with real physics (planck.js) and records it, and the phone and TV play
// it back. The ball reaching the goal finishes the race. The world's in metres, y up, WORLD_W ×
// WORLD_H with the ground at 0; boards are drawn PX pixels a metre (y down) under a strip for the
// name.

import { trackAt, type Recording } from './volleys';

export const WORLD_W = 10;
export const WORLD_H = 6;
export const PX = 50;
export const TOP = 40;
export const BOARD_W = WORLD_W * PX;
export const BOARD_H = TOP + WORLD_H * PX;

/** Board pixels from world metres (y flips), and back. */
export const toBoard = (x: number, y: number) => ({ x: x * PX, y: TOP + (WORLD_H - y) * PX });
export const toWorld = (x: number, y: number) => ({ x: x / PX, y: WORLD_H - (y - TOP) / PX });

export interface PuzzleLevel {
  name: string;
  /** Fixed ground: outlines (world metres), each closed. */
  ground: [number, number][][];
  ball: { x: number; y: number; r: number };
  /** Reach this box (world metres: left, bottom, width, height) to finish. */
  goal: { x: number; y: number; w: number; h: number };
}

/** A thing that moves (the ball, a drawn stroke, a part): its outline in its own frame, and where it is. */
export interface PieceView {
  id: number;
  kind: 'ball' | 'stroke' | 'plank' | 'bouncer' | 'fan';
  /** A circle's radius, or outlines (board pixels, flat x, y pairs, around the piece's middle). */
  r: number;
  polys: number[][];
  x: number;
  y: number;
  a: number;
}

export interface PuzzleState {
  level: number;
  pieces: PieceView[];
  /** The last thing that moved (a stroke settling, or a run), played from `before`. */
  shot: Recording | null;
  before: PieceView[] | null;
  /** Counts up with each change, so a phone or TV knows to play the new one. */
  moveId: number;
  runs: number;
  /** The ball's been let go (a run's happened since the last retry). */
  released: boolean;
  /** The last run reached the goal (and when it did, in its recording's frames). */
  solved: boolean;
}

/** Where every piece is `seconds` into the last playback, or where they stand once it's done. */
export function piecesAt(s: PuzzleState, seconds: number | null): PieceView[] {
  if (seconds === null || !s.shot || !s.before) return s.pieces;
  const frame = seconds * s.shot.fps;
  if (frame >= s.shot.frames) return s.pieces;
  const tracks = new Map(s.shot.tracks.map((t) => [t.id, t]));
  const out: PieceView[] = [];
  for (const p of s.before) {
    const track = tracks.get(p.id);
    const at = track ? trackAt(track, frame) : 'before';
    if (at === 'gone') continue;
    out.push(at === 'before' ? p : { ...p, x: at.x, y: at.y, a: at.a });
  }
  // Something new during the playback (a stroke drawn just now): from its track.
  for (const track of s.shot.tracks) {
    if (s.before.some((p) => p.id === track.id)) continue;
    const p = s.pieces.find((o) => o.id === track.id);
    const at = trackAt(track, frame);
    if (p && typeof at === 'object') out.push({ ...p, x: at.x, y: at.y, a: at.a });
  }
  return out;
}
