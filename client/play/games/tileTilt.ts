import { GRID, type TiltPlayerState } from '../../../shared/games/tileTilt';
import type { Controller } from '../main';
import { createTiltPad } from '../tiltPad';

/** Tip the phone like a tray to roll your shell on the TV (see ../tiltPad). */
export function createTileTilt(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createTiltPad<TiltPlayerState>(root, send, {
    scoring: 'race',
    hint: 'Hold your phone flat like a tray and tip it to roll your shell. Watch the TV!',
    dragHint: 'Drag on the level to tip the frame. Watch the TV!',
    stats: (v) => `${v.state?.flipped ?? 0} of ${GRID * GRID} tiles flipped · ${v.going} of ${v.playing} still going`,
  });
}
