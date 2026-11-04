import {
  bestPoints,
  finishPoints,
  survivalPoints,
  type BoardView,
  type BoardsHostView,
  type BoardsPhase,
  type BoardsPlayerView,
  type BoardsScoring,
} from '../../shared/boards';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame } from './MiniGame';

/** The countdown before each round. */
export const READY_MS = 3_000;
/** At the result, a little longer than other games: there's a board each to look at. */
const RESULT_MS = PUZZLE_RESULT_MS + 2_000;

export interface BoardsOptions {
  roundMs: number;
  scoring: BoardsScoring;
  /** Steps every board this many times a second during play (0 for a game that only changes on input). */
  tickHz: number;
  /** With a tick: the TV gets the boards every this many ticks. */
  hostEveryTicks?: number;
  /** Survival: the round ends when only one run's still going (with two or more playing). */
  lastOneStanding?: boolean;
}

interface Entry<B> {
  board: B;
  endedAtMs: number | null;
  place: number | null;
  points: number;
  /** What the phone last got, so the tick only sends it again when something it shows changes. */
  sentKey: string;
}

/**
 * Side-by-side boards (see shared/boards.ts): a board per player, all from one seed, run by the
 * server. This runs the rounds (countdown, play, result, round scores), steps the boards, scores
 * them and sends the views; a game says how its boards are made, step, take input and look.
 *
 * `B` is a board, `S` what the TV gets of one, `P` what its player's phone gets, `R` anything the
 * whole round shares (e.g. Spiral Shot's track).
 */
export abstract class BoardsGame<B, S, P, R = null> implements MiniGame {
  protected phase: BoardsPhase = 'ready';
  protected puzzleIndex = 0;
  protected seed = 0;
  protected entries = new Map<string, Entry<B>>();
  private gamePoints = new Map<string, number>();
  private roundStartedAt = 0;
  private phaseEndsAt = 0;
  private ticks = 0;
  private timer: NodeJS.Timeout | null = null;
  private ticker: NodeJS.Timeout | null = null;
  /** For sending garbage: whose turn it is next to get each sender's (by sender). */
  private garbageTurn = new Map<string, number>();

  constructor(
    protected readonly ctx: GameContext,
    protected readonly totalPuzzles: number,
    protected readonly options: BoardsOptions,
  ) {}

  /** A new board for player number `index` this round, from the round's seed. */
  protected abstract newBoard(seed: number, index: number): B;
  /** What the TV gets of a board. */
  protected abstract hostState(board: B): S;
  /** What the board's player's phone gets. */
  protected abstract playerState(board: B): P;
  /**
   * A player's input (in the countdown or during play, while their run is going). Returns 'ended'
   * if it ended their run, true if it changed something their phone or the TV shows.
   */
  protected abstract boardInput(board: B, input: unknown): 'ended' | boolean;
  /** Steps a board on by `dt` seconds, `roundMs` into the round. Returns true if its run ended. */
  protected stepBoard(_board: B, _dt: number, _roundMs: number): boolean {
    return false;
  }
  /** The board's score, for 'best' scoring (and shown on the TV). */
  protected boardScore(_board: B): number {
    return 0;
  }
  /** How far a board's got, 0 to 1, for 'race' scoring (a run that finishes ends). */
  protected boardProgress(_board: B): number {
    return 0;
  }
  /**
   * A board gets `amount` of garbage from a rival (see sendGarbage). Games with garbage keep it
   * on the board and add it when it suits them (e.g. after the next shot lands).
   */
  protected receiveGarbage(_board: B, _amount: number): void {}
  /**
   * Sends garbage from a board to a rival whose run's still going: in turn round the others, so
   * with three or more nobody gets it all. Returns who got it (null if nobody's left to).
   */
  protected sendGarbage(from: B, amount: number): string | null {
    if (amount <= 0) return null;
    const ids = [...this.entries.keys()];
    const fromId = ids.find((id) => this.entries.get(id)!.board === from);
    if (!fromId) return null;
    const rivals = ids.filter((id) => id !== fromId && this.entries.get(id)!.endedAtMs === null);
    if (!rivals.length) return null;
    const turn = this.garbageTurn.get(fromId) ?? ids.indexOf(fromId);
    this.garbageTurn.set(fromId, turn + 1);
    const to = rivals[turn % rivals.length];
    this.receiveGarbage(this.entries.get(to)!.board, amount);
    this.syncPlayer(to);
    return to;
  }
  /** Called as each round starts, before the boards are made (e.g. to pick something for the round). */
  protected beforeRound(): void {}
  /** What the whole round shares, for the TV. */
  protected roundState(): R {
    return null as R;
  }

  start() {
    this.startRound(0);
  }

