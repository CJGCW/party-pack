import type { GameInfo } from '../protocol';

export const SNATCH: GameInfo = {
  id: 'snatch',
  name: 'Snatch',
  description: 'A cover lifts: if it is the golden treasure, tap first to grab it! If it is a trap, or you tap before it lifts, you are locked out of that grab. Seven grabs a round; most grabs wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Seven grabs a round; most grabs wins.' }],
};

// A quick reaction game. Every reveal is scheduled on the server's clock ahead of time, so phones
// and the TV show it at the same moment (see client/clock.ts), and taps carry the server time they
// were made at, so a slow connection doesn't cost anyone.

export const GRABS = 7;
/** The cover stays down a random while (between these), then lifts. */
export const WAIT_MIN_MS = 1_500;
export const WAIT_MAX_MS = 4_500;
/** A treasure stays up this long; a trap this long before the cover drops again. */
export const TREASURE_MS = 2_500;
export const TRAP_MS = 1_300;
/** After the first good tap, this long for any earlier one still on its way. */
export const GRACE_MS = 300;
/** Showing who grabbed it. */
export const WON_MS = 2_200;

export type SnatchPhase = 'grab' | 'won' | 'result' | 'gameEnd';

export interface SnatchPlayer {
  id: string;
  name: string;
  color: string;
  grabs: number;
  /** Locked out of this grab (tapped early, or a trap). */
  locked: boolean;
  points: number;
  gamePoints: number;
}

export interface SnatchView {
  phase: SnatchPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  grab: number;
  /** When the cover lifts, what's under it, and when it drops again (server time, ms). */
  revealAt: number;
  kind: 'treasure' | 'trap';
  hideAt: number;
  /** Who grabbed this one, and how quickly (ms after it lifted). */
  winner: string | null;
  reaction: number | null;
  players: SnatchPlayer[];
  msLeft: number;
  /** On a phone: whose phone it is. */
  you?: string;
}

export type SnatchInput = { type: 'tap'; at: number };
