// Volleys: games where everyone aims at once on their phone, then the server works out every shot
// (with physics) and records it, and the TV plays them all back side by side. A round is a few
// volleys; each player's board carries on from one to the next (see server/games/volleys.ts).

/**
 * 'aim': everyone aims and fires on their phone (it ends early once everyone has).
 * 'fly': the TV plays back everyone's shot.
 * 'result': how everyone did this round, and the points.
 * 'gameEnd': round scores.
 */
export type VolleyPhase = 'aim' | 'fly' | 'result' | 'gameEnd';

/**
 * How a thing moved during a shot: keyframes of frame, x, y, angle (four numbers each, only when
 * it moved), and the frame it went (null if it stayed). Between keyframes, the TV moves it
 * smoothly; before the first, it's where the board had it.
 */
export interface Track {
  id: number;
  keys: number[];
  goneAt: number | null;
}

/** A shot's recording: frames a second, how many, and every thing that moved. */
export interface Recording {
  fps: number;
  frames: number;
  tracks: Track[];
}

/** Where a recording has a thing `frame` frames in (frame can be fractional), or null before it starts / after it's gone. */
export function trackAt(track: Track, frame: number): { x: number; y: number; a: number } | 'before' | 'gone' {
  if (track.goneAt !== null && frame >= track.goneAt) return 'gone';
  const k = track.keys;
  if (!k.length || frame < k[0]) return 'before';
  for (let i = 0; i + 4 < k.length; i += 4) {
    if (frame < k[i + 4]) {
      const t = (frame - k[i]) / Math.max(1e-6, k[i + 4] - k[i]);
      return { x: k[i + 1] + (k[i + 5] - k[i + 1]) * t, y: k[i + 2] + (k[i + 6] - k[i + 2]) * t, a: k[i + 3] + (k[i + 7] - k[i + 3]) * t };
    }
  }
  const last = k.length - 4;
  return { x: k[last + 1], y: k[last + 2], a: k[last + 3] };
}

export interface VolleyBoardView<S> {
  playerId: string;
  name: string;
  color: string;
  /** Fired this volley (or the time's up). */
  locked: boolean;
  /** The game's score for the board so far this round. */
  boardScore: number;
  place: number | null;
  points: number;
  state: S;
}

export interface VolleyHostView<S, R = null> {
  phase: VolleyPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  /** Which volley of the round (1-based), of how many. */
  volley: number;
  totalVolleys: number;
  msLeft: number;
  phaseMs: number;
  seed: number;
  boards: VolleyBoardView<S>[];
  gamePoints: Record<string, number>;
  round: R;
}

export interface VolleyPlayerView<P> {
  phase: VolleyPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  volley: number;
  totalVolleys: number;
  msLeft: number;
  /** The round's seed (what everyone's board is built from). */
  seed: number;
  /** False if they joined after the round started (they get a board next round). */
  hasBoard: boolean;
  locked: boolean;
  /** How many have fired this volley, out of how many. */
  lockedCount: number;
  playing: number;
  boardScore: number;
  place: number | null;
  points: number;
  gamePoints: number;
  score: number;
  state: P | null;
}
