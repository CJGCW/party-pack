import {
  MAX_LEVEL,
  MICROGAMES,
  PLAY_GRACE_MS,
  WOOCHAWARE,
  findMicrogame,
  playTime,
  type MicrogameInfo,
  type WoochaHostView,
  type WoochaInput,
  type WoochaPhase,
  type WoochaPlayerView,
} from '../../shared/games/woochaware';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';

/** Microgames in each stage; one stage per "puzzle" in the session settings. */
const PER_STAGE = 5;
/** Points per microgame won, so a perfect stage is worth 1,000 (the shared puzzle scale). */
const POINTS_PER_WIN = 200;
/** The command on its own, before the microgame starts. */
const INTRO_MS = 1_600;
/** Extra intro time when the speed goes up, to announce it. */
const SPEED_UP_MS = 900;
/** Extra intro time for motion games (to read how to hold the phone), and more to turn it sideways. */
const MOTION_INTRO_MS = 600;
const LANDSCAPE_INTRO_MS = 1_200;
/** Who made it, between microgames. */
const RESULT_MS = 1_500;
/** Debug practice plays the chosen microgame once at each level. */
const PRACTICE_ROUNDS = MAX_LEVEL;

/** Dealt from a shuffled deck, so microgames don't repeat until all have come up. */
let deck: MicrogameInfo[] = [];
function dealMicrogame(avoid?: string): MicrogameInfo {
  if (deck.length === 0) deck = shuffle([...MICROGAMES]);
  // Don't play the same one twice in a row across a reshuffle.
  if (deck.length > 1 && deck[deck.length - 1].id === avoid) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
  return deck.pop()!;
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

class WoochaWare implements MiniGame {
  private phase: WoochaPhase = 'intro';
  private round = 0;
  private readonly totalRounds: number;
  private readonly totalStages: number;
  private microgame!: MicrogameInfo;
  private level = 1;
  private seed = 0;
  /** This microgame's results so far. */
  private results = new Map<string, boolean>();
  private stageWins = new Map<string, number>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    stages: number,
    /** Debug practice: only this microgame. */
    private readonly practiceId: string | null,
  ) {
    this.totalStages = practiceId ? 1 : stages;
    this.totalRounds = practiceId ? PRACTICE_ROUNDS : stages * PER_STAGE;
  }

  private get perStage() {
    return this.practiceId ? PRACTICE_ROUNDS : PER_STAGE;
  }

  private get stage() {
    return Math.floor(this.round / this.perStage) + 1;
  }

  /** Speeds up over the game: the first third at level 1, then 2, then 3. */
  private levelFor(round: number) {
    if (this.practiceId) return round + 1;
    return Math.min(MAX_LEVEL, 1 + Math.floor((MAX_LEVEL * round) / this.totalRounds));
  }

  start() {
    this.startMicrogame(0);
  }

  private setPhase(phase: WoochaPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startMicrogame(round: number) {
    this.round = round;
    if (round % this.perStage === 0) this.stageWins.clear();
    this.microgame = this.practiceId ? findMicrogame(this.practiceId)! : dealMicrogame(this.microgame?.id);
    this.level = this.levelFor(round);
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.results.clear();
    const extra =
      (this.speedUp ? SPEED_UP_MS : 0) +
      (this.microgame.controls ? MOTION_INTRO_MS : 0) +
      (this.microgame.landscape ? LANDSCAPE_INTRO_MS : 0);
    this.setPhase('intro', INTRO_MS + extra, () =>
      this.setPhase('play', playTime(this.microgame, this.level) + PLAY_GRACE_MS, () => this.showResult()),
    );
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as WoochaInput;
    if (this.phase !== 'play' || input?.type !== 'result' || input.round !== this.round) return;
    if (this.results.has(playerId)) return; // first result counts
    const won = input.won === true;
    this.results.set(playerId, won);
    if (won) {
      const points = this.practiceId ? 0 : POINTS_PER_WIN;
      this.stageWins.set(playerId, (this.stageWins.get(playerId) ?? 0) + 1);
      this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + points);
      if (points) this.ctx.addScore(playerId, points);
    }
    // Move on as soon as everyone still here is done.
    const connected = this.ctx.players().filter((p) => p.connected);
    if (connected.every((p) => this.results.has(p.id))) this.showResult();
    else this.syncAll();
  }

  private showResult() {
    // Anyone who never reported (dropped out, phone asleep) missed it.
    for (const p of this.ctx.players()) if (!this.results.has(p.id)) this.results.set(p.id, false);
    const isLast = this.round >= this.totalRounds - 1;
    const endsStage = (this.round + 1) % this.perStage === 0;
    this.setPhase('result', RESULT_MS, () => {
      if (this.practiceId) {
        if (isLast) this.ctx.finish();
        else this.startMicrogame(this.round + 1);
      } else if (endsStage) {
        this.setPhase('stageEnd', PUZZLE_RESULT_MS, () => {
          if (!isLast) this.startMicrogame(this.round + 1);
          // With a single stage, round scores would just repeat the stage results.
          else if (this.totalStages === 1) this.ctx.finish();
          else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
        });
      } else {
        this.startMicrogame(this.round + 1);
      }
    });
  }

  /** Faster than the microgame before it. */
  private get speedUp() {
    return this.round > 0 && this.level > this.levelFor(this.round - 1);
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  private base() {
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      stage: this.stage,
      totalStages: this.totalStages,
      microgameId: this.microgame.id,
      level: this.level,
      seed: this.seed,
      durationMs: playTime(this.microgame, this.level),
      msLeft: this.msLeft(),
      practice: this.practiceId !== null,
      speedUp: this.phase === 'intro' && this.speedUp,
      perStage: this.perStage,
    };
  }

  syncHost() {
    const view: WoochaHostView = {
      ...this.base(),
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
        result: this.results.get(p.id) ?? null,
        stageWins: this.stageWins.get(p.id) ?? 0,
      })),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const view: WoochaPlayerView = {
      ...this.base(),
      myResult: this.results.get(playerId) ?? null,
      stageWins: this.stageWins.get(playerId) ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
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

export const woochaware: MiniGameDefinition = {
  info: WOOCHAWARE,
  create: (ctx, _modeId, options) => new WoochaWare(ctx, options.puzzles, options.microgame ?? null),
};
