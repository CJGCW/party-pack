import type { Controller } from '../main';
import { createTiltPad } from '../tiltPad';

/** Tip the phone to roll about the yard and grab fruit (see ../tiltPad). */
export function createFruitRush(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createTiltPad<{ score: number }>(root, send, {
    scoring: 'best',
    hint: 'Hold your phone flat and tip it to roll. Grab the fruit; ram the others to knock theirs loose!',
    dragHint: 'Drag on the level to roll. Grab the fruit; ram the others to knock theirs loose!',
    stats: (v) => `${v.state?.score ?? 0} fruit`,
    score: (v) => `${v.boardScore} fruit`,
  });
}
