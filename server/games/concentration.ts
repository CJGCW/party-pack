import { cardId } from '../../shared/cards';
import {
  CONCENTRATION,
  GRID_SIZE,
  type ConcentrationCell,
  type ConcentrationHostView,
  type ConcentrationInput,
  type ConcentrationMiss,
  type ConcentrationPhase,
  type ConcentrationPlayerView,
} from '../../shared/games/concentration';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import { Deck, shuffleCards } from './cards';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';

const COUNTDOWN_MS = 4_000;
/** The clock grows with the board: half a minute, plus four seconds a card. */
const roundMs = (cells: number) => 30_000 + cells * 4_000;

// Scoring, as in Word Rush: points = (seconds left - GUESS_COST_MS x guesses) x POINTS_PER_SECOND,
// so clearing the board quickly and in few guesses both matter. Anyone who clears it gets at
// least MIN_POINTS.
const GUESS_COST_MS = 3_000;
const POINTS_PER_SECOND = 10;
const MIN_POINTS = 100;

export function boardPoints(msLeft: number, guesses: number): number {
  const seconds = (msLeft - guesses * GUESS_COST_MS) / 1000;
  return Math.max(MIN_POINTS, Math.round(seconds * POINTS_PER_SECOND));
}

/** A board: a card id per square (null for the empty centre of an odd-sized board). */
export function dealBoard(size: number): (string | null)[] {
  const cells = size * size;
  const pairs = Math.floor(cells / 2);
  const cards = new Deck().drawMany(pairs).map(cardId);
  const board: (string | null)[] = shuffleCards([...cards, ...cards]);
  if (cells % 2 === 1) board.splice(Math.floor(cells / 2), 0, null);
  return board;
}

interface Progress {
  open: number[];
  matched: Set<number>;
  guesses: number;
  lastMiss: ConcentrationMiss | null;
  finishRank: number | null;
  roundPoints: number;
}

class Concentration implements MiniGame {
  private phase: ConcentrationPhase = 'countdown';
  private round = 0;
  private board: (string | null)[] = [];
  private progress = new Map<string, Progress>();
  private gamePoints = new Map<string, number>();
  private finishers = 0;
  private missSeq = 0;
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly size = Math.min(10, Math.max(2, Math.round(GRID_SIZE)));

  constructor(
    private readonly ctx: GameContext,
    /** Boards to play this game (each one is a "round" inside Concentration). */
    private readonly totalBoards: number,
  ) {}

  private get totalPairs() {
    return Math.floor((this.size * this.size) / 2);
  }

  start() {
    this.startRound(1);
  }

  private setPhase(phase: ConcentrationPhase, durationMs: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + durationMs;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, durationMs);
    this.syncAll();
  }

  private startRound(round: number) {
    this.round = round;
    this.finishers = 0;
    this.board = dealBoard(this.size);
    this.progress.clear();
    for (const p of this.ctx.players()) {
      this.progress.set(p.id, { open: [], matched: new Set(), guesses: 0, lastMiss: null, finishRank: null, roundPoints: 0 });
    }
    this.setPhase('countdown', COUNTDOWN_MS, () => this.setPhase('playing', roundMs(this.board.length), () => this.endRound()));
  }

  private endRound() {
    const isLast = this.round >= this.totalBoards;
    this.setPhase('roundEnd', PUZZLE_RESULT_MS, () => {
      if (!isLast) this.startRound(this.round + 1);
      // With a single board, round scores would just repeat the result, so skip them.
      else if (this.totalBoards === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as ConcentrationInput;
    if (this.phase !== 'playing' || input?.type !== 'flip') return;
    const prog = this.progress.get(playerId);
    const i = input.index;
    if (!prog || prog.finishRank !== null) return;
    if (!Number.isInteger(i) || i < 0 || i >= this.board.length || this.board[i] === null) return;
    if (prog.matched.has(i) || prog.open.includes(i)) return;

    if (prog.open.length === 0) {
      prog.open = [i];
      prog.lastMiss = null;
    } else {
      // The second card of a guess.
      const first = prog.open[0];
      prog.open = [];
      prog.guesses++;
      if (this.board[first] === this.board[i]) {
        prog.matched.add(first).add(i);
        prog.lastMiss = null;
        if (prog.matched.size === this.totalPairs * 2) {
          prog.finishRank = ++this.finishers;
          prog.roundPoints = boardPoints(this.msLeft(), prog.guesses);
          this.ctx.addScore(playerId, prog.roundPoints);
          this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + prog.roundPoints);
        }
      } else {
        prog.lastMiss = { seq: ++this.missSeq, cells: [first, i], cards: [this.board[first]!, this.board[i]!] };
      }
    }

    this.syncPlayer(playerId);
    this.syncHost();
    // End early once every connected player is done, so nobody waits on someone who left.
    const connected = new Set(this.ctx.players().filter((p) => p.connected).map((p) => p.id));
    if ([...this.progress].every(([id, p]) => p.finishRank !== null || !connected.has(id))) this.endRound();
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  private get revealing() {
    return this.phase === 'roundEnd' || this.phase === 'gameEnd';
  }

  private base() {
    return {
      phase: this.phase,
      size: this.size,
      round: this.round,
      totalRounds: this.totalBoards,
      msLeft: this.msLeft(),
      guessCostSeconds: GUESS_COST_MS / 1000,
      totalPairs: this.totalPairs,
    };
  }

  syncHost() {
    const blank = this.board.indexOf(null);
    const view: ConcentrationHostView = {
      ...this.base(),
      blank: blank >= 0 ? blank : null,
      players: this.ctx
        .players()
        .filter((p) => this.progress.has(p.id))
        .map((p) => {
          const prog = this.progress.get(p.id)!;
          return {
            id: p.id,
            name: p.name,
            color: p.color,
            matched: this.board.map((_, i) => prog.matched.has(i)),
            pairsFound: prog.matched.size / 2,
            guesses: prog.guesses,
            finishRank: prog.finishRank,
            roundPoints: prog.roundPoints,
            gamePoints: this.gamePoints.get(p.id) ?? 0,
            score: p.score,
          };
        }),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const prog = this.progress.get(playerId);
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!prog || !player) return;
    const cells: ConcentrationCell[] = this.board.map((card, i) => {
      if (card === null) return { state: 'blank', card: null };
      if (prog.matched.has(i)) return { state: 'matched', card };
      if (prog.open.includes(i)) return { state: 'open', card };
      // At the end of the round, show where everything was.
      return { state: 'down', card: this.revealing ? card : null };
    });
    const view: ConcentrationPlayerView = {
      ...this.base(),
      cells,
      lastMiss: prog.lastMiss,
      pairsFound: prog.matched.size / 2,
      guesses: prog.guesses,
      finishRank: prog.finishRank,
      roundPoints: prog.roundPoints,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
    };
    this.ctx.sendPlayer(playerId, view);
  }

  private syncAll() {
    this.syncHost();
    for (const id of this.progress.keys()) this.syncPlayer(id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const concentration: MiniGameDefinition = {
  info: CONCENTRATION,
  create: (ctx, _modeId, options) => new Concentration(ctx, options.puzzles),
};
