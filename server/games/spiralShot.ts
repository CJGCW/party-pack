import {
  FIRE_MS,
  OUT_SHARE,
  READY_MS,
  ROUND_MS,
  SPIRAL_SHOT,
  TICK_HZ,
  TRACKS,
  chainSpeed,
  type Track,
  type SpiralBoardView,
  type SpiralHostView,
  type SpiralInput,
  type SpiralPhase,
  type SpiralPlayerView,
} from '../../shared/games/spiralShot';
import { PUZZLE_POINTS, puzzlePoints } from '../../shared/scoring';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { Board, seededRandom } from './spiralShot/board';

/** The TV gets the boards every this many ticks. */
const HOST_EVERY_TICKS = 2;
/** At the result, a little longer than other games: there's a board each to look at. */
const RESULT_MS = PUZZLE_RESULT_MS + 2_000;
// Scoring on the shared scale: surviving the round is worth the full 1,000 (everyone who does gets
// it); going out earlier scores up to 700, by how long you lasted, so the last one standing beats
// everyone who went before them.

interface Entry {
  board: Board;
  outAtMs: number | null;
  place: number | null;
  points: number;
  /** What the phone last got, so it's only sent again when something it shows changes. */
  sentKey: string;
}

class SpiralShot implements MiniGame {
  private phase: SpiralPhase = 'ready';
  private puzzleIndex = 0;
  private entries = new Map<string, Entry>();
  private track: Track = TRACKS[0];
  private gamePoints = new Map<string, number>();
  private roundStartedAt = 0;
  private phaseEndsAt = 0;
  private ticks = 0;
  private timer: NodeJS.Timeout | null = null;
  private ticker: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
  ) {}

  start() {
    this.startPuzzle(0);
  }

  private setPhase(phase: SpiralPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startPuzzle(index: number) {
    this.puzzleIndex = index;
    // Everyone's on the same track, a different one from last round (as long as there's more than one).
    const others = TRACKS.filter((t) => t !== this.track || TRACKS.length === 1);
    this.track = index === 0 ? TRACKS[Math.floor(Math.random() * TRACKS.length)] : others[Math.floor(Math.random() * others.length)];
    // Everyone's chain comes in the same colours; their turrets' colours are their own.
    const seed = Math.floor(Math.random() * 2 ** 31);
    this.entries = new Map(
      this.ctx.players().map((p, i) => [
        p.id,
        { board: new Board(this.track, seededRandom(seed), seededRandom(seed + 1 + i)), outAtMs: null, place: null, points: 0, sentKey: '' },
      ]),
    );
    this.setPhase('ready', READY_MS, () => {
      this.roundStartedAt = Date.now();
      this.ticks = 0;
      this.ticker = setInterval(() => this.tick(), 1000 / TICK_HZ);
      this.setPhase('play', ROUND_MS, () => this.endRound());
    });
  }

  private roundMs() {
    return this.phase === 'play' ? Math.min(ROUND_MS, Date.now() - this.roundStartedAt) : 0;
  }

  private tick() {
    if (this.phase !== 'play') return;
    const ms = this.roundMs();
    const speed = chainSpeed(ms, this.track);
    for (const [playerId, e] of this.entries) {
      if (e.outAtMs !== null) continue;
      if (e.board.step(1 / TICK_HZ, speed, FIRE_MS)) e.outAtMs = ms;
      this.syncPlayer(playerId, true);
    }
    if ([...this.entries.values()].every((e) => e.outAtMs !== null)) return this.endRound();
    if (++this.ticks % HOST_EVERY_TICKS === 0) this.syncHost();
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as SpiralInput;
    const e = this.entries.get(playerId);
    if (!input || !e || e.outAtMs !== null || (this.phase !== 'play' && this.phase !== 'ready')) return;
    if (input.type === 'aim' && Number.isFinite(input.angle)) e.board.angle = Math.atan2(Math.sin(input.angle), Math.cos(input.angle));
    else if (input.type === 'swap') {
      e.board.swap();
      this.syncPlayer(playerId);
    }
  }

  private endRound() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    const entries = [...this.entries.entries()];
    // Survivors share first place; the rest by how long they lasted.
    const lasted = (e: Entry) => e.outAtMs ?? Infinity;
    for (const [playerId, e] of entries) {
      e.place = 1 + entries.filter(([, o]) => lasted(o) > lasted(e)).length;
      e.points = e.outAtMs === null ? PUZZLE_POINTS : puzzlePoints((OUT_SHARE * e.outAtMs) / ROUND_MS);
      if (e.points === 0) continue;
      this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + e.points);
      this.ctx.addScore(playerId, e.points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('result', RESULT_MS, () => {
      if (!isLast) this.startPuzzle(this.puzzleIndex + 1);
      // With a single puzzle, round scores would just repeat the result, so skip them.
      else if (this.totalPuzzles === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  private boardView(playerId: string, e: Entry): SpiralBoardView {
    const player = this.ctx.players().find((p) => p.id === playerId);
    const b = e.board;
    return {
      playerId,
      name: player?.name ?? '',
      color: player?.color ?? '#ffffff',
      chain: b.chain.flatMap((m) => [m.id, Math.round(m.s * 10) / 10, m.color]),
      shots: b.shots.flatMap((s) => [s.id, Math.round(s.x), Math.round(s.y), s.color]),
      angle: Math.round(b.angle * 1000) / 1000,
      current: b.current,
      next: b.next,
      pops: b.pops,
      bestCombo: b.bestCombo,
      outAtMs: e.outAtMs,
      place: e.place,
      points: e.points,
    };
  }

  syncHost() {
    const view: SpiralHostView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      msLeft: this.msLeft(),
      roundMs: this.roundMs(),
      trackId: this.track.id,
      boards: [...this.entries].map(([id, e]) => this.boardView(id, e)),
      gamePoints: Object.fromEntries(this.gamePoints),
    };
    this.ctx.sendHost(view);
  }

  /** `onlyIfChanged`: skip it if nothing the phone shows has changed (the tick asks every time). */
  syncPlayer(playerId: string, onlyIfChanged = false) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const e = this.entries.get(playerId);
    const all = [...this.entries.values()];
    const view: SpiralPlayerView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      msLeft: this.msLeft(),
      current: e?.board.current ?? -1,
      next: e?.board.next ?? -1,
      pops: e?.board.pops ?? 0,
      bestCombo: e?.board.bestCombo ?? 0,
      outAtMs: e?.outAtMs ?? null,
      alive: all.filter((o) => o.outAtMs === null).length,
      playing: all.length,
      place: e?.place ?? null,
      points: e?.points ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
    };
    const key = JSON.stringify({ ...view, msLeft: 0 });
    if (onlyIfChanged && e && key === e.sentKey) return;
    if (e) e.sentKey = key;
    this.ctx.sendPlayer(playerId, view);
  }

  private syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.ticker) clearInterval(this.ticker);
    this.timer = this.ticker = null;
  }
}

export const spiralShot: MiniGameDefinition = {
  info: SPIRAL_SHOT,
  create: (ctx, _modeId, options) => new SpiralShot(ctx, options.puzzles),
};
