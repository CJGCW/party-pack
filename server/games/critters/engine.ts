import {
  critterLevel,
  type CritterHostView,
  type CritterPhase,
  type CritterPlayerView,
  type LevelSpec,
  type Note,
  type StageGroup,
  type Traits,
} from '../../../shared/critters';
import type { GameInfo } from '../../../shared/protocol';
import { puzzlePoints } from '../../../shared/scoring';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from '../MiniGame';

/** At the reveal, longer than other games: there's an answer to look at. */
const REVEAL_MS = PUZZLE_RESULT_MS + 4_000;
/** Solving it is worth this share of the points, however slowly; the rest goes by the time left. */
const SOLVED_SHARE = 0.85;

/** What every puzzle's board has. */
export interface Board {
  got: number;
  goal: number;
  triesLeft: number;
  note: Note | null;
}

/**
 * One logic puzzle. Everyone gets the same puzzle (`Z`) and a board of their own (`B`), and works
 * at it alone on their phone, with a limited number of slips, until they solve it or run out.
 */
export interface PuzzleRules<Z, B extends Board> {
  info: GameInfo;
  levels: LevelSpec[];
  make(level: number): Z;
  /** A new board; the engine fills in `triesLeft`. */
  board(puzzle: Z, level: number): Omit<B, 'triesLeft' | 'note'>;
  /** Returns true if it changed anything. */
  input(puzzle: Z, board: B, input: unknown): boolean;
  /** What the phone gets. `reveal` is true once the answer can be shown. */
  phone(puzzle: Z, board: B, reveal: boolean): unknown;
  /** What the TV shows: nothing here may give the answer away until `reveal`. */
  stage(puzzle: Z, reveal: boolean): StageGroup[];
}

interface Entry<B> {
  board: B;
  finishedAt: number | null;
  gaveUp: boolean;
  points: number;
}

class CritterGame<Z, B extends Board> implements MiniGame {
  private phase: CritterPhase = 'play';
  private puzzleIndex = 0;
  private level = 1;
  private puzzle!: Z;
  private entries = new Map<string, Entry<B>>();
  private gamePoints = new Map<string, number>();
  private startedAt = 0;
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly rules: PuzzleRules<Z, B>,
    private readonly totalPuzzles: number,
    private readonly modeId: string,
  ) {}

  start() {
    this.startPuzzle(0);
  }

  private get spec() {
    return this.rules.levels[this.level - 1];
  }

  private setPhase(phase: CritterPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startPuzzle(index: number) {
    this.puzzleIndex = index;
    this.level = critterLevel(this.modeId, index, this.rules.levels.length);
    this.puzzle = this.rules.make(this.level);
    this.entries.clear();
    this.startedAt = Date.now();
    this.setPhase('play', this.spec.ms, () => this.reveal());
  }

  private entry(playerId: string) {
    let e = this.entries.get(playerId);
    if (!e) {
      const board = { ...this.rules.board(this.puzzle, this.level), triesLeft: this.spec.tries, note: null } as B;
      e = { board, finishedAt: null, gaveUp: false, points: 0 };
      this.entries.set(playerId, e);
    }
    return e;
  }

  private isDone(e: Entry<B>) {
    return e.gaveUp || e.finishedAt !== null || e.board.triesLeft <= 0;
  }

  onInput(playerId: string, input: unknown) {
    if (!input || this.phase !== 'play') return;
    const e = this.entry(playerId);
    if (this.isDone(e) || !this.rules.input(this.puzzle, e.board, input)) return;
    if (e.board.got >= e.board.goal) e.finishedAt = Date.now();
    this.revealIfAllDone();
  }

  giveUp(playerId: string) {
    if (this.phase !== 'play') return;
    const e = this.entry(playerId);
    if (this.isDone(e)) return;
    e.gaveUp = true;
    this.revealIfAllDone();
  }

  private revealIfAllDone() {
    const connected = this.ctx.players().filter((p) => p.connected);
    if (connected.every((p) => this.isDone(this.entry(p.id)))) this.reveal();
    else this.syncAll();
  }

  private reveal() {
    const ms = this.spec.ms;
    for (const p of this.ctx.players()) {
      const e = this.entry(p.id);
      const share = e.board.goal ? e.board.got / e.board.goal : 0;
      e.points =
        e.finishedAt !== null
          ? puzzlePoints(SOLVED_SHARE + (1 - SOLVED_SHARE) * Math.max(0, 1 - (e.finishedAt - this.startedAt) / ms))
          : puzzlePoints(SOLVED_SHARE * share);
      if (e.points === 0) continue;
      this.gamePoints.set(p.id, (this.gamePoints.get(p.id) ?? 0) + e.points);
      this.ctx.addScore(p.id, e.points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('reveal', REVEAL_MS, () => {
      if (!isLast) this.startPuzzle(this.puzzleIndex + 1);
      // With a single puzzle, round scores would just repeat the reveal, so skip them.
      else if (this.totalPuzzles === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  private get revealing() {
    return this.phase !== 'play';
  }

  private finishMs(e: Entry<B>) {
    return e.finishedAt === null ? null : e.finishedAt - this.startedAt;
  }

  syncHost() {
    const view: CritterHostView = {
      title: this.rules.info.name,
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      levelName: this.spec.name,
      msLeft: this.msLeft(),
      stage: this.rules.stage(this.puzzle, this.revealing),
      players: this.ctx.players().map((p) => {
        const e = this.entry(p.id);
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          got: e.board.got,
          goal: e.board.goal,
          triesLeft: Math.max(0, e.board.triesLeft),
          triesMax: this.spec.tries,
          done: this.isDone(e),
          finishMs: this.finishMs(e),
          points: e.points,
          gamePoints: this.gamePoints.get(p.id) ?? 0,
        };
      }),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const e = this.entry(playerId);
    const view: CritterPlayerView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      level: this.level,
      levelName: this.spec.name,
      msLeft: this.msLeft(),
      got: e.board.got,
      goal: e.board.goal,
      triesLeft: Math.max(0, e.board.triesLeft),
      triesMax: this.spec.tries,
      done: this.isDone(e),
      finishMs: this.finishMs(e),
      points: e.points,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      note: e.board.note,
      revealing: this.revealing,
      state: this.rules.phone(this.puzzle, e.board, this.revealing),
      canGiveUp: this.phase === 'play' && !this.isDone(e),
      gaveUp: this.phase === 'play' && e.gaveUp,
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

export function critterGame<Z, B extends Board>(rules: PuzzleRules<Z, B>): MiniGameDefinition {
  return {
    info: rules.info,
    create: (ctx, modeId, options) => new CritterGame(ctx, rules, options.puzzles, modeId),
  };
}

/** A shuffled copy. */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const randInt = (n: number) => Math.floor(Math.random() * n);
export const pickOne = <T,>(items: readonly T[]): T => items[randInt(items.length)];

/** A Wumble at random. */
export const randomTraits = (): Traits => [randInt(5), randInt(5), randInt(5), randInt(5)];
export const sameTraits = (a: Traits, b: Traits) => a.every((v, i) => v === b[i]);
/** Which traits two share. */
export const sharedTraits = (a: Traits, b: Traits) => a.flatMap((v, i) => (v === b[i] ? [i] : []));
