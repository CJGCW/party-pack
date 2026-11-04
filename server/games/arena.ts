import type { ArenaEntry, ArenaHostView, ArenaPhase, ArenaPlayerView, ArenaScoring } from '../../shared/arena';
import { bestPoints, survivalPoints } from '../../shared/boards';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import { READY_MS } from './boards';
import type { GameContext, MiniGame } from './MiniGame';

const RESULT_MS = PUZZLE_RESULT_MS + 2_000;

export interface ArenaOptions {
  roundMs: number;
  scoring: ArenaScoring;
  tickHz: number;
  /** The TV gets the world every this many ticks. */
  hostEveryTicks?: number;
  /** Survival games: with two or more players, the round ends once only one is left. */
  lastOneStanding?: boolean;
}

interface Entry {
  endedAtMs: number | null;
  place: number | null;
  points: number;
  sentKey: string;
}

/**
 * A shared arena (see shared/arena.ts): one world everyone's in, run by the server. This runs the
 * rounds (countdown, play, result, round scores), ticks the world, scores and sends the views; a
 * game says how the world's made, steps, takes input and looks.
 *
 * `W` is the world, `S` what the TV gets of it, `P` what a player's phone gets.
 */
export abstract class ArenaGame<W, S, P> implements MiniGame {
  protected phase: ArenaPhase = 'ready';
  protected puzzleIndex = 0;
  protected seed = 0;
  protected world!: W;
  /** Everyone in this round (by player id), and how they're doing. */
  protected entries = new Map<string, Entry>();
  private gamePoints = new Map<string, number>();
  private roundStartedAt = 0;
  private phaseEndsAt = 0;
  private ticks = 0;
  private timer: NodeJS.Timeout | null = null;
  private ticker: NodeJS.Timeout | null = null;

  constructor(
    protected readonly ctx: GameContext,
    protected readonly totalPuzzles: number,
    protected readonly options: ArenaOptions,
  ) {}

  /** A new world for this round's players (in order), from the round's seed. */
  protected abstract newWorld(seed: number, playerIds: string[]): W;
  /** Steps the world on by `dt` seconds, `roundMs` into the round. Returns the players who went out. */
  protected abstract stepWorld(world: W, dt: number, roundMs: number): string[];
  /** A player's input (in the countdown or play, while they're in). Returns true if their phone should hear back. */
  protected abstract worldInput(world: W, playerId: string, input: unknown): boolean;
  protected abstract hostState(world: W): S;
  protected abstract playerState(world: W, playerId: string): P;
  /** A player's score, for 'best' scoring (and shown on the TV). */
  protected score(_world: W, _playerId: string): number {
    return 0;
  }

  start() {
    this.startRound(0);
  }

  private setPhase(phase: ArenaPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startRound(index: number) {
    this.puzzleIndex = index;
    this.seed = Math.floor(Math.random() * 2 ** 31);
    const ids = this.ctx.players().map((p) => p.id);
    this.world = this.newWorld(this.seed, ids);
    this.entries = new Map(ids.map((id) => [id, { endedAtMs: null, place: null, points: 0, sentKey: '' }]));
    this.setPhase('ready', READY_MS, () => {
      this.roundStartedAt = Date.now();
      this.ticks = 0;
      this.ticker = setInterval(() => this.tick(), 1000 / this.options.tickHz);
      this.setPhase('play', this.options.roundMs, () => this.endRound());
    });
  }

  protected roundMs() {
    return this.phase === 'play' ? Math.min(this.options.roundMs, Date.now() - this.roundStartedAt) : 0;
  }

  private tick() {
    if (this.phase !== 'play') return;
    const ms = this.roundMs();
    for (const id of this.stepWorld(this.world, 1 / this.options.tickHz, ms)) {
      const e = this.entries.get(id);
      if (e && e.endedAtMs === null) e.endedAtMs = ms;
    }
    const going = [...this.entries.values()].filter((e) => e.endedAtMs === null).length;
    if (going === 0 || (this.options.lastOneStanding && this.entries.size > 1 && going <= 1)) return this.endRound();
    for (const id of this.entries.keys()) this.syncPlayer(id, true);
    if (++this.ticks % (this.options.hostEveryTicks ?? 1) === 0) this.syncHost();
  }

  /** Whether a player's still in this round. */
  protected isIn(playerId: string) {
    return this.entries.get(playerId)?.endedAtMs === null;
  }

  onInput(playerId: string, input: unknown) {
    if (!input || !this.isIn(playerId) || (this.phase !== 'play' && this.phase !== 'ready')) return;
    if (this.worldInput(this.world, playerId, input)) this.syncPlayer(playerId);
  }

  private endRound() {
    if (this.phase !== 'play') return;
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    const entries = [...this.entries.entries()];
    if (this.options.scoring === 'survival') {
      const lasted = ([, e]: [string, Entry]) => e.endedAtMs ?? Infinity;
      for (const entry of entries) {
        entry[1].place = 1 + entries.filter((o) => lasted(o) > lasted(entry)).length;
        entry[1].points = survivalPoints(entry[1].endedAtMs, this.options.roundMs);
      }
    } else {
      const scores = new Map(entries.map(([id]) => [id, this.score(this.world, id)]));
      const best = Math.max(0, ...scores.values());
      for (const [id, e] of entries) {
        e.place = 1 + entries.filter(([o]) => scores.get(o)! > scores.get(id)!).length;
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
      else if (this.totalPuzzles === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  syncHost() {
    const players: ArenaEntry[] = [...this.entries].map(([playerId, e]) => {
      const p = this.ctx.players().find((o) => o.id === playerId);
      return { playerId, name: p?.name ?? '', color: p?.color ?? '#ffffff', endedAtMs: e.endedAtMs, score: this.score(this.world, playerId), place: e.place, points: e.points };
    });
    const view: ArenaHostView<S> = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      msLeft: this.msLeft(),
      roundMs: this.roundMs(),
      seed: this.seed,
      players,
      world: this.hostState(this.world),
      gamePoints: Object.fromEntries(this.gamePoints),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string, onlyIfChanged = false) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const e = this.entries.get(playerId);
    const all = [...this.entries.values()];
    const view: ArenaPlayerView<P> = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      msLeft: this.msLeft(),
      roundMs: this.roundMs(),
      seed: this.seed,
      hasBoard: !!e,
      endedAtMs: e?.endedAtMs ?? null,
      boardScore: e ? this.score(this.world, playerId) : 0,
      going: all.filter((o) => o.endedAtMs === null).length,
      playing: all.length,
      place: e?.place ?? null,
      points: e?.points ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      state: e ? this.playerState(this.world, playerId) : null,
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
