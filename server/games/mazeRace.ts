import {
  DIRS,
  MAZE_RACE,
  distancesTo,
  shortestPath,
  step,
  type Maze,
  type MazeHostView,
  type MazeInput,
  type MazePhase,
  type MazePlayerView,
} from '../../shared/games/mazeRace';
import { FINISH_SHARE, puzzlePoints, racePoints } from '../../shared/scoring';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { generateMaze } from './mazeRace/generate';

/** The countdown before each maze, so everyone starts together. */
const READY_MS = 3_000;
/** Time to get through a maze. */
const RACE_MS = 90_000;
/** At the reveal, a little longer than other games: there are trails to look at. */
const REVEAL_MS = PUZZLE_RESULT_MS + 2_000;
/** Moves update the TV at most this often. */
const HOST_SYNC_MS = 100;
// Scoring on the shared scale: reaching the exit scores like a Word Rush word (300, plus up to 700
// for the time left); anyone who doesn't make it scores up to 300 for how close they got.

interface Runner {
  pos: number;
  /** The last move message applied. */
  seq: number;
  trail: number[];
  finishedAt: number | null;
  place: number | null;
  gaveUp: boolean;
  points: number;
}

class MazeRace implements MiniGame {
  private phase: MazePhase = 'ready';
  private puzzleIndex = 0;
  private maze: Maze = generateMaze();
  /** Steps from each cell to the exit. */
  private toExit: number[] = [];
  private runners = new Map<string, Runner>();
  private finishers = 0;
  private gamePoints = new Map<string, number>();
  private raceStartedAt = 0;
  private phaseEndsAt = 0;
  private phaseMs = 0;
  private timer: NodeJS.Timeout | null = null;
  private hostTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
  ) {}

  start() {
    this.startPuzzle(0);
  }

  private setPhase(phase: MazePhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseMs = ms;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startPuzzle(index: number) {
    this.puzzleIndex = index;
    this.maze = generateMaze();
    this.toExit = distancesTo(this.maze, this.maze.exit);
    this.runners.clear();
    this.finishers = 0;
    this.setPhase('ready', READY_MS, () => {
      this.raceStartedAt = Date.now();
      this.setPhase('race', RACE_MS, () => this.reveal());
    });
  }

  private runner(playerId: string) {
    let r = this.runners.get(playerId);
    if (!r) {
      r = { pos: this.maze.start, seq: 0, trail: [this.maze.start], finishedAt: null, place: null, gaveUp: false, points: 0 };
      this.runners.set(playerId, r);
    }
    return r;
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as MazeInput;
    if (input?.type !== 'move' || this.phase !== 'race' || !Array.isArray(input.dirs)) return;
    const r = this.runner(playerId);
    if (r.finishedAt !== null || r.gaveUp) return;
    r.seq = Number(input.seq) || 0;
    // Out of step with the phone (a move lost to a reconnect): send back where they really are.
    if (input.from !== r.pos) return this.syncPlayer(playerId);
    for (const dir of input.dirs) {
      if (!DIRS.includes(dir)) break;
      const next = step(this.maze, r.pos, dir);
      if (next < 0) return this.syncPlayer(playerId);
      r.pos = next;
      r.trail.push(next);
      if (next === this.maze.exit) {
        r.finishedAt = Date.now();
        r.place = ++this.finishers;
        return this.revealIfAllIn();
      }
    }
    this.syncHostSoon();
  }

  giveUp(playerId: string) {
    if (this.phase !== 'race') return;
    const r = this.runner(playerId);
    if (r.finishedAt !== null || r.gaveUp) return;
    r.gaveUp = true;
    this.revealIfAllIn();
  }

  /** Reveal as soon as everyone still here is out or has given up. */
  private revealIfAllIn() {
    const connected = this.ctx.players().filter((p) => p.connected);
    const done = (id: string) => {
      const r = this.runners.get(id);
      return !!r && (r.finishedAt !== null || r.gaveUp);
    };
    if (connected.every((p) => done(p.id))) this.reveal();
    else this.syncAll();
  }

  private progress(r: Runner) {
    const total = this.toExit[this.maze.start];
    return total > 0 ? 1 - this.toExit[r.pos] / total : 1;
  }

  private reveal() {
    for (const p of this.ctx.players()) {
      const r = this.runner(p.id);
      if (r.gaveUp) continue;
      r.points =
        r.finishedAt !== null
          ? racePoints(Math.max(0, RACE_MS - (r.finishedAt - this.raceStartedAt)), RACE_MS, 0, 0)
          : puzzlePoints(FINISH_SHARE * this.progress(r));
      if (r.points === 0) continue;
      this.gamePoints.set(p.id, (this.gamePoints.get(p.id) ?? 0) + r.points);
      this.ctx.addScore(p.id, r.points);
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
    return this.phase === 'reveal' || this.phase === 'gameEnd';
  }

  private finishMs(r: Runner) {
    return r.finishedAt === null ? null : r.finishedAt - this.raceStartedAt;
  }

  private syncHostSoon() {
    if (this.hostTimer) return;
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      this.syncHost();
    }, HOST_SYNC_MS);
  }

  syncHost() {
    const view: MazeHostView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      msLeft: this.msLeft(),
      phaseMs: this.phaseMs,
      maze: this.phase === 'ready' ? null : this.maze,
      solution: this.revealing ? shortestPath(this.maze) : null,
      players: this.ctx.players().map((p) => {
        const r = this.runner(p.id);
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          score: p.score,
          gamePoints: this.gamePoints.get(p.id) ?? 0,
          progress: this.progress(r),
          place: r.place,
          finishMs: this.finishMs(r),
          gaveUp: r.gaveUp,
          trail: this.revealing ? r.trail : null,
          points: r.points,
        };
      }),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const r = this.runner(playerId);
    const view: MazePlayerView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      msLeft: this.msLeft(),
      maze: this.phase === 'ready' ? null : this.maze,
      pos: r.pos,
      seq: r.seq,
      trail: r.trail,
      place: r.place,
      finishMs: this.finishMs(r),
      finished: this.finishers,
      points: r.points,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      solution: this.revealing ? shortestPath(this.maze) : null,
      canGiveUp: this.phase === 'race' && r.finishedAt === null && !r.gaveUp,
      gaveUp: this.phase === 'race' && r.gaveUp,
    };
    this.ctx.sendPlayer(playerId, view);
  }

  private syncAll() {
    if (this.hostTimer) clearTimeout(this.hostTimer);
    this.hostTimer = null;
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.hostTimer) clearTimeout(this.hostTimer);
    this.timer = this.hostTimer = null;
  }
}

export const mazeRace: MiniGameDefinition = {
  info: MAZE_RACE,
  create: (ctx, _modeId, options) => new MazeRace(ctx, options.puzzles),
};
