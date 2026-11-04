import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const POWER_BEAT: GameInfo = {
  id: 'power-beat',
  name: 'Power Beat',
  description: 'Tap in time with the beat to make power. Right on the beat makes the most; off the beat makes a little; mashing overloads you for a moment. Keep a streak going for a bonus. Most power in 45 seconds wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Most power wins; the beat gets quicker each round.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by best score. The beat runs on the
// server's clock from the round's epoch, so phones and the TV pulse together (see client/clock.ts),
// and taps carry the server time they were made at, so they're judged fairly.

export const ROUND_MS = 45_000;
/** The beat's tempo each round (beats a minute), quicker as the game goes on. */
export const TEMPOS = [96, 112, 128, 140];
/** On the beat within this (ms) is perfect, within GOOD_MS good; anything else is off. */
export const PERFECT_MS = 70;
export const GOOD_MS = 150;
export const POINTS = { perfect: 10, good: 4, off: 1 };
/** Every this many good-or-better taps in a row adds STREAK_BONUS. */
export const STREAK_STEP = 8;
export const STREAK_BONUS = 15;
/** More than this many taps a beat (over the last second) overloads you for OVERLOAD_MS. */
export const MASH_PER_BEAT = 2.2;
export const OVERLOAD_MS = 2_000;
/** Board size (board units). */
export const BOARD_W = 300;
export const BOARD_H = 420;

export const tempoFor = (round: number) => TEMPOS[Math.min(round, TEMPOS.length - 1)];
export const periodMs = (bpm: number) => 60_000 / bpm;

/** How far (ms) server time `t` is from the nearest beat. */
export function offBeat(t: number, epoch: number, period: number) {
  const phase = (((t - epoch) % period) + period) % period;
  return Math.min(phase, period - phase);
}

export interface BeatRound {
  /** Beat 0 is at `epoch` (server ms); one every `period` ms. */
  epoch: number;
  period: number;
}

export type Judgement = 'perfect' | 'good' | 'off' | 'overload';

export interface BeatState {
  power: number;
  streak: number;
  /** The last tap's judgement, counting up so a repeat still shows. */
  judged: Judgement | null;
  judgedId: number;
  /** Overloaded: taps don't count for this long. */
  overloadMs: number;
}

export type BeatHostView = BoardsHostView<BeatState, BeatRound>;
/** A phone gets the beat along with its board. */
export type BeatPlayerState = BeatState & BeatRound;
export type BeatPlayerView = BoardsPlayerView<BeatPlayerState>;

export type BeatInput = { type: 'tap'; at: number };
