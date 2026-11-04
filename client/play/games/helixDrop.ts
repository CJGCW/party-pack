import type { HelixPlayerState } from '../../../shared/games/helixDrop';
import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

const rings = (n: number) => `${n} ${n === 1 ? 'ring' : 'rings'} down`;

/** Spin the tower on the TV (see ../steerPad). */
export function createHelixDrop(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad<HelixPlayerState>(root, send, {
    scoring: 'best',
    hint: 'Turn your phone like a steering wheel to spin the tower; drop the ball through the gaps and keep it off the red. (Lying flat? Tilt it.)',
    dragHint: 'Drag left and right on the dial to spin the tower; drop the ball through the gaps and keep it off the red.',
    stats: (v) => rings(v.state?.rings ?? 0),
    score: (v) => rings(v.boardScore),
  });
}
