import {
  AIM_MS,
  BLAST_MS,
  FIELD_H,
  FIELD_W,
  FIELDS,
  POP_CHAIN,
  chainFrom,
  dotsFor,
  type Chain,
  type PopAim,
  type PopBoardState,
  type PopInput,
  type PopPlayerState,
  type PopRound,
} from '../../shared/games/popChain';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { VolleyGame } from './volleys';

export interface Popper {
  total: number;
  chain: Chain | null;
  /** This field's popped count (shown after it plays). */
  last: number;
}

class PopChain extends VolleyGame<Popper, PopBoardState, PopPlayerState, PopAim, PopRound> {
  private startedAt = 0;

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { volleys: FIELDS, aimMs: AIM_MS, freshAims: true });
  }

  protected newBoard(): Popper {
    return { total: 0, chain: null, last: 0 };
  }

  protected beforeVolley(p: Popper) {
    p.chain = null;
    this.startedAt = Date.now();
  }

  protected defaultAim(): PopAim {
    return { x: FIELD_W / 2, y: FIELD_H / 2, at: null };
  }

  protected readAim(raw: unknown): PopAim | null {
    const input = raw as PopInput;
    if (input.type !== 'fire' || ![input.x, input.y, input.at].every(Number.isFinite)) return null;
    return { x: Math.max(0, Math.min(FIELD_W, input.x)), y: Math.max(0, Math.min(FIELD_H, input.y)), at: Math.max(0, Math.min(AIM_MS, input.at)) };
  }

  protected shoot(shots: { board: Popper; aim: PopAim }[]) {
    const dots = dotsFor(this.seed, this.volleyIndex);
    let longest = 0;
    for (const { board, aim } of shots) {
      const chain = chainFrom(dots, aim.x, aim.y, aim.at ?? AIM_MS);
      board.chain = chain;
      board.last = chain.popped.filter((t) => t >= 0).length;
      board.total += board.last;
      const end = Math.max(...chain.blasts.filter((_, i) => i % 3 === 2)) + BLAST_MS - (aim.at ?? AIM_MS);
      longest = Math.max(longest, end);
    }
    return longest;
  }

  protected boardScore(p: Popper) {
    return p.total;
  }

  protected hostState(p: Popper, aim: PopAim): PopBoardState {
    return { chain: this.phase === 'fly' ? p.chain : null, total: p.total, field: p.last, tapped: aim.at !== null };
  }

  protected playerState(p: Popper): PopPlayerState {
    return { total: p.total, field: this.volleyIndex, startedAt: this.startedAt };
  }

  protected roundState(): PopRound {
    return { startedAt: this.startedAt, field: this.volleyIndex };
  }
}

export const popChain: MiniGameDefinition = {
  info: POP_CHAIN,
  create: (ctx, _modeId, options) => new PopChain(ctx, options.puzzles),
};
