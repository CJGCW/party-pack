import type { GameInfo } from '../protocol';

export const PEG_DROP: GameInfo = {
  id: 'peg-drop',
  name: 'Peg Drop',
  description: 'Take turns firing a ball into a board of pegs on the TV, aiming by turning your phone. Gold pegs score big; most points on the board wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Turn your phone like a steering wheel to aim.' }],
};

// ---- The board, in TV pixels (1920 x 1080) -------------------------------------------------

export const BOARD_LEFT = 400;
export const BOARD_RIGHT = 1520;
export const BOARD_TOP = 90;
/** The ball is gone once it drops below this. */
export const BOARD_BOTTOM = 1080;
export const LAUNCHER = { x: (BOARD_LEFT + BOARD_RIGHT) / 2, y: 150 };
/** The launcher swings this far either side of straight down (radians). */
export const MAX_AIM = (80 * Math.PI) / 180;

export const BALL_R = 12;
export const PEG_R = 15;
export const GRAVITY = 1500;
export const LAUNCH_SPEED = 950;

/** The bucket sliding along the bottom: catch the ball in it for a free ball. */
export const CATCHER = { y: 1030, width: 190, height: 28, amplitude: 420, periodS: 4.5 };

/** The bucket's centre `t` seconds into shot number `shot` (the TV and server agree on it). */
export function catcherX(shot: number, t: number) {
  const phase = shot * 2.1;
  return LAUNCHER.x + CATCHER.amplitude * Math.sin(phase + (2 * Math.PI * t) / CATCHER.periodS);
}

/** Where the ball is `t` seconds after leaving the launcher at `angle`, before it hits anything. */
export function flightAt(angle: number, t: number) {
  return {
    x: LAUNCHER.x + Math.sin(angle) * LAUNCH_SPEED * t,
    y: LAUNCHER.y + Math.cos(angle) * LAUNCH_SPEED * t + 0.5 * GRAVITY * t * t,
  };
}

// ---- Scoring -------------------------------------------------------------------------------

export const BLUE_POINTS = 10;
export const GOLD_POINTS = 100;
/** Hitting the last gold peg ends the board, with this bonus (before the multiplier). */
export const CLEAR_BONUS = 1000;

/** Every peg's points are multiplied as the board's gold pegs get cleared. */
export function multiplierFor(goldCleared: number, goldTotal: number) {
  const share = goldTotal ? goldCleared / goldTotal : 0;
  return share >= 0.85 ? 5 : share >= 0.65 ? 3 : share >= 0.4 ? 2 : 1;
}

/** Balls each player gets per board: fewer each with more players, so a board takes about as long. */
export function ballsPerPlayer(players: number) {
  return Math.max(3, Math.ceil(12 / Math.max(1, players)));
}

// ---- Views ---------------------------------------------------------------------------------

export interface Peg {
  x: number;
  y: number;
  gold: boolean;
  /** Cleared by an earlier shot. */
  gone: boolean;
}

/** A shot, worked out by the server as soon as it's fired, for the TV to play back. */
export interface Shot {
  angle: number;
  /** Which shot of the board this is (the bucket's position depends on it). */
  number: number;
  /** Ball positions every `step` seconds: x0, y0, x1, y1, … */
  path: number[];
  step: number;
  /** Each peg hit, when, and the points it scored (with the multiplier at that moment). */
  hits: { t: number; peg: number; points: number; multiplier: number }[];
  /** A ball that's stuck clears the pegs it has hit so far, early: when, and which. */
  pops: { t: number; pegs: number[] }[];
  /** When the ball drops out (or into the bucket). */
  endT: number;
  caught: boolean;
  /** The shot's total, including the clear bonus. */
  points: number;
  /** The shot hit the last gold peg. */
  cleared: boolean;
  /** When it hit the last gold peg (null if it didn't). */
  clearT: number | null;
}

// ---- Playback ------------------------------------------------------------------------------

/** The shot that clears the board plays out in slow motion around the last gold peg: from `lead`
 * seconds before it's hit to `tail` after, at `rate` speed. */
export const SLOW_MO = { lead: 0.6, tail: 0.35, rate: 0.25 };
/** After a shot that clears the board, extra time for the celebration. */
export const CLEAR_CELEBRATION_MS = 2_500;

function slowMoSpan(shot: Shot) {
  if (shot.clearT === null) return null;
  const from = Math.max(0, shot.clearT - SLOW_MO.lead);
  const to = Math.min(shot.endT, shot.clearT + SLOW_MO.tail);
  return { from, to, realLength: (to - from) / SLOW_MO.rate };
}

/** Seconds the TV takes to play a shot back (longer than the shot itself if it's in slow motion). */
export function playbackSeconds(shot: Shot) {
  const span = slowMoSpan(shot);
  return span ? shot.endT - (span.to - span.from) + span.realLength : shot.endT;
}

/** The shot's own time, `real` seconds into playing it back, and whether that's in slow motion. */
export function shotTimeAt(shot: Shot, real: number) {
  const span = slowMoSpan(shot);
  if (!span || real <= span.from) return { t: real, slow: false };
  if (real <= span.from + span.realLength) return { t: span.from + (real - span.from) * SLOW_MO.rate, slow: true };
  return { t: span.to + (real - span.from - span.realLength), slow: false };
}

/**
 * 'aim': the shooter turns their phone to aim and taps Fire.
 * 'shot': the ball bounces down on the TV.
 * 'boardEnd': the board's scores.
 * 'gameEnd': round scores.
 */
export type PegPhase = 'aim' | 'shot' | 'boardEnd' | 'gameEnd';

export interface PegHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  ballsLeft: number;
  boardPoints: number;
  /** At the board's end: the points it earned on the shared scale. */
  points: number;
  gamePoints: number;
}

export interface PegHostView {
  phase: PegPhase;
  boardNumber: number;
  totalBoards: number;
  pegs: Peg[];
  shooterId: string;
  /** The launcher's angle: 0 is straight down, positive toward the right. */
  angle: number;
  shotNumber: number;
  shot: Shot | null;
  msLeft: number;
  phaseMs: number;
  multiplier: number;
  goldLeft: number;
  goldTotal: number;
  players: PegHostPlayer[];
}

export interface PegPlayerView {
  phase: PegPhase;
  boardNumber: number;
  totalBoards: number;
  isShooter: boolean;
  shooterName: string;
  /** Shots until this player's next turn (0 while it is), or null if they're out of balls. */
  turnsAway: number | null;
  ballsLeft: number;
  boardPoints: number;
  /** At the board's end: the points it earned on the shared scale. */
  points: number;
  gamePoints: number;
  score: number;
  msLeft: number;
  multiplier: number;
  goldLeft: number;
}

export type PegInput =
  /** Where the shooter's aiming (sent as it changes), and Fire. */
  { type: 'aim'; angle: number } | { type: 'fire'; angle: number };
