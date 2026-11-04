import {
  FRAME,
  GRID,
  ROUND_MS,
  TICK_HZ,
  TILE_TILT,
  pictureFor,
  rollShell,
  tileAt,
  type Shell,
  type TiltBoardState,
  type TiltInput,
  type TiltPlayerState,
  type TiltRound,
} from '../../shared/games/tileTilt';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Frame {
  shell: Shell;
  tilt: { x: number; y: number };
  /** Which tiles are face up, by tile index. */
  flipped: boolean[];
  count: number;
}

/** A new frame: every tile face down, the shell resting in the middle (that tile starts face up). */
export function newFrame(): Frame {
  const middle = FRAME.x + FRAME.size / 2;
  const f: Frame = { shell: { x: middle, y: middle, vx: 0, vy: 0 }, tilt: { x: 0, y: 0 }, flipped: new Array(GRID * GRID).fill(false), count: 0 };
  flipUnder(f);
  return f;
}

/** Flips the tile under the shell. Returns true once every tile's face up. */
export function flipUnder(f: Frame) {
  const t = tileAt(f.shell.x, f.shell.y);
  if (!f.flipped[t]) {
    f.flipped[t] = true;
    f.count++;
  }
  return f.count === GRID * GRID;
}

/** Rolls a frame's shell on, a few small steps a tick so it can't skip over a tile. Returns true when every tile's flipped. */
export function stepFrame(f: Frame, dt: number) {
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    rollShell(f.shell, f.tilt, dt / steps);
    if (flipUnder(f)) return true;
  }
  return false;
}

class TileTilt extends BoardsGame<Frame, TiltBoardState, TiltPlayerState, TiltRound> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'race', tickHz: TICK_HZ });
  }

  protected newBoard() {
    return newFrame();
  }

  protected stepBoard(f: Frame, dt: number) {
    return stepFrame(f, dt);
  }

  protected boardInput(f: Frame, raw: unknown) {
    const input = raw as TiltInput;
    if (input.type !== 'tilt' || !Number.isFinite(input.x) || !Number.isFinite(input.y)) return false;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    f.tilt = { x: clamp(input.x), y: clamp(input.y) };
    return false;
  }

  protected boardProgress(f: Frame) {
    return f.count / (GRID * GRID);
  }

  protected boardScore(f: Frame) {
    return f.count;
  }

  protected roundState(): TiltRound {
    return { picture: pictureFor(this.seed) };
  }

  protected hostState(f: Frame): TiltBoardState {
    const flipped = Array.from({ length: GRID }, (_, row) => f.flipped.slice(row * GRID, row * GRID + GRID).reduce((bits, up, col) => bits | (up ? 1 << col : 0), 0));
    return { x: Math.round(f.shell.x), y: Math.round(f.shell.y), flipped };
  }

  protected playerState(f: Frame): TiltPlayerState {
    return { flipped: f.count };
  }
}

export const tileTilt: MiniGameDefinition = {
  info: TILE_TILT,
  create: (ctx, _modeId, options) => new TileTilt(ctx, options.puzzles),
};
