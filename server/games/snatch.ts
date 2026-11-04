import { bestPoints } from '../../shared/boards';
import {
  GRABS,
  GRACE_MS,
  TREASURE_MS,
  SNATCH,
  TRAP_MS,
  WAIT_MAX_MS,
  WAIT_MIN_MS,
  WON_MS,
  type SnatchInput,
  type SnatchPhase,
  type SnatchView,
} from '../../shared/games/snatch';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';

/** A tap's stamp is trusted if it's within this of when it arrived (else it's taken as arriving now). */
const STAMP_SLACK_MS = 1_500;
/** One reveal in this many is a trap (never the first). */
const TRAP_CHANCE = 0.3;

export class Snatch implements MiniGame {
  private phase: SnatchPhase = 'grab';
  private puzzleIndex = 0;
  private grab = 0;
  private revealAt = 0;
  private hideAt = 0;
  private kind: 'treasure' | 'trap' = 'treasure';
  private reveals = 0;
  private locked = new Set<string>();
  /** The earliest good tap so far this grab. */
  private best: { id: string; at: number } | null = null;
  private winner: string | null = null;
  private reaction: number | null = null;
  private grabs = new Map<string, number>();
  private points = new Map<string, number>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private graceTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
    private readonly random = Math.random,
  ) {}

  start() {
    this.startPuzzle(0);
  }

  private after(ms: number, next: () => void) {
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
  }

  private startPuzzle(index: number) {
    this.puzzleIndex = index;
    this.grabs = new Map(this.ctx.players().map((p) => [p.id, 0]));
    this.points.clear();
    this.startGrab(0);
  }

  private startGrab(index: number) {
    this.grab = index;
    this.locked.clear();
    this.winner = null;
    this.reaction = null;
    this.reveals = 0;
    this.phase = 'grab';
    this.schedule();
  }

  /** The cover drops: it'll lift on something after a random wait. */
  private schedule() {
    this.best = null;
    this.revealAt = Date.now() + WAIT_MIN_MS + this.random() * (WAIT_MAX_MS - WAIT_MIN_MS);
    this.kind = this.reveals > 0 && this.random() < TRAP_CHANCE ? 'trap' : 'treasure';
    this.reveals++;
    this.hideAt = this.revealAt + (this.kind === 'trap' ? TRAP_MS : TREASURE_MS);
    // A trap drops again and goes round; a treasure nobody grabs moves on.
    this.after(this.hideAt - Date.now(), () => (this.kind === 'trap' ? this.schedule() : this.endGrab()));
    this.syncAll();
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as SnatchInput;
    if (this.phase !== 'grab' || input?.type !== 'tap' || this.locked.has(playerId) || !this.grabs.has(playerId)) return;
    const now = Date.now();
    const at = Number.isFinite(input.at) && input.at <= now + 50 && input.at >= now - STAMP_SLACK_MS ? input.at : now;
    if (at < this.revealAt || this.kind === 'trap' || at > this.hideAt) {
      // Too soon, or a trap: out of this grab.
      this.locked.add(playerId);
      this.syncAll();
      return;
    }
    if (!this.best || at < this.best.at) this.best = { id: playerId, at };
    // Wait a moment for any earlier tap still on its way, then the best one wins.
    if (!this.graceTimer) this.graceTimer = setTimeout(() => this.award(), GRACE_MS);
  }

  private award() {
    this.graceTimer = null;
    if (this.phase !== 'grab' || !this.best) return;
    this.winner = this.best.id;
    this.reaction = Math.round(this.best.at - this.revealAt);
    this.grabs.set(this.best.id, (this.grabs.get(this.best.id) ?? 0) + 1);
    this.endGrab();
  }

  private endGrab() {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    this.phase = 'won';
    const last = this.grab >= GRABS - 1;
    this.after(WON_MS, () => (last ? this.endPuzzle() : this.startGrab(this.grab + 1)));
    this.syncAll();
  }

  private endPuzzle() {
    const top = Math.max(0, ...this.grabs.values());
    for (const [id, n] of this.grabs) {
      const points = bestPoints(n, top);
      this.points.set(id, points);
      if (!points) continue;
      this.gamePoints.set(id, (this.gamePoints.get(id) ?? 0) + points);
      this.ctx.addScore(id, points);
    }
    this.phase = 'result';
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.after(PUZZLE_RESULT_MS, () => {
      if (!isLast) return this.startPuzzle(this.puzzleIndex + 1);
      if (this.totalPuzzles === 1) return this.ctx.finish();
      this.phase = 'gameEnd';
      this.after(ROUND_SCORES_MS, () => this.ctx.finish());
      this.syncAll();
    });
    this.syncAll();
  }

  private view(): SnatchView {
    return {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      grab: this.grab + 1,
      revealAt: this.revealAt,
      kind: this.kind,
      hideAt: this.hideAt,
      winner: this.winner,
      reaction: this.reaction,
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        grabs: this.grabs.get(p.id) ?? 0,
        locked: this.locked.has(p.id),
        points: this.points.get(p.id) ?? 0,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
      })),
      msLeft: Math.max(0, this.phaseEndsAt - Date.now()),
    };
  }

  syncHost() {
    this.ctx.sendHost(this.view());
  }

  syncPlayer(playerId: string) {
    this.ctx.sendPlayer(playerId, { ...this.view(), you: playerId });
  }

  private syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.timer = this.graceTimer = null;
  }
}

export const snatch: MiniGameDefinition = {
  info: SNATCH,
  create: (ctx, _modeId, options) => new Snatch(ctx, options.puzzles),
};
