import type { HopPlayerState } from '../../../shared/games/skyHop';
import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

/** Steer your hopper on the TV left and right (see ../steerPad). */
export function createSkyHop(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad<HopPlayerState>(root, send, {
    scoring: 'best',
    hint: 'Turn your phone like a steering wheel to move left and right; you bounce by yourself. Off one side, on the other. (Lying flat? Tilt it.)',
    dragHint: 'Drag left and right on the dial to move; you bounce by yourself. Off one side, on the other.',
    stats: (v) => `${v.state?.metres ?? 0} m up`,
    score: (v) => `${v.boardScore} m up`,
  });
}
