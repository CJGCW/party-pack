import { BOOM, COLS, HIDDEN, ROWS } from '../../shared/games/minesweeper';
import { TURNS_ROUND_MS, TURNS_UI, TURN_MINES, TURN_MS, type TurnsInput, type TurnsPhase, type TurnsView } from '../../shared/games/mineTurns';
import { puzzlePoints } from '../../shared/scoring';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame } from './MiniGame';
import { newSweeper, uncover, type Sweeper } from './minesweeper';

export class MineTurns implements MiniGame {
  private phase: TurnsPhase = 'play';
  private puzzleIndex = 0;
  private sweeper!: Sweeper;
  private seats: string[] = [];
  private turn = 0;
  /** Found mines: square → who found it. */
  private found = new Map<number, string>();
  private last: number | null = null;
  private taps = 0;
  private lastHit = false;
  private points = new Map<string, number>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private turnEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private turnTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
  ) {}

  start() {
    this.startRound(0);
  }

  private setPhase(phase: TurnsPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
  }

  private startRound(index: number) {
    this.puzzleIndex = index;
    this.seats = this.ctx.players().map((p) => p.id);
    this.sweeper = newSweeper(Math.floor(Math.random() * 2 ** 31), TURN_MINES);
    this.found.clear();
    this.points.clear();
    this.last = null;
    this.taps = 0;
    this.lastHit = false;
    // Who goes first moves round each round.
    this.turn = this.seats.length ? index % this.seats.length : 0;
    this.setPhase('play', TURNS_ROUND_MS, () => this.endRound());
    this.startTurn();
    this.syncAll();
  }

  private startTurn() {
    this.turnEndsAt = Date.now() + TURN_MS;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => {
      this.pass();
      this.syncAll();
    }, TURN_MS);
  }

  private pass() {
    this.turn = (this.turn + 1) % this.seats.length;
    this.startTurn();
  }

  private foundBy(id: string) {
    return [...this.found.values()].filter((by) => by === id).length;
  }

  /** Every mine's found, or the leader can't be caught. */
  private settled() {
    const left = TURN_MINES - this.found.size;
    const [best, next] = this.seats.map((id) => this.foundBy(id)).sort((a, b) => b - a);
    return left === 0 || (next !== undefined && best > next + left);
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as TurnsInput;
    const cell = input?.cell;
    if (this.phase !== 'play' || input?.type !== 'reveal' || this.seats[this.turn] !== playerId) return;
    if (!Number.isInteger(cell) || cell < 0 || cell >= COLS * ROWS || this.sweeper.uncovered[cell] || this.found.has(cell)) return;
    this.last = cell;
    this.taps++;
    this.lastHit = this.sweeper.field.mines[cell];
    if (this.lastHit) {
      this.found.set(cell, playerId);
      if (this.settled()) return this.endRound();
      this.startTurn();
    } else {
      uncover(this.sweeper, cell);
      this.pass();
    }
    this.syncAll();
  }

  private endRound() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    const total = this.found.size;
    for (const id of this.seats) {
      const points = total ? puzzlePoints(this.foundBy(id) / total) : 0;
      this.points.set(id, points);
      this.gamePoints.set(id, (this.gamePoints.get(id) ?? 0) + points);
      if (points) this.ctx.addScore(id, points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('result', PUZZLE_RESULT_MS, () => {
      if (!isLast) return this.startRound(this.puzzleIndex + 1);
      if (this.totalPuzzles === 1) return this.ctx.finish();
      this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
      this.syncAll();
    });
    this.syncAll();
  }

  private view(forId?: string): TurnsView {
    const now = Date.now();
    const s = this.sweeper;
    const over = this.phase !== 'play';
    return {
      asGame: TURNS_UI,
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      squares: s.uncovered.map((up, c) => (up ? s.field.counts[c] : this.found.has(c) || (over && s.field.mines[c]) ? BOOM : HIDDEN)),
      mines: [...this.found].map(([cell, by]) => ({ cell, by })),
      left: TURN_MINES - this.found.size,
      players: this.ctx
        .players()
        .filter((p) => this.seats.includes(p.id))
        .map((p) => ({ id: p.id, name: p.name, color: p.color, found: this.foundBy(p.id), points: this.points.get(p.id) ?? 0, gamePoints: this.gamePoints.get(p.id) ?? 0 })),
      turn: over ? null : (this.seats[this.turn] ?? null),
      turnMs: over ? 0 : Math.max(0, this.turnEndsAt - now),
      last: this.last,
      taps: this.taps,
      lastHit: this.lastHit,
      msLeft: Math.max(0, this.phaseEndsAt - now),
      ...(forId ? { you: forId } : {}),
    };
  }

  syncHost() {
    this.ctx.sendHost(this.view());
  }

  syncPlayer(playerId: string) {
    this.ctx.sendPlayer(playerId, this.view(playerId));
  }

  private syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.timer = this.turnTimer = null;
  }
}

export const createMineTurns = (ctx: GameContext, totalPuzzles: number): MiniGame => new MineTurns(ctx, totalPuzzles);
