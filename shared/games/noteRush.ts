import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const NOTE_RUSH: GameInfo = {
  id: 'note-rush',
  name: 'Note Rush',
  description: 'Notes scroll down four lanes to the music. Tap the lane on your phone as each note hits the line: dead on scores most. Same song for everyone; most points wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Most points wins; the songs get busier each round.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by best score. Each round's chart
// comes from its seed: an original little tune the TV plays (each note's pitch from its lane),
// on the server's clock (see client/clock.ts). Taps carry the time they were made and the
// server judges them against the chart.

export const ROUND_MS = 45_000;
export const LANES = 4;
/** Each round's tempo (beats a minute). */
export const TEMPOS = [100, 112, 124, 136];
/** A note shows this long before it reaches the line. */
export const LEAD_MS = 1_600;
/** Within these (ms) of a note is perfect, good, or just in. */
export const PERFECT_MS = 50;
export const GOOD_MS = 100;
export const OK_MS = 150;
export const HIT_POINTS = { perfect: 100, good: 60, ok: 30 };
/** A tap with no note near it costs this. */
export const STRAY_COST = 10;
/** The notes' pitches (a pentatonic scale, so any run of them sounds fine), lane by lane, low to high. */
export const LANE_PITCHES = [
  [261.6, 293.7],
  [329.6, 392.0],
  [440.0, 523.3],
  [587.3, 659.3],
];

export interface Note {
  lane: number;
  /** When it reaches the line (ms after the round's epoch). */
  at: number;
  /** Which of the lane's two pitches. */
  high: boolean;
}

/** Round `round`'s chart: eighth notes chosen from the seed, busier as the song goes on and each round. */
export function chartFor(seed: number, round: number): Note[] {
  let s = (seed + round * 31_337) >>> 0 || 1;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const beat = 60_000 / TEMPOS[Math.min(round, TEMPOS.length - 1)];
  const notes: Note[] = [];
  let lane = 1;
  for (let t = 1_500; t < ROUND_MS - 1_500; t += beat / 2) {
    const k = t / ROUND_MS;
    const onBeat = Math.round(t / (beat / 2)) % 2 === 0;
    const chance = (onBeat ? 0.55 : 0.18) + 0.25 * k + 0.08 * round;
    if (random() > chance) continue;
    // Mostly a step to a neighbouring lane, now and then a jump.
    lane = random() < 0.7 ? Math.max(0, Math.min(LANES - 1, lane + (random() < 0.5 ? -1 : 1))) : Math.floor(random() * LANES);
    notes.push({ lane, at: Math.round(t), high: random() < 0.5 });
  }
  return notes;
}

export type Hit = 'perfect' | 'good' | 'ok' | 'miss' | 'stray';

export interface NoteRound {
  epoch: number;
  round: number;
}

export interface NoteState {
  points: number;
  combo: number;
  best: number;
  /** Notes hit (by index), for the TV to stop drawing them. */
  hit: number[];
  /** The last tap's judgement and lane, counting up so a repeat still shows. */
  judged: Hit | null;
  judgedLane: number;
  judgedId: number;
}

export type NoteHostView = BoardsHostView<NoteState, NoteRound>;
export type NotePlayerState = NoteState & NoteRound;
export type NotePlayerView = BoardsPlayerView<NotePlayerState>;

export type NoteInput = { type: 'tap'; lane: number; at: number };
