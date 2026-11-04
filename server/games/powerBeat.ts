import {
  GOOD_MS,
  MASH_PER_BEAT,
  OVERLOAD_MS,
  PERFECT_MS,
  POINTS,
  POWER_BEAT,
  ROUND_MS,
  STREAK_BONUS,
  STREAK_STEP,
  offBeat,
  periodMs,
  tempoFor,
  type BeatInput,
  type BeatPlayerState,
  type BeatRound,
  type BeatState,
  type Judgement,
} from '../../shared/games/powerBeat';
import { BoardsGame, READY_MS } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

/** A tap's stamp is trusted if it's within this of when it arrived (else it's taken as arriving now). */
const STAMP_SLACK_MS = 1_500;

export interface Generator {
  power: number;
  streak: number;
  judged: Judgement | null;
  judgedId: number;
  overloadedUntil: number;
  /** Recent taps (server time), to catch mashing. */
  taps: number[];
}

export const newGenerator = (): Generator => ({ power: 0, streak: 0, judged: null, judgedId: 0, overloadedUntil: 0, taps: [] });

/** Judges a tap made at server time `at` against the beat. */
export function judge(g: Generator, at: number, round: BeatRound): Judgement {
  g.judgedId++;
  if (at < g.overloadedUntil) return (g.judged = 'overload');
  g.taps = [...g.taps.filter((t) => t > at - 1000), at];
  if (g.taps.length > (1000 / round.period) * MASH_PER_BEAT) {
    g.overloadedUntil = at + OVERLOAD_MS;
    g.streak = 0;
    g.taps = [];
    return (g.judged = 'overload');
  }
  const off = offBeat(at, round.epoch, round.period);
  const kind: Judgement = off <= PERFECT_MS ? 'perfect' : off <= GOOD_MS ? 'good' : 'off';
  g.power += POINTS[kind];
  if (kind === 'off') g.streak = 0;
  else if (++g.streak % STREAK_STEP === 0) g.power += STREAK_BONUS;
  return (g.judged = kind);
}

class PowerBeat extends BoardsGame<Generator, BeatState, BeatPlayerState, BeatRound> {
  private round: BeatRound = { epoch: 0, period: 600 };

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: 0 });
  }

  /** The beat starts with play (after the countdown). */
  protected beforeRound() {
    this.round = { epoch: Date.now() + READY_MS, period: periodMs(tempoFor(this.puzzleIndex)) };
  }

  protected roundState() {
    return this.round;
  }

  protected newBoard() {
    return newGenerator();
  }

  protected boardInput(g: Generator, raw: unknown) {
    const input = raw as BeatInput;
    if (input.type !== 'tap' || this.phase !== 'play') return false;
    const now = Date.now();
    const at = Number.isFinite(input.at) && input.at <= now + 50 && input.at >= now - STAMP_SLACK_MS ? input.at : now;
    judge(g, at, this.round);
    return true;
  }

  protected boardScore(g: Generator) {
    return g.power;
  }

  protected hostState(g: Generator): BeatState {
    return { power: g.power, streak: g.streak, judged: g.judged, judgedId: g.judgedId, overloadMs: Math.max(0, g.overloadedUntil - Date.now()) };
  }

  protected playerState(g: Generator): BeatPlayerState {
    return { ...this.hostState(g), ...this.round };
  }
}

export const powerBeat: MiniGameDefinition = {
  info: POWER_BEAT,
  create: (ctx, _modeId, options) => new PowerBeat(ctx, options.puzzles),
};
