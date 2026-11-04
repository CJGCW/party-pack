import { bestPoints } from '../../shared/boards';
import {
  COPY_CAT,
  COPY_MS,
  LEAD_MS,
  MOVE_MS,
  SCORE_MS,
  SHOW_MS,
  SIMILAR,
  TRACE_HZ,
  leaderPoints,
  similarity,
  type CopyInput,
  type CopyPhase,
  type CopyView,
  type Trace,
} from '../../shared/games/copyCat';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';

/** A trace can't be longer than this many points (a little over the move's length). */
const MAX_POINTS = Math.ceil((MOVE_MS / 1000) * TRACE_HZ * 1.25);

/** Keeps a trace to numbers in range and not too long. */
function cleanTrace(raw: unknown): Trace | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const nums = raw.slice(0, MAX_POINTS * 2).map(Number);
  if (!nums.every(Number.isFinite)) return null;
  return nums.slice(0, nums.length - (nums.length % 2)).map((v) => Math.round(Math.max(-1, Math.min(1, v)) * 1000) / 1000);
}

export class CopyCat implements MiniGame {
  private phase: CopyPhase = 'lead';
  private puzzleIndex = 0;
  private order: string[] = [];
  private turn = 0;
  private move: Trace | null = null;
  private copies = new Map<string, Trace>();
  private matches = new Map<string, number>();
  private turnPoints = new Map<string, number>();
  private roundPoints = new Map<string, number>();
  private points = new Map<string, number>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
  ) {}

  start() {
    this.startPuzzle(0);
  }

  private setPhase(phase: CopyPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startPuzzle(index: number) {
    this.puzzleIndex = index;
    const ids = this.ctx.players().map((p) => p.id);
    this.order = [...ids.slice(index % ids.length), ...ids.slice(0, index % ids.length)];
    this.roundPoints.clear();
    this.points.clear();
    this.startTurn(0);
  }

  private get leader() {
    return this.order[this.turn];
  }

  private copiers() {
    return this.ctx.players().filter((p) => p.connected && p.id !== this.leader).map((p) => p.id);
  }

  private startTurn(turn: number) {
    this.turn = turn;
    this.move = null;
    this.copies.clear();
    this.matches.clear();
    this.turnPoints.clear();
    // No move in time: the turn's skipped.
    this.setPhase('lead', LEAD_MS, () => this.nextTurn());
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as CopyInput;
    if (input?.type !== 'trace') return;
    const trace = cleanTrace(input.trace);
    if (!trace) return;
    if (this.phase === 'lead' && playerId === this.leader) {
      this.move = trace;
      return this.setPhase('show', SHOW_MS, () => this.setPhase('copy', COPY_MS, () => this.score()));
    }
    if (this.phase === 'copy' && playerId !== this.leader && !this.copies.has(playerId)) {
      this.copies.set(playerId, trace);
      if (this.copiers().every((id) => this.copies.has(id))) return this.score();
      this.syncAll();
    }
  }

  private score() {
    if (this.phase !== 'copy' || !this.move) return;
    const copiers = this.copiers();
    for (const id of copiers) {
      const copy = this.copies.get(id);
      const match = copy ? similarity(this.move, copy) : 0;
      this.matches.set(id, match);
      this.turnPoints.set(id, match);
    }
    const good = copiers.filter((id) => (this.matches.get(id) ?? 0) >= SIMILAR).length;
    this.turnPoints.set(this.leader, leaderPoints(good, copiers.length));
    for (const [id, p] of this.turnPoints) this.roundPoints.set(id, (this.roundPoints.get(id) ?? 0) + p);
    this.setPhase('score', SCORE_MS, () => this.nextTurn());
  }

  private nextTurn() {
    if (this.turn < this.order.length - 1) return this.startTurn(this.turn + 1);
    const top = Math.max(0, ...this.roundPoints.values());
    for (const p of this.ctx.players()) {
      const points = bestPoints(this.roundPoints.get(p.id) ?? 0, top);
      this.points.set(p.id, points);
      if (!points) continue;
      this.gamePoints.set(p.id, (this.gamePoints.get(p.id) ?? 0) + points);
      this.ctx.addScore(p.id, points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('result', PUZZLE_RESULT_MS, () => {
      if (!isLast) return this.startPuzzle(this.puzzleIndex + 1);
      if (this.totalPuzzles === 1) return this.ctx.finish();
      this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private view(forId?: string): CopyView {
    const showing = this.phase === 'show' || this.phase === 'copy' || this.phase === 'score';
    return {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      turn: this.turn + 1,
      turns: this.order.length,
      leader: this.leader,
      move: showing ? this.move : null,
      copies: this.phase === 'score' ? Object.fromEntries(this.copies) : {},
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        done: this.copies.has(p.id),
        match: this.matches.get(p.id) ?? null,
        turnPoints: this.turnPoints.get(p.id) ?? 0,
        roundPoints: this.roundPoints.get(p.id) ?? 0,
        points: this.points.get(p.id) ?? 0,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
      })),
      msLeft: Math.max(0, this.phaseEndsAt - Date.now()),
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
    this.timer = null;
  }
}

export const copyCat: MiniGameDefinition = {
  info: COPY_CAT,
  create: (ctx, _modeId, options) => new CopyCat(ctx, options.puzzles),
};
