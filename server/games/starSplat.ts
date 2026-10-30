import {
  AMMO,
  SHAPES,
  STARS_SHARE,
  STAR_SPLAT,
  TOTAL_STARS,
  WALL_MS,
  levelFor,
  type Ball,
  type Hit,
  type SplatHostView,
  type SplatInput,
  type SplatPhase,
  type SplatPlayerView,
  type Target,
} from '../../shared/games/starSplat';
import { puzzlePoints } from '../../shared/scoring';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { Rule } from './starSplat/rule';

/** At the reveal, longer than other games: there's a rule to read and walls to look at. */
const REVEAL_MS = PUZZLE_RESULT_MS + 4_000;
// Scoring on the shared scale: each star is worth a share of 850; filling all 16 adds up to 150
// more for the time left, so the fastest to finish the wall scores up to 1,000.

interface Thrower {
  hits: Hit[];
  stars: number;
  finishedAt: number | null;
  gaveUp: boolean;
  points: number;
}

class StarSplat implements MiniGame {
  private phase: SplatPhase = 'play';
  private puzzleIndex = 0;
  private level = 1;
  private rule = new Rule(1);
  private targets: Target[] = [];
  private throwers = new Map<string, Thrower>();
  private gamePoints = new Map<string, number>();
  private wallStartedAt = 0;
  private phaseEndsAt = 0;
  private phaseMs = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
    /** 'rising', or a fixed level '1' to '4'. */
    private readonly modeId: string,
  ) {}

  start() {
    this.startWall(0);
  }

  private setPhase(phase: SplatPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseMs = ms;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startWall(index: number) {
    this.puzzleIndex = index;
    this.level = levelFor(this.modeId, index);
    this.rule = new Rule(this.level);
    this.targets = this.rule.pickTargets();
    this.throwers.clear();
    this.wallStartedAt = Date.now();
    this.setPhase('play', WALL_MS[this.level - 1], () => this.reveal());
  }

  private ammo() {
    return AMMO[this.level - 1];
  }

  private thrower(playerId: string) {
    let t = this.throwers.get(playerId);
    if (!t) {
      t = { hits: [], stars: 0, finishedAt: null, gaveUp: false, points: 0 };
      this.throwers.set(playerId, t);
    }
    return t;
  }

  private isDone(t: Thrower) {
    return t.gaveUp || t.finishedAt !== null || t.hits.length >= this.ammo();
  }

  /** A ball as sent, checked: whole numbers in range, with an inner colour from Hard up. */
  private validBall(raw: Ball | undefined): Ball | null {
    const ok = (n: unknown, max: number) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < max;
    if (!raw || !ok(raw.color, 5) || !ok(raw.shape, SHAPES.length)) return null;
    if (this.level >= 3) return ok(raw.inner, 5) ? { color: raw.color, shape: raw.shape, inner: raw.inner } : null;
    return { color: raw.color, shape: raw.shape };
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as SplatInput;
    if (input?.type !== 'throw' || this.phase !== 'play') return;
    const t = this.thrower(playerId);
    const ball = this.validBall(input.ball);
    if (!ball || this.isDone(t)) return;
    const cell = this.rule.cellFor(ball);
    // A star brick counts the first time it's hit.
    const target = this.targets.find((g) => g.cell === cell);
    if (target && !t.hits.some((h) => h.cell === cell)) t.stars += target.stars;
    t.hits.push({ cell, ball });
    if (t.stars >= TOTAL_STARS) t.finishedAt = Date.now();
    this.revealIfAllDone();
  }

  giveUp(playerId: string) {
    if (this.phase !== 'play') return;
    const t = this.thrower(playerId);
    if (this.isDone(t)) return;
    t.gaveUp = true;
    this.revealIfAllDone();
  }

  /** Reveal as soon as everyone still here is done. */
  private revealIfAllDone() {
    const connected = this.ctx.players().filter((p) => p.connected);
    if (connected.every((p) => this.isDone(this.thrower(p.id)))) this.reveal();
    else this.syncAll();
  }

  private reveal() {
    const wallMs = WALL_MS[this.level - 1];
    for (const p of this.ctx.players()) {
      const t = this.thrower(p.id);
      t.points =
        t.finishedAt !== null
          ? puzzlePoints(STARS_SHARE + (1 - STARS_SHARE) * Math.max(0, 1 - (t.finishedAt - this.wallStartedAt) / wallMs))
          : puzzlePoints((STARS_SHARE * t.stars) / TOTAL_STARS);
      if (t.points === 0) continue;
      this.gamePoints.set(p.id, (this.gamePoints.get(p.id) ?? 0) + t.points);
      this.ctx.addScore(p.id, t.points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('reveal', REVEAL_MS, () => {
      if (!isLast) this.startWall(this.puzzleIndex + 1);
      // With a single wall, round scores would just repeat the reveal, so skip them.
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

  private finishMs(t: Thrower) {
    return t.finishedAt === null ? null : t.finishedAt - this.wallStartedAt;
  }

  syncHost() {
    const view: SplatHostView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      level: this.level,
      msLeft: this.msLeft(),
      phaseMs: this.phaseMs,
      targets: this.targets,
      players: this.ctx.players().map((p) => {
        const t = this.thrower(p.id);
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          score: p.score,
          stars: t.stars,
          ballsLeft: this.ammo() - t.hits.length,
          done: this.isDone(t),
          finishMs: this.finishMs(t),
          // Nobody's throws show on the TV until the reveal: they'd give the rule away.
          hits: this.revealing ? t.hits : null,
          points: t.points,
          gamePoints: this.gamePoints.get(p.id) ?? 0,
        };
      }),
      answers: this.revealing ? this.rule.answersFor(this.targets) : null,
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const t = this.thrower(playerId);
    const view: SplatPlayerView = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      level: this.level,
      msLeft: this.msLeft(),
      targets: this.targets,
      hits: t.hits,
      ammo: this.ammo(),
      ballsLeft: this.ammo() - t.hits.length,
      stars: t.stars,
      done: this.isDone(t),
      finishMs: this.finishMs(t),
      points: t.points,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      answers: this.revealing ? this.rule.answersFor(this.targets) : null,
      canGiveUp: this.phase === 'play' && !this.isDone(t),
      gaveUp: this.phase === 'play' && t.gaveUp,
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

export const starSplat: MiniGameDefinition = {
  info: STAR_SPLAT,
  create: (ctx, modeId, options) => new StarSplat(ctx, options.puzzles, modeId),
};
