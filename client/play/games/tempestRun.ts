import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

/** Steer round the rim of the tube on the TV (see ../steerPad). */
export function createTempestRun(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad(root, send, {
    scoring: 'survival',
    hint: 'Turn your phone like a steering wheel to slide round the rim; dodge what climbs up your lane. (Lying flat? Tilt it.)',
    dragHint: 'Drag left and right on the dial to slide round the rim; dodge what climbs up your lane.',
    stats: (v) => `${v.going} of ${v.playing} still in`,
    ended: (v) => (v.endedAtMs !== null ? `Hit at ${Math.floor(v.endedAtMs / 1000)}s` : ''),
  });
}
