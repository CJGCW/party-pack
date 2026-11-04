import {
  CROWD_SPOT,
  FIND_MS,
  FINDS,
  REVEAL_MS,
  WRONG_MS,
  findFor,
  personUnder,
  type SpotAim,
  type SpotBoardState,
  type SpotInput,
  type SpotPlayerState,
  type SpotRound,
} from '../../shared/games/crowdSpot';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { VolleyGame } from './volleys';

export interface Spotter {
  points: number;
  wrong: number;
  lockedUntil: number;
}

/** A find's points: 100 for finding them, up to 100 more for being quick. */
export const findPoints = (ms: number | null) => (ms === null ? 0 : 100 + Math.round(100 * Math.max(0, 1 - ms / FIND_MS)));

class CrowdSpot extends VolleyGame<Spotter, SpotBoardState, SpotPlayerState, SpotAim, SpotRound> {
  private startedAt = 0;

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { volleys: FINDS, aimMs: FIND_MS, freshAims: true });
  }

  protected newBoard(): Spotter {
    return { points: 0, wrong: 0, lockedUntil: 0 };
  }

  protected beforeVolley(s: Spotter) {
    this.startedAt = Date.now();
    s.wrong = 0;
    s.lockedUntil = 0;
  }

  protected defaultAim(): SpotAim {
    return { foundMs: null };
  }

  /** Only the server's judgement of a tap locks a player in (see onInput). */
  protected readAim(raw: unknown): SpotAim | null {
    const input = raw as { type: string; foundMs: number };
    return input.type === 'fire' && Number.isFinite(input.foundMs) ? { foundMs: input.foundMs } : null;
  }

  /** A tap: the right person locks you in; anyone else locks you out for a moment. */
  onInput(playerId: string, raw: unknown) {
    const input = raw as SpotInput;
    const e = this.entries.get(playerId);
    if (this.phase !== 'aim' || input?.type !== 'tap' || !e || e.locked || ![input.x, input.y, input.ms].every(Number.isFinite)) return;
    const now = Date.now();
    if (now < e.board.lockedUntil) return;
    // The phone says when it was tapped (on the server's clock); it can't be later than now.
    const ms = Math.max(0, Math.min(now - this.startedAt, input.ms));
    const find = findFor(this.seed, this.volleyIndex);
    if (personUnder(find, input.x, input.y, ms) === find.answer) return super.onInput(playerId, { type: 'fire', foundMs: ms });
    e.board.wrong++;
    e.board.lockedUntil = now + WRONG_MS;
    this.syncPlayer(playerId);
    this.syncHost();
  }

  protected shoot(shots: { board: Spotter; aim: SpotAim }[]) {
    for (const { board, aim } of shots) board.points += findPoints(aim.foundMs);
    return REVEAL_MS;
  }

  protected boardScore(s: Spotter) {
    return s.points;
  }

  protected hostState(s: Spotter, aim: SpotAim): SpotBoardState {
    return { found: aim.foundMs !== null, foundMs: aim.foundMs, wrong: s.wrong, lockedMs: Math.max(0, s.lockedUntil - Date.now()) };
  }

  protected playerState(s: Spotter, aim: SpotAim): SpotPlayerState {
    return { ...this.hostState(s, aim), ...this.roundState() };
  }

  protected roundState(): SpotRound {
    return { startedAt: this.startedAt, find: this.volleyIndex, answer: this.phase === 'aim' ? null : findFor(this.seed, this.volleyIndex).answer };
  }
}

export const crowdSpot: MiniGameDefinition = {
  info: CROWD_SPOT,
  create: (ctx, _modeId, options) => new CrowdSpot(ctx, options.puzzles),
};
