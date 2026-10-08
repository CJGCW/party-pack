import type { MicrogameId } from '../../../shared/games/woochaware';
import { catchEggs, dodge, maze, pickNose, pull, saw, scan, scrub, shade, slice, sneak, trace, twirl, zip } from './dragging';
import type { MicrogameImpl } from './engine';
import { answer, bounce, cannon, flip, jump, odd, pour, pump, quickdraw, stack, swat, targets } from './tapping';

/** The phone side of every microgame in shared/games/woochaware.ts. Add new ones in both places. */
export const MICROGAME_IMPLS: Record<MicrogameId, MicrogameImpl> = {
  swat,
  pump,
  pour,
  pull,
  slice,
  trace,
  quickdraw,
  answer,
  sneak,
  catch: catchEggs,
  scrub,
  twirl,
  saw,
  jump,
  bounce,
  maze,
  odd,
  targets,
  flip,
  stack,
  shade,
  dodge,
  cannon,
  scan,
  pick: pickNose,
  zip,
};
