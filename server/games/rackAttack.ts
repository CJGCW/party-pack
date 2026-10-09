import {
  RACK_ATTACK,
  type MoveCheck,
  type Placement,
  type RackHostView,
  type RackInput,
  type RackPhase,
  type RackPlayerView,
  type ScoredMove,
} from '../../shared/games/rackAttack';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { checkMove, makePuzzle, type Puzzle } from './rackAttack/engine';

/** Time to make a play. */
const PLAY_MS = 60_000;
/** Party points for each point a play scores (a 40-point play is worth 400). */
const POINTS_PER_SCORE = 10;

const PASS: ScoredMove = { tiles: [], words: [], score: 0 };

class RackAttack implements MiniGame {
  private phase: RackPhase = 'play';
  private puzzleIndex = 0;
  private puzzle!: Puzzle;
  /** Each player's latest preview check, with the number they tagged it with. */
  private previews = new Map<string, { seq: number; check: MoveCheck }>();
  private submitted = new Map<string, ScoredMove>();
  private submitErrors = new Map<string, string>();
  private lastPoints = new Map<string, number>();
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

  private setPhase(phase: RackPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startPuzzle(index: number) {
    this.puzzleIndex = index;
    this.puzzle = makePuzzle();
    this.previews.clear();
    this.submitted.clear();
    this.submitErrors.clear();
    this.lastPoints.clear();
    this.setPhase('play', PLAY_MS, () => this.reveal());
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as RackInput;
    if (this.phase !== 'play' || this.submitted.has(playerId) || !input || !Array.isArray(input.tiles)) return;
    const tiles = input.tiles.map((t: Placement) => ({ row: Number(t?.row), col: Number(t?.col), letter: String(t?.letter ?? '') }));

    if (input.type === 'preview') {
      const check = tiles.length === 0 ? null : checkMove(this.puzzle.board, this.puzzle.rack, tiles);
      if (check) this.previews.set(playerId, { seq: Number(input.seq) || 0, check });
      else this.previews.delete(playerId);
      this.syncPlayer(playerId);
      return;
    }
    if (input.type !== 'submit') return;

    if (tiles.length === 0) {
      this.submitted.set(playerId, PASS);
    } else {
      const check = checkMove(this.puzzle.board, this.puzzle.rack, tiles);
      if (!check.ok) {
        this.submitErrors.set(playerId, check.error);
        this.syncPlayer(playerId);
        return;
      }
      this.submitted.set(playerId, { tiles: check.tiles, words: check.words, score: check.score });
    }
    this.submitErrors.delete(playerId);
    // Reveal as soon as everyone still here has locked in.
    const connected = this.ctx.players().filter((p) => p.connected);
    if (connected.every((p) => this.submitted.has(p.id))) this.reveal();
    else this.syncAll();
  }

  private reveal() {
    for (const [playerId, move] of this.submitted) {
      const points = move.score * POINTS_PER_SCORE;
      if (points === 0) continue;
      this.lastPoints.set(playerId, points);
      this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + points);
      this.ctx.addScore(playerId, points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('reveal', PUZZLE_RESULT_MS, () => {
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

  syncHost() {
    const view: RackHostView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      board: this.puzzle.board,
      rack: this.puzzle.rack,
      msLeft: this.msLeft(),
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
        submitted: this.submitted.has(p.id),
        move: this.revealing ? (this.submitted.get(p.id) ?? null) : null,
        points: this.lastPoints.get(p.id) ?? 0,
      })),
      best: this.revealing ? this.puzzle.best : null,
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const view: RackPlayerView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      board: this.puzzle.board,
      rack: this.puzzle.rack,
      msLeft: this.msLeft(),
      preview: this.previews.get(playerId) ?? null,
      submitted: this.submitted.get(playerId) ?? null,
      submitError: this.submitErrors.get(playerId) ?? null,
      points: this.lastPoints.get(playerId) ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      best: this.revealing ? this.puzzle.best : null,
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

export const rackAttack: MiniGameDefinition = {
  info: RACK_ATTACK,
  create: (ctx, _modeId, options) => new RackAttack(ctx, options.puzzles),
};