  private setPhase(phase: BoardsPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startRound(index: number) {
    this.puzzleIndex = index;
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.garbageTurn.clear();
    this.beforeRound();
    this.entries = new Map(
      this.ctx.players().map((p, i) => [p.id, { board: this.newBoard(this.seed, i), endedAtMs: null, place: null, points: 0, sentKey: '' }]),
    );
    this.setPhase('ready', READY_MS, () => {
      this.roundStartedAt = Date.now();
      this.ticks = 0;
      if (this.options.tickHz > 0) this.ticker = setInterval(() => this.tick(), 1000 / this.options.tickHz);
      this.setPhase('play', this.options.roundMs, () => this.endRound());
    });
  }

  /** ms into the round (0 before it starts). */
  protected roundMs() {
    return this.phase === 'play' ? Math.min(this.options.roundMs, Date.now() - this.roundStartedAt) : 0;
  }

  private tick() {
    if (this.phase !== 'play') return;
    const ms = this.roundMs();
    for (const [playerId, e] of this.entries) {
      if (e.endedAtMs !== null) continue;
      if (this.stepBoard(e.board, 1 / this.options.tickHz, ms)) e.endedAtMs = ms;
      this.syncPlayer(playerId, true);
    }
    if (this.allEnded()) return this.endRound();
    if (++this.ticks % (this.options.hostEveryTicks ?? 2) === 0) this.syncHost();
  }

  private allEnded() {
    const all = [...this.entries.values()];
    const going = all.filter((e) => e.endedAtMs === null).length;
    return going === 0 || (!!this.options.lastOneStanding && all.length > 1 && going <= 1);
  }

  onInput(playerId: string, input: unknown) {
    const e = this.entries.get(playerId);
    if (!input || !e || e.endedAtMs !== null || (this.phase !== 'play' && this.phase !== 'ready')) return;
    const result = this.boardInput(e.board, input);
    if (result === 'ended') {
      e.endedAtMs = this.roundMs();
      if (this.allEnded()) return this.endRound();
      this.syncAll();
    } else if (result) {
      this.syncPlayer(playerId);
      // A game without a tick only changes on input, so the TV hears about it now.
      if (this.options.tickHz === 0) this.syncHost();
    }
  }

  private endRound() {
    if (this.phase !== 'play') return;
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    const entries = [...this.entries.entries()];
    const roundMs = this.options.roundMs;
    if (this.options.scoring === 'survival') {
      // Those still going share first place; the rest by how long they lasted.
      const lasted = (e: Entry<B>) => e.endedAtMs ?? Infinity;
      for (const [, e] of entries) {
        e.place = 1 + entries.filter(([, o]) => lasted(o) > lasted(e)).length;
        e.points = survivalPoints(e.endedAtMs, roundMs);
      }
    } else if (this.options.scoring === 'race') {
      // Finishers first, quickest first; then everyone else by how far they got.
      const rank = (e: Entry<B>) => (e.endedAtMs !== null ? 2 - e.endedAtMs / roundMs : this.boardProgress(e.board));
      for (const [, e] of entries) {
        e.place = 1 + entries.filter(([, o]) => rank(o) > rank(e)).length;
        e.points = finishPoints(e.endedAtMs, roundMs, this.boardProgress(e.board));
      }
    } else {
      const scores = new Map(entries.map(([id, e]) => [id, this.boardScore(e.board)]));
      const best = Math.max(0, ...scores.values());
      for (const [id, e] of entries) {
        e.place = 1 + entries.filter(([oid]) => scores.get(oid)! > scores.get(id)!).length;
        e.points = bestPoints(scores.get(id)!, best);
      }
    }
    for (const [playerId, e] of entries) {
      if (e.points === 0) continue;
      this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + e.points);
      this.ctx.addScore(playerId, e.points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('result', RESULT_MS, () => {
      if (!isLast) this.startRound(this.puzzleIndex + 1);
      // With a single round, round scores would just repeat the result, so skip them.
      else if (this.totalPuzzles === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  syncHost() {
    const boards: BoardView<S>[] = [...this.entries].map(([playerId, e]) => {
      const player = this.ctx.players().find((p) => p.id === playerId);
      return {
        playerId,
        name: player?.name ?? '',
        color: player?.color ?? '#ffffff',
        endedAtMs: e.endedAtMs,
        boardScore: this.boardScore(e.board),
        place: e.place,
        points: e.points,
        state: this.hostState(e.board),
      };
    });
    const view: BoardsHostView<S, R> = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      msLeft: this.msLeft(),
      roundMs: this.roundMs(),
      seed: this.seed,
      boards,
      gamePoints: Object.fromEntries(this.gamePoints),
      round: this.roundState(),
    };
    this.ctx.sendHost(view);
  }

  /** `onlyIfChanged`: skip it if nothing the phone shows has changed (the tick asks every time). */
  syncPlayer(playerId: string, onlyIfChanged = false) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const e = this.entries.get(playerId);
    const all = [...this.entries.values()];
    const view: BoardsPlayerView<P> = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      msLeft: this.msLeft(),
      roundMs: this.roundMs(),
      seed: this.seed,
      hasBoard: !!e,
      endedAtMs: e?.endedAtMs ?? null,
      boardScore: e ? this.boardScore(e.board) : 0,
      going: all.filter((o) => o.endedAtMs === null).length,
      playing: all.length,
      place: e?.place ?? null,
      points: e?.points ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      state: e ? this.playerState(e.board) : null,
    };
    const key = JSON.stringify({ ...view, msLeft: 0, roundMs: 0 });
    if (onlyIfChanged && e && key === e.sentKey) return;
    if (e) e.sentKey = key;
    this.ctx.sendPlayer(playerId, view);
  }

  protected syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.ticker) clearInterval(this.ticker);
    this.timer = this.ticker = null;
  }
}
