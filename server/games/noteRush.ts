import {
  GOOD_MS,
  HIT_POINTS,
  LANES,
  NOTE_RUSH,
  OK_MS,
  PERFECT_MS,
  ROUND_MS,
  STRAY_COST,
  chartFor,
  type Hit,
  type Note,
  type NoteInput,
  type NotePlayerState,
  type NoteRound,
  type NoteState,
} from '../../shared/games/noteRush';
import { BoardsGame, READY_MS } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

/** A tap's stamp is trusted if it's within this of when it arrived (else it's taken as arriving now). */
const STAMP_SLACK_MS = 1_500;

export interface Player {
  chart: Note[];
  hit: Set<number>;
  points: number;
  combo: number;
  best: number;
  judged: Hit | null;
  judgedLane: number;
  judgedId: number;
}

export const newPlayer = (seed: number, round: number): Player => ({ chart: chartFor(seed, round), hit: new Set(), points: 0, combo: 0, best: 0, judged: null, judgedLane: 0, judgedId: 0 });

/** Judges a tap on `lane`, `t` ms after the epoch: the nearest note not yet hit in that lane, if near enough. */
export function tapNote(p: Player, lane: number, t: number): Hit {
  p.judgedId++;
  p.judgedLane = lane;
  let best = -1;
  let off = Infinity;
  p.chart.forEach((n, i) => {
    if (n.lane !== lane || p.hit.has(i)) return;
    const d = Math.abs(n.at - t);
    if (d < off) [best, off] = [i, d];
  });
  if (best < 0 || off > OK_MS) {
    p.points = Math.max(0, p.points - STRAY_COST);
    p.combo = 0;
    return (p.judged = 'stray');
  }
  p.hit.add(best);
  const kind: Hit = off <= PERFECT_MS ? 'perfect' : off <= GOOD_MS ? 'good' : 'ok';
  p.combo++;
  p.best = Math.max(p.best, p.combo);
  // A combo of 10 or more adds a little to every hit.
  p.points += HIT_POINTS[kind as 'perfect'] + Math.min(20, Math.floor(p.combo / 10) * 5);
  return (p.judged = kind);
}

/** Notes that have gone by unhit break the combo. */
export function passNotes(p: Player, t: number) {
  if (p.chart.some((n, i) => !p.hit.has(i) && n.at < t - OK_MS && n.at >= t - OK_MS - 200)) p.combo = 0;
}

class NoteRush extends BoardsGame<Player, NoteState, NotePlayerState, NoteRound> {
  private round: NoteRound = { epoch: 0, round: 0 };

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: 5 });
  }

  /** The song starts with play (after the countdown). */
  protected beforeRound() {
    this.round = { epoch: Date.now() + READY_MS, round: this.puzzleIndex };
  }

  protected roundState() {
    return this.round;
  }

  protected newBoard(seed: number) {
    return newPlayer(seed, this.puzzleIndex);
  }

  protected stepBoard(p: Player) {
    passNotes(p, Date.now() - this.round.epoch);
    return false;
  }

  protected boardInput(p: Player, raw: unknown) {
    const input = raw as NoteInput;
    if (input.type !== 'tap' || this.phase !== 'play' || !Number.isInteger(input.lane) || input.lane < 0 || input.lane >= LANES) return false;
    const now = Date.now();
    const at = Number.isFinite(input.at) && input.at <= now + 50 && input.at >= now - STAMP_SLACK_MS ? input.at : now;
    tapNote(p, input.lane, at - this.round.epoch);
    return true;
  }

  protected boardScore(p: Player) {
    return p.points;
  }

  protected hostState(p: Player): NoteState {
    return { points: p.points, combo: p.combo, best: p.best, hit: [...p.hit], judged: p.judged, judgedLane: p.judgedLane, judgedId: p.judgedId };
  }

  protected playerState(p: Player): NotePlayerState {
    return { ...this.hostState(p), hit: [], ...this.round };
  }
}

export const noteRush: MiniGameDefinition = {
  info: NOTE_RUSH,
  create: (ctx, _modeId, options) => new NoteRush(ctx, options.puzzles),
};
