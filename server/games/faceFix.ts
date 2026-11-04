import { FACE_FIX, FACES, FIX_MS, REVEAL_MS, clampFace, facesFor, matchScore, type Face, type FixAim, type FixBoardState, type FixInput, type FixPlayerState } from '../../shared/games/faceFix';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { VolleyGame } from './volleys';

export interface Fixer {
  points: number;
  face: Face | null;
  match: number | null;
}

class FaceFix extends VolleyGame<Fixer, FixBoardState, FixPlayerState, FixAim, { face: number }> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { volleys: FACES, aimMs: FIX_MS, freshAims: true });
  }

  protected newBoard(): Fixer {
    return { points: 0, face: null, match: null };
  }

  protected beforeVolley(f: Fixer) {
    f.face = f.match = null;
  }

  protected defaultAim(): FixAim {
    return { face: null };
  }

  protected readAim(raw: unknown): FixAim | null {
    const input = raw as FixInput;
    if ((input.type !== 'aim' && input.type !== 'fire') || typeof input.face !== 'object' || !input.face) return null;
    return { face: clampFace(input.face) };
  }

  protected shoot(shots: { board: Fixer; aim: FixAim }[]) {
    const { target, start } = facesFor(this.seed, this.volleyIndex);
    for (const { board, aim } of shots) {
      // Not touched at all: it's the scrambled face as it started.
      board.face = aim.face ?? start;
      board.match = matchScore(board.face, target);
      board.points += board.match;
    }
    return REVEAL_MS;
  }

  protected boardScore(f: Fixer) {
    return f.points;
  }

  protected hostState(f: Fixer, aim: FixAim): FixBoardState {
    const reveal = this.phase !== 'aim';
    return { done: aim.face !== null, face: reveal ? f.face : null, match: reveal ? f.match : null };
  }

  protected playerState(f: Fixer): FixPlayerState {
    return { start: facesFor(this.seed, this.volleyIndex).start, face: this.volleyIndex, match: this.phase === 'aim' ? null : f.match };
  }

  protected roundState() {
    return { face: this.volleyIndex };
  }
}

export const faceFix: MiniGameDefinition = {
  info: FACE_FIX,
  create: (ctx, _modeId, options) => new FaceFix(ctx, options.puzzles),
};
