import type { Rank } from '../cards';
import type { GameInfo } from '../protocol';

/** What every hand is aiming for. */
export const TARGET = 21;
/** No 10s or face cards: each deck is Ace to 9 in four suits (36 cards). */
export const TWENTY_ONE_RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9'];

export const TWENTY_ONE: GameInfo = {
  id: 'twentyOne',
  name: 'Twenty-One',
  description: 'Two cards face down, then draw face up or hold. Closest to 21 without going over wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Ace to 9 only, one deck per player.' }],
};

export type TwentyOnePhase = 'dealing' | 'playing' | 'handEnd' | 'gameEnd';

export type SeatStatus = 'playing' | 'held' | 'bust';

/** A hand's total: aces count 11 when that doesn't bust it (`soft`), otherwise 1. */
export interface HandTotal {
  total: number;
  soft: boolean;
}

/** What happened last, for the TV and phones to call out. */
export interface TwentyOneAction {
  seq: number;
  playerId: string;
  kind: 'draw' | 'hold' | 'bust' | 'timeout';
  /** The card drawn, for 'draw' and 'bust'. */
  card?: string;
}

/**
 * A seat at the table, as everyone sees it. `hole` (the two face-down card ids) is only filled
 * in once they're turned over: when the player busts, and for everyone at the end of the hand.
 */
export interface TwentyOneSeat {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  hole: [string, string] | null;
  /** Face-up cards, in the order drawn. */
  up: string[];
  /** The total of the face-up cards alone. */
  showing: HandTotal;
  /** The whole hand's total, once the hole cards are shown. */
  total: HandTotal | null;
  status: SeatStatus;
  /** At the end of the hand: closest to 21. */
  winner: boolean;
  handPoints: number;
  gamePoints: number;
  score: number;
}

interface ViewBase {
  phase: TwentyOnePhase;
  hand: number;
  totalHands: number;
  /** Whose turn it is, or null. */
  turn: string | null;
  msLeft: number;
  /** Cards left in the shoe. */
  shoe: number;
  lastAction: TwentyOneAction | null;
  seats: TwentyOneSeat[];
}

export type TwentyOneHostView = ViewBase;

export interface TwentyOnePlayerView extends ViewBase {
  /** Your seat's id, or null if you're not dealt in this hand. */
  you: string | null;
  /** Your own face-down cards (always shown to you), or null if you're not dealt in. */
  myHole: [string, string] | null;
  /** Your whole hand's total. */
  myTotal: HandTotal | null;
}

export type TwentyOneInput = { type: 'draw' } | { type: 'hold' };

const PIPS: Record<string, number> = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9 };

/** A hand's total from card ids ("AS", "7H"): aces count 11 if that keeps it at 21 or under. */
export function handTotal(cardIds: readonly string[]): HandTotal {
  let total = 0;
  let aces = 0;
  for (const id of cardIds) {
    const rank = id.slice(0, -1);
    total += PIPS[rank] ?? 0;
    if (rank === 'A') aces++;
  }
  if (aces > 0 && total + 10 <= TARGET) return { total: total + 10, soft: true };
  return { total, soft: false };
}

/** "17", or "7 / 17" for a soft hand. */
export function totalLabel({ total, soft }: HandTotal) {
  return soft ? `${total - 10} / ${total}` : String(total);
}
