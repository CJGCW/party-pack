import type { HeadState } from '../../../shared/games/headBall';
import type { Controller } from '../main';
import { createTiltPad } from '../tiltPad';

/** Tip the phone left and right to run about the pitch on the TV (see ../tiltPad). */
export function createHeadBall(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createTiltPad<HeadState>(root, send, {
    scoring: 'best',
    hint: 'Hold your phone flat and tip it left and right to run. Head the balls; dodge the boots!',
    dragHint: 'Drag left and right on the level to run. Head the balls; dodge the boots!',
    stats: (v) => `${v.state?.headed ?? 0} headed${v.state && v.state.stunMs > 0 ? ' · seeing stars!' : ''}`,
    score: (v) => `${v.boardScore} headed`,
  });
}
