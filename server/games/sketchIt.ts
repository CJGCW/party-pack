import { bestPoints } from '../../shared/boards';
import {
  CANVAS_H,
  CANVAS_W,
  DRAW_MS,
  HINT_AT,
  INK_COLORS,
  INK_WIDTHS,
  REVEAL_MS,
  SKETCH_IT,
  blanks,
  wordFor,
  type SketchInput,
  type SketchPhase,
  type SketchView,
  type Stroke,
} from '../../shared/games/sketchIt';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { matchAnswer } from './pickEm';

/** The TV hears about new ink at most this often. */
const INK_SYNC_MS = 120;
/** A drawing can't have more than this many points in all. */
const MAX_POINTS = 12_000;
/** Points for guessing (100, plus up to 150 for speed); the artist gets up to 250 by the share who guess. */
const GUESS_BASE = 100;
const GUESS_SPEED = 150;
const ARTIST_MAX = 250;

export class SketchIt implements MiniGame {
  private phase: SketchPhase = 'draw';
  private puzzleIndex = 0;
  private seed = 0;
  private order: string[] = [];
  private turn = 0;
  private word = '';
  private strokes: Stroke[] = [];
  private pointCount = 0;
  private turnStartedAt = 0;
  private gotIt = new Map<string, number>();
  private misses = new Map<string, string[]>();
  private turnPoints = new Map<string, number>();
  private roundPoints = new Map<string, number>();
  private points = new Map<string, number>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private inkTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
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
    this.seed = Math.floor(Math.random() * 2 ** 31);
    const ids = this.ctx.players().map((p) => p.id);
    // Everyone draws once (twice with two of you), starting with someone different each round.
    const once = [...ids.slice(index % ids.length), ...ids.slice(0, index % ids.length)];
    this.order = ids.length === 2 ? [...once, ...once] : once;
    this.roundPoints.clear();
    this.points.clear();
    this.startTurn(0);
  }

  private get artist() {
    return this.order[this.turn];
  }

  private startTurn(turn: number) {
    this.turn = turn;
    this.word = wordFor(this.seed, turn);
    this.strokes = [];
    this.pointCount = 0;
    this.gotIt.clear();
    this.misses.clear();
    this.turnPoints.clear();
    this.turnStartedAt = Date.now();
    this.phase = 'draw';
    this.after(DRAW_MS, () => this.endTurn());
    // Halfway through, a letter shows: everyone hears about it.
    setTimeout(() => this.phase === 'draw' && this.turn === turn && this.syncAll(), DRAW_MS * HINT_AT + 50);
    this.syncAll();
  }

  private guessers() {
    const here = new Set(this.ctx.players().filter((p) => p.connected).map((p) => p.id));
    return this.ctx.players().filter((p) => p.id !== this.artist && here.has(p.id)).map((p) => p.id);
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as SketchInput;
    if (this.phase !== 'draw' || !input) return;
    if (playerId === this.artist) {
      if (input.type === 'clear') {
        this.strokes = [];
        this.pointCount = 0;
        this.syncHost();
      } else if (input.type === 'ink' && Number.isInteger(input.id) && Array.isArray(input.points)) {
        const pts = input.points.filter(Number.isFinite).map((v, i) => Math.max(0, Math.min(i % 2 ? CANVAS_H : CANVAS_W, Math.round(v))));
        if (this.pointCount + pts.length / 2 > MAX_POINTS) return;
        let stroke = this.strokes.find((s) => s.id === input.id);
        if (!stroke) {
          stroke = { id: input.id, color: Math.max(0, Math.min(INK_COLORS.length - 1, input.color | 0)), width: INK_WIDTHS.includes(input.width) ? input.width : INK_WIDTHS[0], points: [] };
          this.strokes.push(stroke);
        }
        stroke.points.push(...pts.slice(0, pts.length - (pts.length % 2)));
        this.pointCount += pts.length / 2;
        this.syncHostSoon();
      }
      return;
    }
    if (input.type !== 'guess' || typeof input.text !== 'string' || this.gotIt.has(playerId)) return;
    const text = input.text.slice(0, 40);
    if (matchAnswer(text, [[this.word]]) === 0) {
      const ms = Date.now() - this.turnStartedAt;
      this.gotIt.set(playerId, ms);
      this.turnPoints.set(playerId, GUESS_BASE + Math.round(GUESS_SPEED * Math.max(0, 1 - ms / DRAW_MS)));
      if (this.guessers().every((id) => this.gotIt.has(id))) return this.endTurn();
      this.syncAll();
    } else {
      this.misses.set(playerId, [...(this.misses.get(playerId) ?? []), text].slice(-6));
      this.syncPlayer(playerId);
    }
  }

  /** New ink goes to the TV a little at a time, not every point. */
  private syncHostSoon() {
    if (this.inkTimer) return;
    this.inkTimer = setTimeout(() => {
      this.inkTimer = null;
      if (this.phase === 'draw') this.syncHost();
    }, INK_SYNC_MS);
  }

  private endTurn() {
    if (this.phase !== 'draw') return;
    const guessers = this.guessers();
    const got = guessers.filter((id) => this.gotIt.has(id)).length;
    this.turnPoints.set(this.artist, guessers.length ? Math.round((ARTIST_MAX * got) / guessers.length) : 0);
    for (const [id, p] of this.turnPoints) this.roundPoints.set(id, (this.roundPoints.get(id) ?? 0) + p);
    this.phase = 'reveal';
    const last = this.turn >= this.order.length - 1;
    this.after(REVEAL_MS, () => (last ? this.endPuzzle() : this.startTurn(this.turn + 1)));
    this.syncAll();
  }

  private endPuzzle() {
    const top = Math.max(0, ...this.roundPoints.values());
    for (const p of this.ctx.players()) {
      const points = bestPoints(this.roundPoints.get(p.id) ?? 0, top);
      this.points.set(p.id, points);
      if (!points) continue;
      this.gamePoints.set(p.id, (this.gamePoints.get(p.id) ?? 0) + points);
      this.ctx.addScore(p.id, points);
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

  /** The word as everyone but the artist sees it: blanks, a letter after halfway, all of it at the reveal. */
  private shownWord(forArtist: boolean) {
    if (forArtist || this.phase !== 'draw') return this.word.toUpperCase();
    const hint = Date.now() - this.turnStartedAt >= DRAW_MS * HINT_AT ? [0] : [];
    return blanks(this.word, hint);
  }

  private view(forId?: string): SketchView {
    return {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      turn: this.turn + 1,
      turns: this.order.length,
      artist: this.artist,
      word: this.shownWord(forId === this.artist),
      strokes: forId ? [] : this.strokes,
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        gotIt: this.gotIt.get(p.id) ?? null,
        turnPoints: this.phase === 'draw' ? 0 : (this.turnPoints.get(p.id) ?? 0),
        roundPoints: this.roundPoints.get(p.id) ?? 0,
        points: this.points.get(p.id) ?? 0,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
      })),
      msLeft: Math.max(0, this.phaseEndsAt - Date.now()),
      ...(forId ? { you: forId, misses: this.misses.get(forId) ?? [] } : {}),
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
    if (this.inkTimer) clearTimeout(this.inkTimer);
    this.timer = this.inkTimer = null;
  }
}

export const sketchIt: MiniGameDefinition = {
  info: SKETCH_IT,
  create: (ctx, _modeId, options) => new SketchIt(ctx, options.puzzles),
};
