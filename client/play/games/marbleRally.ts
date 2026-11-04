import type { MarbleState } from '../../../shared/games/marbleRally';
import type { Controller } from '../main';
import { createTiltPad } from '../tiltPad';

/** Tip the phone to roll your marble along the course on the TV (see ../tiltPad). */
export function createMarbleRally(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createTiltPad<MarbleState>(root, send, {
    scoring: 'race',
    hint: 'Hold your phone flat and tip it to roll your marble. Gently! Slopes push downhill; the green tiles are checkpoints.',
    dragHint: 'Drag on the level to roll your marble. Gently! Slopes push downhill; the green tiles are checkpoints.',
    stats: (v) => `${v.state?.checkpoints ?? 0} checkpoints · ${v.state?.falls ?? 0} falls${v.state?.falling ? ' · falling!' : ''}`,
    ended: () => 'You made it to the finish!',
  });
}
