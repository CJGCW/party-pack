import type { Controller } from '../main';
import { createTiltPad } from '../tiltPad';

/** Tip the phone to roll your ball on the TV (see ../tiltPad). */
export function createBumpRing(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createTiltPad(root, send, {
    scoring: 'survival',
    hint: 'Hold your phone flat and tip it to roll. Ram the others off the edge, and stay on yourself!',
    dragHint: 'Drag on the level to roll. Ram the others off the edge, and stay on yourself!',
    stats: (v) => `${v.going} of ${v.playing} still on`,
    ended: (v) => (v.endedAtMs !== null ? `Knocked off at ${Math.floor(v.endedAtMs / 1000)}s` : ''),
  });
}
