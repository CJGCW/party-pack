import {
  FIRE_MS,
  ROUND_MS,
  SPIRAL_SHOT,
  TICK_HZ,
  TRACKS,
  chainSpeed,
  type SpiralBoardState,
  type SpiralInput,
  type SpiralPlayerState,
  type SpiralRound,
  type Track,
} from '../../shared/games/spiralShot';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { Board, seededRandom } from './spiralShot/board';

// A side-by-side boards game (see ./boards), scored by survival: surviving the round is worth the
// full 1,000 (everyone who does gets it); going out earlier scores up to 700, by how long you
// lasted, so the last one standing beats everyone who went before them.

class SpiralShot extends BoardsGame<Board, SpiralBoardState, SpiralPlayerState, SpiralRound> {
  private track: Track = TRACKS[0];

  constructor(ctx: GameContext, totalPuzzles: number) {
    // The TV gets every tick, so turrets follow their phones closely.
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'survival', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  /** Everyone's on the same track, a different one from last round (as long as there's more than one). */
  protected beforeRound() {
    const others = TRACKS.filter((t) => t !== this.track || TRACKS.length === 1);
    const pool = this.puzzleIndex === 0 ? TRACKS : others;
    this.track = pool[Math.floor(Math.random() * pool.length)];
  }

  /** Everyone's chain comes in the same colours; their turrets' colours are their own. */
  protected newBoard(seed: number, index: number) {
    return new Board(this.track, seededRandom(seed), seededRandom(seed + 1 + index));
  }

  protected stepBoard(board: Board, dt: number, roundMs: number) {
    return board.step(dt, chainSpeed(roundMs, this.track), FIRE_MS);
  }

  protected boardInput(board: Board, raw: unknown) {
    const input = raw as SpiralInput;
    if (input.type === 'aim' && Number.isFinite(input.angle)) {
      board.angle = Math.atan2(Math.sin(input.angle), Math.cos(input.angle));
      // The tick sends the aim on to the TV.
      return false;
    }
    if (input.type === 'swap') {
      board.swap();
      return true;
    }
    return false;
  }

  protected roundState(): SpiralRound {
    return { trackId: this.track.id };
  }

  protected hostState(b: Board): SpiralBoardState {
    return {
      chain: b.chain.flatMap((m) => [m.id, Math.round(m.s * 10) / 10, m.color]),
      shots: b.shots.flatMap((s) => [s.id, Math.round(s.x), Math.round(s.y), s.color]),
      angle: Math.round(b.angle * 1000) / 1000,
      current: b.current,
      next: b.next,
      pops: b.pops,
      bestCombo: b.bestCombo,
    };
  }

  protected playerState(b: Board): SpiralPlayerState {
    return { current: b.current, next: b.next, pops: b.pops, bestCombo: b.bestCombo };
  }
}

export const spiralShot: MiniGameDefinition = {
  info: SPIRAL_SHOT,
  create: (ctx, _modeId, options) => new SpiralShot(ctx, options.puzzles),
};
