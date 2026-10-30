import { cardId } from '../../shared/cards';
import {
  TARGET,
  TWENTY_ONE,
  TWENTY_ONE_RANKS,
  handTotal,
  type SeatStatus,
  type TwentyOneAction,
  type TwentyOneHostView,
  type TwentyOneInput,
  type TwentyOnePhase,
  type TwentyOnePlayerView,
  type TwentyOneSeat,
} from '../../shared/games/twentyOne';
import { PUZZLE_POINTS } from '../../shared/scoring';
import { ROUND_SCORES_MS } from '../../shared/timing';
import { Deck } from './cards';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';

/** The deal, before the first turn. */
const DEALING_MS = 2_500;
/** Each turn: draw or hold, or it holds for you. */
export const TURN_MS = 20_000;
/** The hole cards turned over, totals and the winner. Longer than a puzzle result: there's more to take in. */
const HAND_END_MS = 7_000;
/** Hands that didn't bust but didn't win: this much per point of their total (18 scores 360). */
export const POINTS_PER_PIP = 20;

/** Points for a hand: the best total(s) win PUZZLE_POINTS, other hands at or under 21 a little, busts nothing. */
export function handPoints(total: number, best: number) {
  if (total > TARGET) return 0;
  return total === best ? PUZZLE_POINTS : total * POINTS_PER_PIP;
}

interface Seat {
  id: string;
  hole: string;
  up: string[];
  status: SeatStatus;
  winner: boolean;
  handPoints: number;
}

class TwentyOne implements MiniGame {
  private phase: TwentyOnePhase = 'dealing';
  private hand = 0;
  private seats: Seat[] = [];
  private shoe = new Deck({ ranks: TWENTY_ONE_RANKS, reshuffleDiscards: false });
  private turnIndex = -1;
  private lastAction: TwentyOneAction | null = null;
  private actionSeq = 0;
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalHands: number,
  ) {}

  start() {
    this.startHand(1);
  }

  private setPhase(phase: TwentyOnePhase, durationMs: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + durationMs;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, durationMs);
    this.syncAll();
  }

  private startHand(hand: number) {
    this.hand = hand;
    this.lastAction = null;
    // A fresh shoe each hand: one deck per player, Ace to 9.
    const players = this.ctx.players().filter((p) => p.connected);
    this.shoe = new Deck({ ranks: TWENTY_ONE_RANKS, decks: Math.max(1, players.length), reshuffleDiscards: false });
    const dealt = this.shoe.deal(players.length, 2);
    this.seats = players.map((p, i) => ({
      id: p.id,
      // Like blackjack: the first card face down, the second face up.
      hole: cardId(dealt[i][0]),
      up: [cardId(dealt[i][1])],
      status: 'playing',
      winner: false,
      handPoints: 0,
    }));
    // Seats stay put; the first turn moves one seat round each hand.
    this.turnIndex = (hand - 2 + this.seats.length) % Math.max(1, this.seats.length);
    this.setPhase('dealing', DEALING_MS, () => this.nextTurn());
  }

  /** Moves to the next seat still playing, round the table; ends the hand when there's none. */
  private nextTurn() {
    for (let step = 1; step <= this.seats.length; step++) {
      const i = (this.turnIndex + step) % this.seats.length;
      const seat = this.seats[i];
      if (seat.status !== 'playing') continue;
      this.turnIndex = i;
      // Someone who has left holds straight away, so nobody waits on them.
      if (!this.isConnected(seat.id)) {
        this.act(seat, 'hold');
        return;
      }
      this.setPhase('playing', TURN_MS, () => this.act(seat, 'timeout'));
      return;
    }
    this.endHand();
  }

  private act(seat: Seat, kind: 'draw' | 'hold' | 'timeout') {
    const drawn = kind === 'draw' ? this.shoe.draw() : null;
    if (drawn) {
      const card = cardId(drawn);
      seat.up.push(card);
      const bust = handTotal([seat.hole, ...seat.up]).total > TARGET;
      if (bust) seat.status = 'bust';
      this.lastAction = { seq: ++this.actionSeq, playerId: seat.id, kind: bust ? 'bust' : 'draw', card };
    } else {
      // Holding, out of time, or (never with one deck a player) an empty shoe.
      seat.status = 'held';
      this.lastAction = { seq: ++this.actionSeq, playerId: seat.id, kind: kind === 'timeout' ? 'timeout' : 'hold' };
    }
    this.nextTurn();
  }

  private endHand() {
    this.turnIndex = -1;
    const totals = this.seats.map((s) => handTotal([s.hole, ...s.up]).total);
    const best = Math.max(0, ...totals.filter((t) => t <= TARGET));
    this.seats.forEach((seat, i) => {
      seat.winner = best > 0 && totals[i] === best;
      seat.handPoints = handPoints(totals[i], best);
      if (seat.handPoints) {
        this.ctx.addScore(seat.id, seat.handPoints);
        this.gamePoints.set(seat.id, (this.gamePoints.get(seat.id) ?? 0) + seat.handPoints);
      }
    });
    const isLast = this.hand >= this.totalHands;
    this.setPhase('handEnd', HAND_END_MS, () => {
      if (!isLast) this.startHand(this.hand + 1);
      // With a single hand, round scores would just repeat the result, so skip them.
      else if (this.totalHands === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as TwentyOneInput;
    if (this.phase !== 'playing' || (input?.type !== 'draw' && input?.type !== 'hold')) return;
    const seat = this.seats[this.turnIndex];
    if (!seat || seat.id !== playerId) return;
    this.act(seat, input.type);
  }

  private isConnected(id: string) {
    return !!this.ctx.players().find((p) => p.id === id)?.connected;
  }

  private get revealing() {
    return this.phase === 'handEnd' || this.phase === 'gameEnd';
  }

  private base() {
    const players = this.ctx.players();
    const seats: TwentyOneSeat[] = this.seats.map((seat) => {
      const p = players.find((pl) => pl.id === seat.id);
      const shown = this.revealing || seat.status === 'bust';
      return {
        id: seat.id,
        name: p?.name ?? '?',
        color: p?.color ?? '#888888',
        connected: !!p?.connected,
        hole: shown ? seat.hole : null,
        up: seat.up,
        showing: handTotal(seat.up),
        total: shown ? handTotal([seat.hole, ...seat.up]) : null,
        status: seat.status,
        winner: seat.winner,
        handPoints: seat.handPoints,
        gamePoints: this.gamePoints.get(seat.id) ?? 0,
        score: p?.score ?? 0,
      };
    });
    return {
      phase: this.phase,
      hand: this.hand,
      totalHands: this.totalHands,
      turn: this.phase === 'playing' ? (this.seats[this.turnIndex]?.id ?? null) : null,
      msLeft: Math.max(0, this.phaseEndsAt - Date.now()),
      shoe: this.shoe.remaining,
      lastAction: this.lastAction,
      seats,
    };
  }

  syncHost() {
    this.ctx.sendHost(this.base() satisfies TwentyOneHostView);
  }

  syncPlayer(playerId: string) {
    const seat = this.seats.find((s) => s.id === playerId);
    const view: TwentyOnePlayerView = {
      ...this.base(),
      you: seat?.id ?? null,
      myHole: seat?.hole ?? null,
      myTotal: seat ? handTotal([seat.hole, ...seat.up]) : null,
    };
    this.ctx.sendPlayer(playerId, view);
  }

  private syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const twentyOne: MiniGameDefinition = {
  info: TWENTY_ONE,
  create: (ctx, _modeId, options) => new TwentyOne(ctx, options.puzzles),
};
